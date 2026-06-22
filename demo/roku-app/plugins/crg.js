'use strict';
// Local wrapper — passes options to brighterscript-plugin-crg.
// bsconfig.json plugins must be plain strings in v1, so options live here.
const crgPlugin = require('../../../packages/brighterscript-plugin-crg/dist/index').default;

module.exports = () => crgPlugin({
  dbPath: '../exports/bsc-plugin/graph.db',
});
