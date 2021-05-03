import express from "express";
import { ApolloServer, gql } from "apollo-server-express";
import yeoman from "yeoman-environment";

const env = yeoman.createEnv();
env.lookup();

const typeDefs = gql`
    type Query {
        hello: String
    }
    type Mutation {
        generate: String
    }
`;

const resolvers = {
    Query: {
        hello: () => "Hello world!",
    },
    Mutation: {
        generate: async (_, {}, { dataSources }) => {
            const pages = [
                {
                    uniqueName: "Page 1",
                    inputs: [],
                    layout: [
                        {
                            id: "3872977d-ef84-4cec-9a6b-e79b0114e7b3",
                            componentId: "main",
                            config: {},
                            children: ["09e48e1d-388a-40d3-8407-edfa21b3e479"],
                        },
                        {
                            id: "09e48e1d-388a-40d3-8407-edfa21b3e479",
                            componentId: "grid",
                            config: {amount:3},
                            children: [
                                "3e80553c-5433-4b48-bb0a-cc333f1dd76d",
                                null,
                                "8a956590-c690-4b9f-a588-111bccd0612c",
                            ],
                        },
                        {
                            id: "8a956590-c690-4b9f-a588-111bccd0612c",
                            componentId: "link",
                            config: {name:'My link', url:'https://google.com/'},
                            children: [],
                        },
                        {
                            id: "3e80553c-5433-4b48-bb0a-cc333f1dd76d",
                            componentId: "label",
                            config: {name:'My label'},
                            children: [],
                        },
                    ],
                },
            ];
            await env.run("low-code-react", { pages: JSON.stringify(pages), output: "output" });
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
