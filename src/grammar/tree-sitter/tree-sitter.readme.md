# tree-sitter

Reserved for direct tree-sitter grammar tooling (validating/testing
`packages/graphify/grammar.js` outside the native addon build).

Not used for parsing — `src/parse/roku-app` parses via the `brighterscript`
compiler instead. `packages/graphify` still owns the tree-sitter grammar
definition and native binding as a standalone integration package.

Empty until there's a concrete need.
