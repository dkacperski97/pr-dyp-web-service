import Webpack from 'webpack';
// import WebpackDevServer from 'webpack-dev-server';
import webpackConfig from './output/webpack.common.js'; // TODO: dynamiczne wczytywanie po każdej generacji
webpackConfig.devServer.hot = false;
// console.log(webpackConfig)
console.log(process.env.OUTPUT_PATH)

let compiler 
try {
  compiler  = Webpack(webpackConfig);
} catch (e) {
  console.log(e)
}

export const run = () => {
  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      // console.log(stats.compilation)
      console.log(stats.compilation.errors)
      if (err) {
        console.log(err)
        reject();
      }
      console.log("finish")
      resolve();
    })
  })
}

// run();

// const devServerOptions = { ...webpackConfig.devServer, open: true };
// const server = new WebpackDevServer(devServerOptions, compiler);

// export const startServer = async () => {
//   console.log('Starting webpack-dev-server...');
//   await server.start();
// };
