const path = require("path");

module.exports = {
  mode: "development",
  entry: path.resolve(__dirname, "verifier-entry.js"),
  output: {
    filename: "thehulk-dom-clobber-verifier.bundle.js",
    path: path.resolve(__dirname, "output-full/build"),
  },
};
