'use strict';
// Local wrapper — passes options to bsc-graph.
// bsconfig.json plugins must be plain strings in v1, so options live here.
const crgPlugin = require('../../../packages/bsc-graph/dist/index').default;

module.exports = () => crgPlugin({
  dbPath: '../exports/bsc-plugin/graph.db',
});
