"use strict";
import { Image, pack } from 'container-image-builder';
import { createHash } from 'crypto';
import zlib from "zlib";
import fs from 'fs';
import tar from 'tar';
import request from "request";
import urlModule from "url";
const root = "./tmp2"

function checkFileExists(file) {
    return fs.promises.access(file, fs.constants.F_OK)
             .then(() => true)
             .catch(() => false)
}

function blob(client, digest) {
    return new Promise((resolve, reject) => {
        const url = `${client._protocol}://${client._registry}/v2/${client._repository}/blobs/${digest}`;
        let loop = 0;
        const fetch = (url) => {
            if (loop++ === 5) {
                return reject(new Error('redirect looped 5 times ' + url));
            }
            const opts = {
                url,
                headers: { Authorization: client.authHeader() },
                followRedirect: false,
                encoding: null
            };
            if (url.indexOf(`${client._protocol}://${client._registry}`) === -1) {
                delete opts.headers.Authorization;
            }
            request.get(opts, (err, res, body) => {
                if (err)
                    return reject(err);
                if (res.headers.location) {
                    return fetch(urlModule.resolve(url, res.headers.location));
                }
                if (res.statusCode !== 200) {
                    return reject(new Error('unexpected status code for ' + opts.url + ' ' +
                        res.statusCode + ' ' + body));
                }
                return resolve(body);
            });
        };
        fetch(url);
    });
}

export const init = (args) => {
    try {
        fs.rmdirSync(root, { recursive: true });
    } catch (e) {
        console.log(e)
    }
    fs.mkdir(root, () => {})
    const image = new Image(args.tag, 'my-app:latest')
    if (args.tag.indexOf("node") !== -1) {
        image.WorkingDir = "/home/node/app"
        image.Cmd = ["npm", "start"]
    } else {
        // image.WorkingDir = "/home/node/app"
        image.Cmd = ["nginx", "-g", "daemon off;"]
    }
    return image;
}

export const getLayers = async (vol, image) => {
    const client = await image.client();
    const imageData = await image.getImageData();
    for (let i = 0; i < imageData.manifest.layers.length; i++) {
        const layer = imageData.manifest.layers[i];
        console.log(`LAYER ${layer.digest}`)
        const digestFilename = layer.digest.replace("sha256:", "");
        let layerData;
        try {
            const exists = await checkFileExists(`./cache/${digestFilename}.tar`)
            if (exists) { 
                layerData = fs.readFileSync(`./cache/${digestFilename}.tar`);
            } else {
                layerData = await blob(client, layer.digest);
                fs.writeFileSync(`./cache/${digestFilename}.tar`, layerData, { encoding: "binary" });
            }
        } catch (e) {
            console.log(e)
        }
        await new Promise((resolve, reject) => {
            vol.mkdir(`${root}/${digestFilename}`, () => {
                vol.writeFileSync(`${root}/${digestFilename}/layer.tar`, layerData)
                vol.writeFileSync(`${root}/${digestFilename}/VERSION`, "1.0");
                vol.writeFileSync(`${root}/${digestFilename}/json`, JSON.stringify({
                    id: digestFilename,
                    parent: i > 0 ? imageData.manifest.layers[i - 1].digest.replace("sha256:", "") : undefined,
                    // container_config: imageData.config.container_config,
                    created: "1970-01-01T00:00:00Z",
                    os: imageData.config.os
                }));
                console.log(`LAYER ${layer.digest} resolve`)
                resolve();
            });
        });
    }
    return;
}

export const addFiles = async (vol, image, dir, options) => {
    return new Promise(async (resolve, reject) => {
        const tmpPath = `${root}/tmp`;
        const layerFilename = 'layer.tar';
        const layerFilepath = `${tmpPath}/${layerFilename}`;
        vol.mkdir(tmpPath, () => {
            const gzip = zlib.createGzip();
            // const tmp = vol.createWriteStream('tmp.tar');
            const out = vol.createWriteStream(layerFilepath);
            const uncompressedHash = createHash('sha256');
            let uncompressedDigest;
            let contentLength = 0;
            let digest;
            const hash = createHash('sha256');

            const tarStream = pack(dir, options);
            tarStream
                .on('error', (e) => { reject(e) })
                .on('data', (buf) => {
                    uncompressedHash.update(buf);
                })
                .on('end', () => { console.log('tar end') })
                .pipe(gzip)
                .on('error', (e) => { reject(e) })
                .on('data', (b) => {
                    // console.log('out', b)
                    hash.update(b);
                    contentLength += b.length;
                })
                .on('end', async () => {
                    console.log('gzip end')
                    uncompressedDigest = 'sha256:' + uncompressedHash.digest('hex');
                    digest = hash.digest('hex');
        
                    await image.addLayer('sha256:' + digest, uncompressedDigest, contentLength);
                })
                .pipe(out)
                .on('finish', async () => {
                    const imageData = await image.getImageData();
                    const digestPath = `${root}/${digest}`;
                    vol.mkdir(digestPath, () => {
                        vol.writeFileSync(`${digestPath}/VERSION`, "1.0");
                        const layerIndex = imageData.manifest.layers.findIndex(l => l.digest === digest);
                        vol.writeFileSync(`${digestPath}/json`, JSON.stringify({
                            id: digest,
                            parent: layerIndex > 0 ? imageData.manifest.layers[layerIndex - 1].digest.replace("sha256:", "") : undefined,
                            // container_config: imageData.config.container_config,
                    created: "1970-01-01T00:00:00Z",
                            os: imageData.config.os
                        }));
                        vol.rename(layerFilepath, `${digestPath}/${layerFilename}`, () => {
                            vol.rmdir(tmpPath, () => {
                                resolve({digest, uncompressedDigest, contentLength})
                            })
                        })
                    })
                })
        })
    });
}

export const addNodeModules = async (vol, image) => {
    const modulesPath = `./cache/node_modules`;

    const exists = await checkFileExists(modulesPath)
    if (exists) {
        const {digest, uncompressedDigest, contentLength} = JSON.parse(fs.readFileSync(`${modulesPath}/info`));
        await image.addLayer('sha256:' + digest, uncompressedDigest, contentLength);
        const digestPath = `${root}/${digest}`;
        const dest = `${modulesPath}/${digest}`;
        vol.mkdir(digestPath, () => {
            fs.copyFileSync(`${dest}/layer.tar`, `${digestPath}/layer.tar`);
            fs.copyFileSync(`${dest}/json`, `${digestPath}/json`);
            fs.copyFileSync(`${dest}/VERSION`, `${digestPath}/VERSION`);
        });
    } else {
        const {digest, uncompressedDigest, contentLength} = await addFiles(fs, image, {'/home/node/app/node_modules':"./output/node_modules"})
        const digestPath = `${root}/${digest}`;
        const dest = `${modulesPath}/${digest}`;
        
        vol.mkdir(modulesPath, () => {
            vol.writeFileSync(`${modulesPath}/info`, JSON.stringify({ digest, uncompressedDigest, contentLength }))
            vol.mkdir(dest, () => {
                fs.copyFileSync(`${digestPath}/layer.tar`, `${dest}/layer.tar`);
                fs.copyFileSync(`${digestPath}/json`, `${dest}/json`);
                fs.copyFileSync(`${digestPath}/VERSION`, `${dest}/VERSION`);
            });
        });
    }
}

export const save = async (vol, image, args) => {
    console.log('getImageData')
    const imageData = await image.getImageData();

    console.log('vars')
    const tags = ['latest'];
    const options = {};

    console.log('sync')
    await image.syncBaseImage(options);
    //config.config?
    // ExposedPorts
    imageData.config.config.ExposedPorts = { [args.port+"/tcp"]: {} };
    imageData.config.config.Env.push("PORT="+args.port)
    imageData.config.config.Cmd = image.Cmd;
    imageData.config.config.WorkingDir = image.WorkingDir;

    const configBlob = Buffer.from(JSON.stringify(imageData.config))
    const hash = createHash('sha256');
    hash.update(configBlob);
    const digest = hash.digest('hex');
    imageData.manifest.config.digest = digest;
    imageData.manifest.config.size = configBlob.length;

    vol.writeFileSync(`${root}/${digest}.json`, JSON.stringify(imageData.config));
    vol.writeFileSync(`${root}/manifest.json`, JSON.stringify([{
        Config: `${digest}.json`,
        RepoTags: ['my-app:latest'],
        Layers: imageData.manifest.layers.map(l => l.digest.replace("sha256:", "") + "/layer.tar")
    }]));

    return await new Promise((resolve, reject) => {
        let result = [];
        try {
            tar.c(
                { gzip: false, cwd: root }, 
                ["manifest.json", `${digest}.json`, ...imageData.manifest.layers.map(l => l.digest.replace("sha256:", ""))]
            )
                .on("data", (b) => {
                    result.push(b);
                })
                .on("finish", () => {
                    console.log('save finish')
                    // fs.rmdirSync(root, { recursive: true });
                    console.log('save end')
                    let b;
                    try {
                        b = Buffer.concat(result);
                        fs.createWriteStream(root + "/my-app.tar").write(b);
                        resolve(b.toString('base64'));
                    } catch(e) {
                        console.log(e)
                        reject()
                    }
                })
        } catch (e) {
            console.log(e)
            reject()
        }
    })
}