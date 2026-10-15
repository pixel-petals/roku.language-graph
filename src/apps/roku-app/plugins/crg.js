'use strict';
// Local wrapper — passes options to bsc-graph.
// bsconfig.json plugins must be plain strings in v1, so options live here.
const crgPlugin = require('../../../packages/code-review-graph/.artifacts/dist/index').default;

module.exports = () => crgPlugin({
  dbPath: '.artifacts/bsc-plugin/graph.db',
});
