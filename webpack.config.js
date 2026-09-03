const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config();

const isProd = process.argv.includes('--mode') && process.argv[process.argv.indexOf('--mode') + 1] === 'production';

module.exports = {
  mode: 'development',
  entry: './src/main.ts',
  devtool: isProd ? false : 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: isProd ? '/mini-mtr-3d/' : '/',
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: 'index.html',
      favicon: './assets/icon.png',
    }),
    new webpack.DefinePlugin({
      'process.env.AMAP_KEY': JSON.stringify(process.env.AMAP_KEY),
      'process.env.AMAP_SECURITY_CODE': JSON.stringify(process.env.AMAP_SECURITY_CODE)
    })
  ],
  devServer: {
    static: './dist',
    hot: true,
  }
};

