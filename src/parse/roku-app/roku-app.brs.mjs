/**
 * roku-app.brs.mjs
 *
 * Extracts graph nodes/edges from a single BrightScript/BrighterScript
 * (.brs/.bs) file, using the `brighterscript` compiler's own AST — no
 * tree-sitter involved. Each node/edge carries a confidence tier
 * (RESOLVED/TEXTUAL/DECLARED) reflecting how the target was matched.
 */

import {
  ParseMode,
  WalkMode,
  createVisitor,
  isClassStatement,
  isFunctionExpression,
  isFunctionStatement,
  isMethodStatement,
  isNamespaceStatement,
  isNewExpression,
} from 'brighterscript';
import * as crypto from 'crypto';
import * as path from 'path';

const ORIGIN = { line: 0, col: 0 };

function posOf(node) {
  const start = node?.location?.range?.start;
  return start ? { line: start.line + 1, col: start.character } : ORIGIN;
}

function endLineOf(node) {
  return (node?.location?.range?.end?.line ?? -1) + 1;
}

function fileHash(contents) {
  return crypto.createHash('sha1').update(contents).digest('hex');
}

/** Resolve a callee-ish expression to a dotted name string (foo, a.b.c, ...). */
function exprText(node) {
  if (!node) return null;
  if (typeof node.getText === 'function') {
    const text = node.getText()?.trim() ?? '';
    if (text) return text;
  }
  const parts = [];
  let cur = node;
  while (cur) {
    const nameText = cur.name?.text ?? cur.tokens?.name?.text;
    if (nameText) {
      parts.unshift(nameText);
      cur = cur.obj;
    } else {
      const varName = cur.tokens?.name?.text ?? cur.name?.text;
      if (varName) parts.unshift(varName);
      break;
    }
  }
  return parts.length > 0 ? parts.join('.') : null;
}

/** Safely invoke a brighterscript resolution API that may throw on partial programs. */
function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function typeExpressionText(typeExpr) {
  return typeExpr ? exprText(typeExpr.expression) : null;
}

function namespaceOf(node) {
  const ns = node.findAncestor(isNamespaceStatement);
  return ns ? ns.getName(ParseMode.BrighterScript) : undefined;
}

function paramsJson(func) {
  const params = (func?.parameters ?? []).map(p => ({
    name: p.tokens?.name?.text ?? '',
    type: typeExpressionText(p.typeExpression) ?? undefined,
    optional: !!p.defaultValue,
  }));
  return JSON.stringify(params);
}

function isSubKeyword(func) {
  return (func?.tokens?.functionType?.text ?? '').toLowerCase() === 'sub';
}

function looksLikeTest(name, annotations) {
  if (annotations?.some(a => /test/i.test(a.name))) return true;
  return /test/i.test(name);
}

/** Class name -> ancestor chain (self first), resolved as far as the scope allows. */
function classChain(cls, containingNamespace, file, scope) {
  const chain = [{ cls, file }];
  let current = cls;
  let guard = 0;
  while (current.hasParentClass() && guard++ < 50 && scope) {
    const parentText = typeExpressionText(current.parentClassName);
    if (!parentText) break;
    const link = safe(() => scope.getClassFileLink(parentText, containingNamespace));
    if (!link?.item || chain.some(c => c.cls === link.item)) break;
    chain.push({ cls: link.item, file: link.file });
    current = link.item;
  }
  return chain;
}

function findInChain(chain, memberName, members) {
  const lower = memberName.toLowerCase();
  for (const { cls, file: clsFile } of chain) {
    const found = cls[members].find(m => (m.tokens.name?.text ?? '').toLowerCase() === lower);
    if (found) {
      const classQname = `${clsFile.srcPath}::${cls.getName(ParseMode.BrighterScript)}`;
      return { qname: `${classQname}.${found.tokens.name.text}` };
    }
  }
  return null;
}

/** Qualified name of the function/method (or synthesized anonymous name) enclosing `node`. */
function enclosingScope(node, fp, scope) {
  const enclosingFunc = node.findAncestor(isFunctionExpression);
  if (!enclosingFunc) return { qname: fp };

  const owner = enclosingFunc.parent;
  if (owner && isMethodStatement(owner)) {
    const cls = owner.findAncestor(isClassStatement);
    if (cls) {
      const ns = namespaceOf(cls);
      const chain = classChain(cls, ns, { srcPath: fp }, scope);
      const classQname = `${fp}::${cls.getName(ParseMode.BrighterScript)}`;
      return { qname: `${classQname}.${owner.tokens.name.text}`, classChain: chain };
    }
  }
  if (owner && isFunctionStatement(owner)) {
    return { qname: `${fp}::${owner.getName(ParseMode.BrighterScript)}` };
  }

  const pos = posOf(enclosingFunc);
  const outer = enclosingScope(enclosingFunc, fp, scope);
  return { qname: `${outer.qname}::<anonymous@${pos.line}:${pos.col}>`, classChain: outer.classChain };
}

function resolveCallTarget(calleeExpr, calleeText, classChainForSite, scope) {
  const obj = calleeExpr.obj;
  const memberName = calleeExpr.name?.text ?? calleeExpr.tokens?.name?.text;
  if (classChainForSite && obj && exprText(obj)?.toLowerCase() === 'm' && memberName) {
    const found = findInChain(classChainForSite, memberName, 'methods');
    if (found) return { target: found.qname, tier: 'RESOLVED', confidence: 0.9 };
  }
  if (scope) {
    const callable = safe(() => scope.getCallableByName(calleeText));
    if (callable?.file) {
      const qname = `${callable.file.srcPath}::${callable.getName(ParseMode.BrighterScript)}`;
      return { target: qname, tier: 'RESOLVED', confidence: 1.0 };
    }
  }
  return { target: calleeText, tier: 'TEXTUAL', confidence: 0.4 };
}

function resolveClassTarget(classNameExpr, containingNamespace, scope) {
  const text = exprText(classNameExpr) ?? 'UnknownClass';
  if (scope) {
    const link = safe(() => scope.getClassFileLink(text, containingNamespace));
    if (link?.item) {
      return { target: `${link.file.srcPath}::${link.item.getName(ParseMode.BrighterScript)}`, tier: 'RESOLVED', confidence: 1.0 };
    }
  }
  return { target: text, tier: 'TEXTUAL', confidence: 0.4 };
}

function declaredEdge(sourceQualified, targetQualified, filePath, line) {
  return { kind: 'CONTAINS', sourceQualified, targetQualified, filePath, line, extra: {}, confidence: 1.0, confidenceTier: 'DECLARED' };
}

function containerNode(kind, name, qname, fp, node, endNode, lang, parentName, extra = {}) {
  return {
    kind, name, qualifiedName: qname, filePath: fp,
    lineStart: posOf(node).line, lineEnd: endLineOf(endNode ?? node), language: lang,
    parentName, params: null, returnType: null, modifiers: null, isTest: false, fileHash: null, extra,
  };
}

function extractFunctions(ast, fp, fileQname, lang, addNode, addEdge) {
  ast.walk(createVisitor({
    FunctionStatement: (stmt) => {
      const qname = `${fp}::${stmt.getName(ParseMode.BrighterScript)}`;
      const ns = namespaceOf(stmt);
      addNode(containerNode('Function', stmt.tokens.name.text, qname, fp, stmt, stmt.func, lang, null, {
        col: posOf(stmt).col, namespace: ns ?? null, params: paramsJson(stmt.func),
        returnType: typeExpressionText(stmt.func?.returnTypeExpression),
        modifiers: [isSubKeyword(stmt.func) ? 'sub' : 'function'],
        isTest: looksLikeTest(stmt.tokens.name.text, stmt.annotations),
      }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(stmt).line));
    },
  }), { walkMode: WalkMode.visitStatements });
}

function extractClassMembers(cls, qname, fp, lang, addNode, addEdge) {
  for (const method of cls.methods) {
    const methodQname = `${qname}.${method.tokens.name.text}`;
    addNode(containerNode('Method', method.tokens.name.text, methodQname, fp, method, method.func, lang, qname, {
      col: posOf(method).col, params: paramsJson(method.func),
      returnType: typeExpressionText(method.func?.returnTypeExpression),
      modifiers: [method.accessModifier?.text ?? 'public', method.tokens.override ? 'override' : null, isSubKeyword(method.func) ? 'sub' : 'function'].filter(Boolean),
      isTest: looksLikeTest(method.tokens.name.text, method.annotations),
    }));
    addEdge(declaredEdge(qname, methodQname, fp, posOf(method).line));
  }
  for (const field of cls.fields) {
    const fieldQname = `${qname}.${field.tokens.name.text}`;
    addNode(containerNode('Field', field.tokens.name.text, fieldQname, fp, field, field, lang, qname, {
      returnType: typeExpressionText(field.typeExpression),
      modifiers: [field.tokens.accessModifier?.text ?? 'public'],
    }));
    addEdge(declaredEdge(qname, fieldQname, fp, posOf(field).line));
  }
}

function extractClasses(ast, fp, fileQname, lang, scope, addNode, addEdge) {
  ast.walk(createVisitor({
    ClassStatement: (cls) => {
      const qname = `${fp}::${cls.getName(ParseMode.BrighterScript)}`;
      const ns = namespaceOf(cls);
      addNode(containerNode('Class', cls.tokens.name.text, qname, fp, cls, cls, lang, null, { namespace: ns ?? null }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(cls).line));

      if (cls.hasParentClass()) {
        const resolved = resolveClassTarget(cls.parentClassName.expression, ns, scope);
        addEdge({ kind: 'EXTENDS', sourceQualified: qname, targetQualified: resolved.target, filePath: fp, line: posOf(cls).line, extra: {}, confidence: resolved.confidence, confidenceTier: resolved.tier });
      }
      extractClassMembers(cls, qname, fp, lang, addNode, addEdge);
    },
  }), { walkMode: WalkMode.visitStatements });
}

function extractNamespaces(ast, fp, fileQname, lang, addNode, addEdge) {
  ast.walk(createVisitor({
    NamespaceStatement: (ns) => {
      const name = ns.getName(ParseMode.BrighterScript);
      const qname = `${fp}::${name}`;
      addNode(containerNode('Namespace', name, qname, fp, ns, ns, lang, null));
      addEdge(declaredEdge(fileQname, qname, fp, posOf(ns).line));
    },
  }), { walkMode: WalkMode.visitStatements });
}

function extractInterfaces(ast, fp, fileQname, lang, scope, addNode, addEdge) {
  ast.walk(createVisitor({
    InterfaceStatement: (iface) => {
      const qname = `${fp}::${iface.fullName}`;
      const ns = namespaceOf(iface);
      addNode(containerNode('Interface', iface.tokens.name.text, qname, fp, iface, iface, lang, null, {
        fields: iface.fields.map(f => f.tokens.name.text),
        methods: iface.methods.map(m => m.tokens.name.text),
      }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(iface).line));

      if (iface.hasParentInterface() && iface.parentInterfaceName) {
        const text = typeExpressionText(iface.parentInterfaceName);
        if (text) {
          const link = scope ? safe(() => scope.getInterfaceFileLink(text, ns)) : undefined;
          const target = link?.item ? `${link.file.srcPath}::${link.item.fullName}` : text;
          addEdge({ kind: 'EXTENDS', sourceQualified: qname, targetQualified: target, filePath: fp, line: posOf(iface).line, extra: {}, confidence: link?.item ? 1.0 : 0.4, confidenceTier: link?.item ? 'RESOLVED' : 'TEXTUAL' });
        }
      }
    },
  }), { walkMode: WalkMode.visitStatements });
}

function extractEnumsAndConsts(ast, fp, fileQname, lang, addNode, addEdge) {
  ast.walk(createVisitor({
    EnumStatement: (en) => {
      const qname = `${fp}::${en.fullName}`;
      const ns = namespaceOf(en);
      addNode(containerNode('Enum', en.tokens.name.text, qname, fp, en, en, lang, null, {
        members: en.getMembers().map(m => m.tokens.name.text),
      }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(en).line));
    },
    ConstStatement: (c) => {
      const qname = `${fp}::${c.fullName}`;
      const ns = namespaceOf(c);
      addNode(containerNode('Const', c.tokens.name.text, qname, fp, c, c, lang, null));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(c).line));
    },
  }), { walkMode: WalkMode.visitStatements });
}

function extractImports(file, fp, fileQname, program, addEdge) {
  for (const imp of file.ownScriptImports) {
    const target = imp.destPath ?? imp.text;
    if (!target) continue;
    const resolvedSrcPath = safe(() => program.getFile(target))?.srcPath ?? null;
    addEdge({ kind: 'IMPORTS_FROM', sourceQualified: fileQname, targetQualified: resolvedSrcPath ?? target, filePath: fp, line: 0, extra: {}, confidence: resolvedSrcPath ? 1.0 : 0.6, confidenceTier: resolvedSrcPath ? 'RESOLVED' : 'TEXTUAL' });
  }
}

function extractCallsAndWrites(ast, fp, scope, addEdge) {
  ast.walk(createVisitor({
    CallExpression: (expr) => {
      if (isNewExpression(expr.parent)) return;
      const calleeText = exprText(expr.callee);
      if (!calleeText) return;
      const site = enclosingScope(expr, fp, scope);
      const resolved = resolveCallTarget(expr.callee, calleeText, site.classChain, scope);
      addEdge({ kind: 'CALLS', sourceQualified: site.qname, targetQualified: resolved.target, filePath: fp, line: posOf(expr).line, extra: { col: posOf(expr).col }, confidence: resolved.confidence, confidenceTier: resolved.tier });
    },
    NewExpression: (expr) => {
      const site = enclosingScope(expr, fp, scope);
      const ns = namespaceOf(expr);
      const resolved = resolveClassTarget(expr.className, ns, scope);
      addEdge({ kind: 'INSTANTIATES', sourceQualified: site.qname, targetQualified: resolved.target, filePath: fp, line: posOf(expr).line, extra: { col: posOf(expr).col }, confidence: resolved.confidence, confidenceTier: resolved.tier });
    },
    DottedSetStatement: (stmt) => {
      const memberName = stmt.tokens.name?.text;
      if (!memberName) return;
      const site = enclosingScope(stmt, fp, scope);
      const objText = exprText(stmt.obj);
      let target = objText ? `${objText}.${memberName}` : memberName;
      let tier = 'TEXTUAL', confidence = 0.4;
      if (site.classChain && objText?.toLowerCase() === 'm') {
        const found = findInChain(site.classChain, memberName, 'fields');
        if (found) { target = found.qname; tier = 'RESOLVED'; confidence = 0.9; }
      }
      addEdge({ kind: 'WRITES', sourceQualified: site.qname, targetQualified: target, filePath: fp, line: posOf(stmt).line, extra: { col: posOf(stmt).col }, confidence, confidenceTier: tier });
    },
  }), { walkMode: WalkMode.visitAllRecursive });
}

/**
 * Extract nodes/edges for a single BrsFile: namespaces, functions, classes,
 * interfaces, enums, consts, imports, calls, instantiations, writes.
 */
export function extractBrsFile(file, program) {
  const nodes = [];
  const edges = [];
  const seenEdges = new Set();
  const fp = file.srcPath;
  const lang = fp.endsWith('.bs') ? 'brighterscript' : 'brightscript';
  const fileQname = fp;
  const scope = safe(() => program.getFirstScopeForFile(file));

  const addNode = (n) => nodes.push(n);
  const addEdge = (e) => {
    const key = `${e.kind}|${e.sourceQualified}|${e.targetQualified}|${e.line}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push(e);
  };

  addNode({
    kind: 'File', name: path.basename(fp), qualifiedName: fileQname, filePath: fp,
    lineStart: 1, lineEnd: Math.max(endLineOf(file.ast), 0), language: lang,
    parentName: null, params: null, returnType: null, modifiers: null, isTest: false,
    fileHash: fileHash(file.fileContents ?? ''), extra: { parser: 'brighterscript' },
  });

  extractImports(file, fp, fileQname, program, addEdge);

  const ast = file.ast;
  if (!ast?.walk) return { nodes, edges };

  extractNamespaces(ast, fp, fileQname, lang, addNode, addEdge);
  extractFunctions(ast, fp, fileQname, lang, addNode, addEdge);
  extractClasses(ast, fp, fileQname, lang, scope, addNode, addEdge);
  extractInterfaces(ast, fp, fileQname, lang, scope, addNode, addEdge);
  extractEnumsAndConsts(ast, fp, fileQname, lang, addNode, addEdge);
  extractCallsAndWrites(ast, fp, scope, addEdge);

  return { nodes, edges };
}
