import { defineConfig } from 'eslint/config'
import { config } from '@px-petals/web.config/eslint'

export default defineConfig([
  // a checked-in sample of the graphify studio's minified build output
  ...config({ ignores: [ 'src/apps/roku-app/.docs/exports/studio/assets/**' ] }),
  {
    // tree-sitter evaluates grammar.js with its grammar DSL as globals
    files: [ 'src/packages/graphify/grammar.js' ],
    languageOptions: {
      globals: Object.fromEntries([ 'grammar', 'seq', 'choice', 'optional', 'repeat', 'repeat1', 'prec', 'field', 'token', 'alias', 'blank' ].map((name) => [ name, 'readonly' ])),
    },
  },
])
