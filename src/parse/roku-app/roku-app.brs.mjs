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
  isCallExpression,
  isClassStatement,
  isDottedGetExpression,
  isFunctionExpression,
  isFunctionStatement,
  isMethodStatement,
  isNamespaceStatement,
  isNewExpression,
} from 'brighterscript';
import * as crypto from 'crypto';
import * as path from 'path';
import { posOf, endLineOf, exprText, safe, classifyValueKind } from './roku-app.ast-utils.mjs';
import { buildFunctionCfg } from './roku-app.cfg.mjs';
import { buildFunctionDfg } from './roku-app.dfg.mjs';

function fileHash(contents) {
  return crypto.createHash('sha1').update(contents).digest('hex');
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
    defaultValue: p.defaultValue ? exprText(p.defaultValue) : undefined,
  }));
  return JSON.stringify(params);
}

/**
 * Best-effort doc comment: the contiguous run of `'`-comment lines
 * immediately above `node`'s start line. Scans raw source text rather than
 * AST comment nodes, since brighterscript doesn't expose a stable
 * leading-comment association API to depend on.
 */
function docCommentFor(lines, node) {
  const startLine = node?.location?.range?.start?.line;
  if (startLine == null) return null;
  const collected = [];
  let i = startLine - 1;
  while (i >= 0) {
    const line = (lines[i] ?? '').trim();
    if (!line.startsWith("'")) break;
    collected.unshift(line.replace(/^'+\s?/, ''));
    i--;
  }
  return collected.length ? collected.join('\n') : null;
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

/**
 * Best-effort copy-vs-reference boundary detection: `m.top.*` is a
 * component's own SceneGraph interface (a field get/set crosses the node
 * boundary — Array/AssociativeArray values get deep-cloned there,
 * roSGNode values stay by-reference); `.callFunc(...)` is the other real
 * BrightScript node-boundary crossing.
 */
function crossesInterfaceBoundary(objText) {
  return objText === 'm.top' || (objText?.startsWith('m.top.') ?? false);
}

function isCallFuncInvocation(calleeText) {
  return /\.callfunc$/i.test(calleeText ?? '');
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

function extractFunctions(ast, fp, fileQname, lang, lines, addNode, addEdge) {
  ast.walk(createVisitor({
    FunctionStatement: (stmt) => {
      const qname = `${fp}::${stmt.getName(ParseMode.BrighterScript)}`;
      const ns = namespaceOf(stmt);
      const cfg = buildFunctionCfg(stmt.func, qname, fp);
      addNode(containerNode('Function', stmt.tokens.name.text, qname, fp, stmt, stmt.func, lang, null, {
        col: posOf(stmt).col, namespace: ns ?? null, params: paramsJson(stmt.func),
        returnType: typeExpressionText(stmt.func?.returnTypeExpression),
        modifiers: [isSubKeyword(stmt.func) ? 'sub' : 'function'],
        isTest: looksLikeTest(stmt.tokens.name.text, stmt.annotations),
        doc: docCommentFor(lines, stmt),
        ...cfg.metrics,
      }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(stmt).line));
      cfg.nodes.forEach(addNode);
      cfg.edges.forEach(addEdge);
      const dfg = buildFunctionDfg(stmt.func, qname, fp, lang);
      dfg.nodes.forEach(addNode);
      dfg.edges.forEach(addEdge);
    },
  }), { walkMode: WalkMode.visitStatements });
}

function extractClassMembers(cls, qname, fp, lang, lines, addNode, addEdge) {
  for (const method of cls.methods) {
    const methodQname = `${qname}.${method.tokens.name.text}`;
    const cfg = buildFunctionCfg(method.func, methodQname, fp);
    addNode(containerNode('Method', method.tokens.name.text, methodQname, fp, method, method.func, lang, qname, {
      col: posOf(method).col, params: paramsJson(method.func),
      returnType: typeExpressionText(method.func?.returnTypeExpression),
      modifiers: [method.accessModifier?.text ?? 'public', method.tokens.override ? 'override' : null, isSubKeyword(method.func) ? 'sub' : 'function'].filter(Boolean),
      isTest: looksLikeTest(method.tokens.name.text, method.annotations),
      doc: docCommentFor(lines, method),
      ...cfg.metrics,
    }));
    addEdge(declaredEdge(qname, methodQname, fp, posOf(method).line));
    cfg.nodes.forEach(addNode);
    cfg.edges.forEach(addEdge);
    const dfg = buildFunctionDfg(method.func, methodQname, fp, lang);
    dfg.nodes.forEach(addNode);
    dfg.edges.forEach(addEdge);
  }
  for (const field of cls.fields) {
    const fieldQname = `${qname}.${field.tokens.name.text}`;
    addNode(containerNode('Field', field.tokens.name.text, fieldQname, fp, field, field, lang, qname, {
      returnType: typeExpressionText(field.typeExpression),
      modifiers: [field.tokens.accessModifier?.text ?? 'public'],
      doc: docCommentFor(lines, field),
    }));
    addEdge(declaredEdge(qname, fieldQname, fp, posOf(field).line));
  }
}

function extractClasses(ast, fp, fileQname, lang, scope, lines, addNode, addEdge) {
  ast.walk(createVisitor({
    ClassStatement: (cls) => {
      const qname = `${fp}::${cls.getName(ParseMode.BrighterScript)}`;
      const ns = namespaceOf(cls);
      addNode(containerNode('Class', cls.tokens.name.text, qname, fp, cls, cls, lang, null, {
        namespace: ns ?? null, doc: docCommentFor(lines, cls),
      }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(cls).line));

      if (cls.hasParentClass()) {
        const resolved = resolveClassTarget(cls.parentClassName.expression, ns, scope);
        addEdge({ kind: 'EXTENDS', sourceQualified: qname, targetQualified: resolved.target, filePath: fp, line: posOf(cls).line, extra: {}, confidence: resolved.confidence, confidenceTier: resolved.tier });
      }
      extractClassMembers(cls, qname, fp, lang, lines, addNode, addEdge);
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

function extractInterfaces(ast, fp, fileQname, lang, scope, lines, addNode, addEdge) {
  ast.walk(createVisitor({
    InterfaceStatement: (iface) => {
      const qname = `${fp}::${iface.fullName}`;
      const ns = namespaceOf(iface);
      addNode(containerNode('Interface', iface.tokens.name.text, qname, fp, iface, iface, lang, null, {
        fields: iface.fields.map(f => f.tokens.name.text),
        methods: iface.methods.map(m => m.tokens.name.text),
        doc: docCommentFor(lines, iface),
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

function extractEnumsAndConsts(ast, fp, fileQname, lang, lines, addNode, addEdge) {
  ast.walk(createVisitor({
    EnumStatement: (en) => {
      const qname = `${fp}::${en.fullName}`;
      const ns = namespaceOf(en);
      addNode(containerNode('Enum', en.tokens.name.text, qname, fp, en, en, lang, null, {
        members: en.getMembers().map(m => m.tokens.name.text),
        doc: docCommentFor(lines, en),
      }));
      addEdge(declaredEdge(ns ? `${fp}::${ns}` : fileQname, qname, fp, posOf(en).line));
    },
    ConstStatement: (c) => {
      const qname = `${fp}::${c.fullName}`;
      const ns = namespaceOf(c);
      addNode(containerNode('Const', c.tokens.name.text, qname, fp, c, c, lang, null, { doc: docCommentFor(lines, c) }));
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
      addEdge({ kind: 'CALLS', sourceQualified: site.qname, targetQualified: resolved.target, filePath: fp, line: posOf(expr).line, extra: { col: posOf(expr).col, argCount: expr.args?.length ?? 0, crossesNodeBoundary: isCallFuncInvocation(calleeText) }, confidence: resolved.confidence, confidenceTier: resolved.tier });
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
      const crossesBoundary = crossesInterfaceBoundary(objText);
      const valueKind = crossesBoundary ? classifyValueKind(stmt.value) : null;
      const copySemantics = valueKind === 'roSGNode' ? 'by-reference' : valueKind ? 'deep-clone' : crossesBoundary ? 'unknown' : undefined;
      addEdge({ kind: 'WRITES', sourceQualified: site.qname, targetQualified: target, filePath: fp, line: posOf(stmt).line, extra: { col: posOf(stmt).col, crossesNodeBoundary: crossesBoundary, copySemantics }, confidence, confidenceTier: tier });
    },
    // ponytail: only member-access reads (m.foo, obj.bar), mirroring WRITES'
    // existing DottedSetStatement-only scope. Plain local-variable reads
    // (VariableExpression) are deliberately skipped — no plain-assignment
    // WRITES tracking exists either, and tracking every loop/temp var read
    // would dominate edge counts without much analytical value.
    DottedGetExpression: (expr) => {
      const parent = expr.parent;
      if (isNewExpression(parent)) return;
      if (isCallExpression(parent) && parent.callee === expr) return; // covered by CALLS
      if (isDottedGetExpression(parent) && parent.obj === expr) return; // not the top of the chain
      const memberName = expr.tokens?.name?.text ?? expr.name?.text;
      if (!memberName) return;
      const site = enclosingScope(expr, fp, scope);
      const objText = exprText(expr.obj);
      let target = objText ? `${objText}.${memberName}` : memberName;
      let tier = 'TEXTUAL', confidence = 0.4;
      if (site.classChain && objText?.toLowerCase() === 'm') {
        const found = findInChain(site.classChain, memberName, 'fields');
        if (found) { target = found.qname; tier = 'RESOLVED'; confidence = 0.9; }
      }
      addEdge({ kind: 'READS', sourceQualified: site.qname, targetQualified: target, filePath: fp, line: posOf(expr).line, extra: { col: posOf(expr).col, crossesNodeBoundary: crossesInterfaceBoundary(objText) }, confidence, confidenceTier: tier });
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

  const lines = (file.fileContents ?? '').split('\n');

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
  extractFunctions(ast, fp, fileQname, lang, lines, addNode, addEdge);
  extractClasses(ast, fp, fileQname, lang, scope, lines, addNode, addEdge);
  extractInterfaces(ast, fp, fileQname, lang, scope, lines, addNode, addEdge);
  extractEnumsAndConsts(ast, fp, fileQname, lang, lines, addNode, addEdge);
  extractCallsAndWrites(ast, fp, scope, addEdge);

  return { nodes, edges };
}
