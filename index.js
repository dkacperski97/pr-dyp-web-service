import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import yeoman from "yeoman-environment";
import mongodb from "mongodb";
import { Adapter } from './adapter';
import * as builder from './image-builder';
import { Volume } from 'memfs';
import fs from 'fs';
import * as wp from './webpack';
import * as lint from './lint';

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
        sites: [String]
        firstSite: String
        site(id: String): String
    }
    type Mutation {
        image(tag: String, port: Int): String
        site(value: String): String
        deleteSite(id: String): String
        generate(id: String): String
    }
`;

const resolvers = {
    Query: {
        sites: async (parent, args, context, info) => {
            const siteCol = db.collection('site');
            const sites = await siteCol.find({}).toArray();
            console.log(sites)
            return sites.map(s => s.id);
        },
        firstSite: async (parent, args, context, info) => {
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({});
            console.log(site.value)
            return site.value;
        },
        site: async (parent, args, context, info) => {
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({ id: args.id });
            console.log(site.value)
            return site.value;
        }
    },
    Mutation: {
        site: async (parent, args, context, info) => {
            const value = JSON.parse(args.value);
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({ id: value.id });
            if (site) {
                const updateDocument = {
                    $set: {
                        value: args.value,
                    },
                };
                console.log("UPDATE SITE")
                const result = await siteCol.updateOne(site, updateDocument);
            } else {
                console.log("INSERT SITE")
                const result = await siteCol.insertOne({ id: value.id, value: args.value });
            }
            return "";
        },
        deleteSite: async (parent, args, context, info) => {
            const siteCol = db.collection('site');
            await siteCol.deleteMany({ id: args.id });
            return "";
        },
        generate: async (_, args, { dataSources }) => {
            console.log("GENERATE")
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({ id: args.id });
            await env.run("low-code-react", { site: site.value, output: "output" });
            return;
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
};

// resolvers.Query.image(undefined, { tag: "nginx:1.20.1-alpine", port: 3456 })
// resolvers.Query.image(undefined, { tag: "node:16-alpine", port: 3456 })
// try {
// lint.run()
// } catch(e) {
//     console.log(e)
// }
const server = new ApolloServer({ typeDefs, resolvers });

const app = express();
server.applyMiddleware({ app, bodyParserConfig: {limit: '100mb'} });

app.listen({ port: 4000 }, () =>
    console.log("Now browse to http://localhost:4000" + server.graphqlPath)
);

// wp.startServer();