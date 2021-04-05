import express from 'express';
import { ApolloServer, gql } from 'apollo-server-express';
 
const typeDefs = gql`
  type Query {
    hello: String
  }
  type Mutation {
    generate(): void
  }
`;
 
const resolvers = {
  Query: {
    hello: () => 'Hello world!',
  },
  Mutation: {
    generate: async (_, { }, { dataSources }) => {
      await dataSources.userAPI.findOrCreateUser({ email });
      return;
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
 
const app = express();
server.applyMiddleware({ app });
 
app.listen({ port: 4000 }, () =>
  console.log('Now browse to http://localhost:4000' + server.graphqlPath)
);