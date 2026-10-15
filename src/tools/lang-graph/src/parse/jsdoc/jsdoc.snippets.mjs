/**
 * jsdoc.snippets.mjs
 *
 * One BrighterScript source template per declaration kind — the shape
 * `jsdoc.extract.mjs` needs to hand brighterscript-jsdocs-plugin a minimal,
 * parseable snippet (raw doc comment + a stub declaration matching the
 * real node's kind/name/params) instead of a whole file. A plain lookup
 * table keyed by `kind`, not a branching function, so adding a new
 * declaration kind is a new entry, not a new `case`.
 */

const paramList = (params) => (params ?? []).map(p => `${p.name}${p.type ? ` as ${p.type}` : ''}`).join(', ');

const functionSnippet = ({ name, commentBlock, params, isSub, returnType }) => {
  const kw = isSub ? 'sub' : 'function';
  const ret = !isSub && returnType ? ` as ${returnType}` : '';
  return `${commentBlock}\n${kw} ${name}(${paramList(params)})${ret}\nend ${kw}\n`;
};

export const SNIPPETS = {
  Function: functionSnippet,
  Method: functionSnippet,
  Class: ({ name, commentBlock }) => `${commentBlock}\nclass ${name}\nend class\n`,
  Interface: ({ name, commentBlock }) => `${commentBlock}\ninterface ${name}\nend interface\n`,
  Enum: ({ name, commentBlock }) => `${commentBlock}\nenum ${name}\nend enum\n`,
  Const: ({ name, commentBlock }) => `${commentBlock}\nconst ${name} = 0\n`,
  Field: ({ name, commentBlock, returnType }) => `class Wrapper\n${commentBlock}\n${name} as ${returnType || 'dynamic'}\nend class\n`,
};
