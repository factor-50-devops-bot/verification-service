module.exports = {
  entry : "./getValidation/index.js",
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {}
      }
    ]
  }
}
