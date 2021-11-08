import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import yeoman from "yeoman-environment";
import mongodb from "mongodb";
import { Adapter } from './adapter';
import * as builder from './image-builder';
import { Volume } from 'memfs';
import fs from 'fs';
import * as wp from './webpack';

let child;
const { MongoClient } = mongodb;
const env = yeoman.createEnv(undefined, undefined, new Adapter());
env.lookup();

const url = 'mongodb://root:example@localhost:27017';
const client = new MongoClient(url);
let db;
client.connect(function(err) {
    console.log(err || 'Connected successfully to server')
    db = client.db('editor');
    // client.close();
});

const typeDefs = gql`
    type Query {
        site(value: String): String
        image(tag: String, port: Int): String
    }
    type Mutation {
        generate: String
    }
`;

const resolvers = {
    Query: {
        site: async (parent, args, context, info) => {
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({ id: 'site' });
            if (site) {
                const updateDocument = {
                    $set: {
                        value: args.value,
                    },
                };
                const result = await siteCol.updateOne(site, updateDocument);
            } else {
                const result = await siteCol.insertOne({ id: 'site', value: args.value });
            }
            return "";
        },
        image: async (parent, args, context, info) => {
            const vol = Volume.fromJSON({});
            const image = builder.init(args);
            await builder.getLayers(fs, image);
            if (args.tag.indexOf("node") !== -1) {
                await builder.addNodeModules(fs, image);
                try {
                    await builder.addFiles(fs, image, {'/home/node/app':"./output"}, { ignores: ["**/node_modules/**"]})
                } catch(e) {
                    console.log(e)
                }
            } else {
                try {
                    await wp.run();
                    await builder.addFiles(fs, image, {'/usr/share/nginx/html':"./dist"})
                    await builder.addFiles(fs, image, {'/etc/nginx/templates':"./templates"})
                } catch(e) {
                    console.log(e)
                }
            }
            console.log('save')
            const imageData = await builder.save(fs, image, args)
            console.log(imageData.slice(0, 50), imageData.slice(-50))
            return imageData;
        }
    },
    Mutation: {
        generate: async (_, {}, { dataSources }) => {
            if (child) {
                const exitCode = new Promise( (resolve, reject) => {
                    child.on('close', resolve);
                    child.on('exit', resolve);
                    child.kill('SIGINT');
                });
                await exitCode;
                // child.destroy();
            }
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({ id: 'site' });
            // try {
            //     fs.rmdirSync("output/src", { recursive: true });
            // } catch (e) {
            //     console.log(e)
            // }
            await env.run("low-code-react", { site: site.value, output: "output" });
            return;
        },
    },
};

// resolvers.Query.image(undefined, { tag: "nginx:1.20.1-alpine", port: 3456 })
// resolvers.Query.image(undefined, { tag: "node:16-alpine", port: 3456 })

const server = new ApolloServer({ typeDefs, resolvers });

const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
    console.log("Now browse to http://localhost:4000" + server.graphqlPath)
);

// wp.startServer();