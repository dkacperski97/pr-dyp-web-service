import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import yeoman from "yeoman-environment";
import mongodb from "mongodb";
import fs from 'fs';
import { spawn } from 'child_process';
import { Adapter } from './adapter';
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
    }
    type Mutation {
        generate: String
    }
`;

const startApp = () => {
    console.log("====== START REACT APP ==========");

    child = spawn('node', ['./node_modules/react-scripts/scripts/start'], {
        cwd: 'output',
        env: { ...process.env, PORT: '3500' },
        // detached: true
    });
    child.stdout.on('data', (data) => {
        console.log(`stdout:\n${data}`);
    });
    child.on('error', (error) => {
        console.error(`error: ${error.message}`);
    });
    child.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
}

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
            // startApp();
            return;
        },
    },
};

const server = new ApolloServer({ typeDefs, resolvers });

const app = express();
server.applyMiddleware({ app });

app.listen({ port: 4000 }, () =>
    console.log("Now browse to http://localhost:4000" + server.graphqlPath)
);
