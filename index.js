import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import yeoman from "yeoman-environment";
import mongodb from "mongodb";
const { MongoClient } = mongodb;
const env = yeoman.createEnv();
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
            const siteCol = db.collection('site');
            const site = await siteCol.findOne({ id: 'site' });
            await env.run("low-code-react", { site: site.value, output: "output" });
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
