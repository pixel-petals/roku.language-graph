'use strict';

const Parser = require('tree-sitter');
const path = require('path');

let BrightScript;
let parser;

function getParser() {
  if (parser) return parser;

  try {
    BrightScript = require(path.join(__dirname, '..', '..', 'packages', 'tree-sitter', 'brightscript', 'bindings', 'node'));
  } catch {
    throw new Error(
      'packages/tree-sitter/brightscript native binding not found.\n' +
      'Run: npm run build-grammar'
    );
  }

  parser = new Parser();
  parser.setLanguage(BrightScript);
  return parser;
}

function parse(code) {
  return getParser().parse(code);
}

function getLanguage() {
  getParser();
  return BrightScript;
}

module.exports = { parse, getLanguage };
