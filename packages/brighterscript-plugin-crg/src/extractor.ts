import type {
  AstNode,
  BrsFile,
  Callable,
  ClassStatement,
  ConstStatement,
  EnumStatement,
  Expression,
  FunctionExpression,
  FunctionStatement,
  InterfaceStatement,
  NamespaceStatement,
  Program,
  Scope,
  XmlFile,
} from 'brighterscript';
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

export type CrgNodeKind =
  | 'File'
  | 'Namespace'
  | 'Function'
  | 'Class'
  | 'Method'
  | 'Field'
  | 'Interface'
  | 'Enum'
  | 'Const'
  | 'Component'
  | 'ComponentField'
  | 'ComponentFunction';

export type CrgEdgeKind =
  | 'CONTAINS'
  | 'CALLS'
  | 'IMPORTS_FROM'
  | 'EXTENDS'
  | 'INSTANTIATES'
  | 'HAS_SCRIPT'
  | 'OBSERVES'
  | 'WRITES';

export type ConfidenceTier = 'RESOLVED' | 'TEXTUAL' | 'DECLARED';

export interface CrgNode {
  kind: CrgNodeKind;
  name: string;
  qualifiedName: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  language: 'brightscript' | 'brighterscript' | 'xml';
  parentName: string | null;
  params: string | null;
  returnType: string | null;
  modifiers: string | null;
  isTest: boolean;
  fileHash: string | null;
  extra: Record<string, unknown>;
}

export interface CrgEdge {
  kind: CrgEdgeKind;
  sourceQualified: string;
  targetQualified: string;
  filePath: string;
  line: number;
  extra: Record<string, unknown>;
  confidence: number;
  confidenceTier: ConfidenceTier;
}

interface Pos {
  line: number;
  col: number;
}

const ORIGIN: Pos = { line: 0, col: 0 };

function posOf(node: AstNode | undefined | null): Pos {
  const start = node?.location?.range?.start;
  if (!start) return ORIGIN;
  return { line: start.line + 1, col: start.character };
}

function endLineOf(node: AstNode | undefined | null): number {
  return (node?.location?.range?.end?.line ?? -1) + 1;
}

function fileHash(contents: string): string {
  return crypto.createHash('sha1').update(contents).digest('hex');
}

/**
 * Resolve a callee-ish expression to a dotted name string.
 * Handles VariableExpression (foo), DottedGetExpression (a.b.c),
 * and falls back to getText() for anything else.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exprText(node: any): string | null {
  if (!node) return null;

  if (typeof node.getText === 'function') {
    const text: string = node.getText()?.trim() ?? '';
    if (text) return text;
  }

  const parts: string[] = [];
  let cur = node;
  while (cur) {
    const nameText: string | undefined = cur.name?.text ?? cur.tokens?.name?.text;
    if (nameText) {
      parts.unshift(nameText);
      cur = cur.obj;
    } else {
      const varName: string | undefined = cur.tokens?.name?.text ?? cur.name?.text;
      if (varName) parts.unshift(varName);
      break;
    }
  }
  return parts.length > 0 ? parts.join('.') : null;
}

/** Safely invoke a brighterscript resolution API that may throw on malformed/partial programs. */
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function typeExpressionText(typeExpr: { expression?: Expression } | undefined): string | null {
  if (!typeExpr) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return exprText((typeExpr as any).expression);
}

function namespaceOf(node: AstNode): string | undefined {
  const ns = node.findAncestor<NamespaceStatement>(isNamespaceStatement);
  return ns ? ns.getName(ParseMode.BrighterScript) : undefined;
}

function paramsJson(func: FunctionExpression | undefined): string {
  const params = (func?.parameters ?? []).map(p => ({
    name: p.tokens?.name?.text ?? '',
    type: typeExpressionText(p.typeExpression) ?? undefined,
    optional: !!p.defaultValue,
  }));
  return JSON.stringify(params);
}

function returnTypeText(func: FunctionExpression | undefined): string | null {
  return typeExpressionText(func?.returnTypeExpression);
}

function isSubKeyword(func: FunctionExpression | undefined): boolean {
  return (func?.tokens?.functionType?.text ?? '').toLowerCase() === 'sub';
}

function looksLikeTest(name: string, annotations?: Array<{ name: string }>): boolean {
  if (annotations?.some(a => /test/i.test(a.name))) return true;
  return /test/i.test(name);
}

// ---------------------------------------------------------------------------
// BrightScript / BrighterScript (.brs / .bs) files
// ---------------------------------------------------------------------------

export function extractBrsFile(file: BrsFile, program: Program): { nodes: CrgNode[]; edges: CrgEdge[] } {
  const nodes: CrgNode[] = [];
  const edges: CrgEdge[] = [];
  const seenEdges = new Set<string>();
  const fp = file.srcPath;
  const lang: 'brightscript' | 'brighterscript' = fp.endsWith('.bs') ? 'brighterscript' : 'brightscript';
  const fileQname = fp;

  const scope: Scope | undefined = safe(() => program.getFirstScopeForFile(file));

  function addEdge(e: CrgEdge): void {
    const key = `${e.kind}|${e.sourceQualified}|${e.targetQualified}|${e.line}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push(e);
  }

  function resolveFileSrcPath(destOrText: string): string | null {
    const resolved = safe(() => program.getFile(destOrText));
    return resolved?.srcPath ?? null;
  }

  nodes.push({
    kind: 'File',
    name: path.basename(fp),
    qualifiedName: fileQname,
    filePath: fp,
    lineStart: 1,
    lineEnd: endLineOf(file.ast) > 0 ? endLineOf(file.ast) : 0,
    language: lang,
    parentName: null,
    params: null,
    returnType: null,
    modifiers: null,
    isTest: false,
    fileHash: fileHash(file.fileContents ?? ''),
    extra: { parser: 'brighterscript' },
  });

  // IMPORTS_FROM edges from library/import statements
  for (const imp of file.ownScriptImports) {
    const target: string = imp.destPath ?? imp.text;
    if (!target) continue;
    const resolvedSrcPath = resolveFileSrcPath(target);
    addEdge({
      kind: 'IMPORTS_FROM',
      sourceQualified: fileQname,
      targetQualified: resolvedSrcPath ?? target,
      filePath: fp,
      line: 0,
      extra: {},
      confidence: resolvedSrcPath ? 1.0 : 0.6,
      confidenceTier: resolvedSrcPath ? 'RESOLVED' : 'TEXTUAL',
    });
  }

  /** Class name -> {cls, file} chain, self first then ancestors, resolved as far as possible. */
  function classChain(cls: ClassStatement, containingNamespace: string | undefined): Array<{ cls: ClassStatement; file: BrsFile }> {
    const chain: Array<{ cls: ClassStatement; file: BrsFile }> = [{ cls, file }];
    let current = cls;
    let guard = 0;
    while (current.hasParentClass() && guard++ < 50 && scope) {
      const parentText = typeExpressionText(current.parentClassName as unknown as { expression?: Expression });
      if (!parentText) break;
      const link = safe(() => scope.getClassFileLink(parentText, containingNamespace));
      if (!link?.item || chain.some(c => c.cls === link.item)) break;
      chain.push({ cls: link.item, file: link.file as BrsFile });
      current = link.item;
    }
    return chain;
  }

  function findMethodInChain(
    chain: Array<{ cls: ClassStatement; file: BrsFile }>,
    methodName: string,
  ): { qname: string } | null {
    const lower = methodName.toLowerCase();
    for (const { cls, file: clsFile } of chain) {
      const method = cls.methods.find(m => (m.tokens.name?.text ?? '').toLowerCase() === lower);
      if (method) {
        const classQname = `${clsFile.srcPath}::${cls.getName(ParseMode.BrighterScript)}`;
        return { qname: `${classQname}.${method.tokens.name.text}` };
      }
    }
    return null;
  }

  function findFieldInChain(
    chain: Array<{ cls: ClassStatement; file: BrsFile }>,
    fieldName: string,
  ): { qname: string } | null {
    const lower = fieldName.toLowerCase();
    for (const { cls, file: clsFile } of chain) {
      const field = cls.fields.find(f => (f.tokens.name?.text ?? '').toLowerCase() === lower);
      if (field) {
        const classQname = `${clsFile.srcPath}::${cls.getName(ParseMode.BrighterScript)}`;
        return { qname: `${classQname}.${field.tokens.name.text}` };
      }
    }
    return null;
  }

  /**
   * Determine the qualified name of the named scope (function/method, or a synthesized
   * name for an anonymous function expression) that most closely encloses `node`.
   * Also returns the enclosing class chain, when the call site sits inside a class method,
   * so `m.Foo()` / `m.foo = x` can be resolved against sibling methods/fields.
   */
  function enclosingScope(node: AstNode): { qname: string; classChain?: Array<{ cls: ClassStatement; file: BrsFile }> } {
    const enclosingFunc = node.findAncestor<FunctionExpression>(isFunctionExpression);
    if (!enclosingFunc) return { qname: fileQname };

    const owner = enclosingFunc.parent;
    if (owner && isMethodStatement(owner)) {
      const cls = owner.findAncestor<ClassStatement>(isClassStatement);
      if (cls) {
        const ns = namespaceOf(cls);
        const chain = classChain(cls, ns);
        const classQname = `${fp}::${cls.getName(ParseMode.BrighterScript)}`;
        return { qname: `${classQname}.${owner.tokens.name.text}`, classChain: chain };
      }
    }
    if (owner && isFunctionStatement(owner)) {
      return { qname: `${fp}::${owner.getName(ParseMode.BrighterScript)}` };
    }

    // Anonymous function expression (assigned to a var/field, passed as a callback, etc.)
    const pos = posOf(enclosingFunc);
    const outer = enclosingScope(enclosingFunc);
    return { qname: `${outer.qname}::<anonymous@${pos.line}:${pos.col}>`, classChain: outer.classChain };
  }

  function resolveCallTarget(
    calleeExpr: Expression,
    calleeText: string,
    classChainForSite: Array<{ cls: ClassStatement; file: BrsFile }> | undefined,
    containingNamespace: string | undefined,
  ): { target: string; tier: ConfidenceTier; confidence: number } {
    // `m.Foo(...)` inside a class method -> resolve against the class/ancestor method map.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (calleeExpr as any).obj;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberName: string | undefined = (calleeExpr as any).name?.text ?? (calleeExpr as any).tokens?.name?.text;
    if (classChainForSite && obj && exprText(obj)?.toLowerCase() === 'm' && memberName) {
      const found = findMethodInChain(classChainForSite, memberName);
      if (found) return { target: found.qname, tier: 'RESOLVED', confidence: 0.9 };
    }

    if (scope) {
      const callable: Callable | undefined = safe(() => scope.getCallableByName(calleeText));
      if (callable?.file) {
        const qname = `${(callable.file as BrsFile).srcPath}::${callable.getName(ParseMode.BrighterScript)}`;
        return { target: qname, tier: 'RESOLVED', confidence: 1.0 };
      }
    }

    return { target: calleeText, tier: 'TEXTUAL', confidence: 0.4 };
  }

  function resolveClassTarget(
    classNameExpr: Expression,
    containingNamespace: string | undefined,
  ): { target: string; tier: ConfidenceTier; confidence: number } {
    const text = exprText(classNameExpr) ?? 'UnknownClass';
    if (scope) {
      const link = safe(() => scope.getClassFileLink(text, containingNamespace));
      if (link?.item) {
        return {
          target: `${(link.file as BrsFile).srcPath}::${link.item.getName(ParseMode.BrighterScript)}`,
          tier: 'RESOLVED',
          confidence: 1.0,
        };
      }
    }
    return { target: text, tier: 'TEXTUAL', confidence: 0.4 };
  }

  const ast = file.ast;
  if (!ast?.walk) return { nodes, edges };

  ast.walk(
    createVisitor({
      NamespaceStatement: (ns: NamespaceStatement) => {
        const qname = `${fp}::${ns.getName(ParseMode.BrighterScript)}`;
        nodes.push({
          kind: 'Namespace',
          name: ns.getName(ParseMode.BrighterScript),
          qualifiedName: qname,
          filePath: fp,
          lineStart: posOf(ns).line,
          lineEnd: endLineOf(ns),
          language: lang,
          parentName: null,
          params: null,
          returnType: null,
          modifiers: null,
          isTest: false,
          fileHash: null,
          extra: {},
        });
        addEdge({
          kind: 'CONTAINS',
          sourceQualified: fileQname,
          targetQualified: qname,
          filePath: fp,
          line: posOf(ns).line,
          extra: {},
          confidence: 1.0,
          confidenceTier: 'DECLARED',
        });
      },

      FunctionStatement: (stmt: FunctionStatement) => {
        const fullName = stmt.getName(ParseMode.BrighterScript);
        const qname = `${fp}::${fullName}`;
        const ns = namespaceOf(stmt);
        const modifiers = [isSubKeyword(stmt.func) ? 'sub' : 'function'];
        nodes.push({
          kind: 'Function',
          name: stmt.tokens.name.text,
          qualifiedName: qname,
          filePath: fp,
          lineStart: posOf(stmt).line,
          lineEnd: endLineOf(stmt.func),
          language: lang,
          parentName: null,
          params: paramsJson(stmt.func),
          returnType: returnTypeText(stmt.func),
          modifiers: JSON.stringify(modifiers),
          isTest: looksLikeTest(stmt.tokens.name.text, stmt.annotations),
          fileHash: null,
          extra: { col: posOf(stmt).col, namespace: ns ?? null },
        });
        addEdge({
          kind: 'CONTAINS',
          sourceQualified: ns ? `${fp}::${ns}` : fileQname,
          targetQualified: qname,
          filePath: fp,
          line: posOf(stmt).line,
          extra: {},
          confidence: 1.0,
          confidenceTier: 'DECLARED',
        });
      },

      ClassStatement: (cls: ClassStatement) => {
        const fullName = cls.getName(ParseMode.BrighterScript);
        const qname = `${fp}::${fullName}`;
        const ns = namespaceOf(cls);
        nodes.push({
          kind: 'Class',
          name: cls.tokens.name.text,
          qualifiedName: qname,
          filePath: fp,
          lineStart: posOf(cls).line,
          lineEnd: endLineOf(cls),
          language: lang,
          parentName: null,
          params: null,
          returnType: null,
          modifiers: null,
          isTest: false,
          fileHash: null,
          extra: { namespace: ns ?? null },
        });
        addEdge({
          kind: 'CONTAINS',
          sourceQualified: ns ? `${fp}::${ns}` : fileQname,
          targetQualified: qname,
          filePath: fp,
          line: posOf(cls).line,
          extra: {},
          confidence: 1.0,
          confidenceTier: 'DECLARED',
        });

        if (cls.hasParentClass()) {
          const resolved = resolveClassTarget(
            (cls.parentClassName as unknown as { expression: Expression }).expression,
            ns,
          );
          addEdge({
            kind: 'EXTENDS',
            sourceQualified: qname,
            targetQualified: resolved.target,
            filePath: fp,
            line: posOf(cls).line,
            extra: {},
            confidence: resolved.confidence,
            confidenceTier: resolved.tier,
          });
        }

        for (const method of cls.methods) {
          const methodQname = `${qname}.${method.tokens.name.text}`;
          const modifiers = [
            method.accessModifier?.text ?? 'public',
            method.tokens.override ? 'override' : null,
            isSubKeyword(method.func) ? 'sub' : 'function',
          ].filter(Boolean);
          nodes.push({
            kind: 'Method',
            name: method.tokens.name.text,
            qualifiedName: methodQname,
            filePath: fp,
            lineStart: posOf(method).line,
            lineEnd: endLineOf(method.func),
            language: lang,
            parentName: qname,
            params: paramsJson(method.func),
            returnType: returnTypeText(method.func),
            modifiers: JSON.stringify(modifiers),
            isTest: looksLikeTest(method.tokens.name.text, method.annotations),
            fileHash: null,
            extra: { col: posOf(method).col },
          });
          addEdge({
            kind: 'CONTAINS',
            sourceQualified: qname,
            targetQualified: methodQname,
            filePath: fp,
            line: posOf(method).line,
            extra: {},
            confidence: 1.0,
            confidenceTier: 'DECLARED',
          });
        }

        for (const field of cls.fields) {
          const fieldQname = `${qname}.${field.tokens.name.text}`;
          const modifiers = [field.tokens.accessModifier?.text ?? 'public'].filter(Boolean);
          nodes.push({
            kind: 'Field',
            name: field.tokens.name.text,
            qualifiedName: fieldQname,
            filePath: fp,
            lineStart: posOf(field).line,
            lineEnd: posOf(field).line,
            language: lang,
            parentName: qname,
            params: null,
            returnType: typeExpressionText(field.typeExpression),
            modifiers: JSON.stringify(modifiers),
            isTest: false,
            fileHash: null,
            extra: {},
          });
          addEdge({
            kind: 'CONTAINS',
            sourceQualified: qname,
            targetQualified: fieldQname,
            filePath: fp,
            line: posOf(field).line,
            extra: {},
            confidence: 1.0,
            confidenceTier: 'DECLARED',
          });
        }
      },

      InterfaceStatement: (iface: InterfaceStatement) => {
        const qname = `${fp}::${iface.fullName}`;
        const ns = namespaceOf(iface);
        nodes.push({
          kind: 'Interface',
          name: iface.tokens.name.text,
          qualifiedName: qname,
          filePath: fp,
          lineStart: posOf(iface).line,
          lineEnd: endLineOf(iface),
          language: lang,
          parentName: null,
          params: null,
          returnType: null,
          modifiers: null,
          isTest: false,
          fileHash: null,
          extra: {
            fields: iface.fields.map(f => f.tokens.name.text),
            methods: iface.methods.map(m => m.tokens.name.text),
          },
        });
        addEdge({
          kind: 'CONTAINS',
          sourceQualified: ns ? `${fp}::${ns}` : fileQname,
          targetQualified: qname,
          filePath: fp,
          line: posOf(iface).line,
          extra: {},
          confidence: 1.0,
          confidenceTier: 'DECLARED',
        });
        if (iface.hasParentInterface() && iface.parentInterfaceName) {
          const text = typeExpressionText(iface.parentInterfaceName as unknown as { expression?: Expression });
          if (text) {
            const link = scope ? safe(() => scope.getInterfaceFileLink(text, ns)) : undefined;
            addEdge({
              kind: 'EXTENDS',
              sourceQualified: qname,
              targetQualified: link?.item ? `${(link.file as BrsFile).srcPath}::${link.item.fullName}` : text,
              filePath: fp,
              line: posOf(iface).line,
              extra: {},
              confidence: link?.item ? 1.0 : 0.4,
              confidenceTier: link?.item ? 'RESOLVED' : 'TEXTUAL',
            });
          }
        }
      },

      EnumStatement: (en: EnumStatement) => {
        const qname = `${fp}::${en.fullName}`;
        const ns = namespaceOf(en);
        nodes.push({
          kind: 'Enum',
          name: en.tokens.name.text,
          qualifiedName: qname,
          filePath: fp,
          lineStart: posOf(en).line,
          lineEnd: endLineOf(en),
          language: lang,
          parentName: null,
          params: null,
          returnType: null,
          modifiers: null,
          isTest: false,
          fileHash: null,
          extra: { members: en.getMembers().map(m => m.tokens.name.text) },
        });
        addEdge({
          kind: 'CONTAINS',
          sourceQualified: ns ? `${fp}::${ns}` : fileQname,
          targetQualified: qname,
          filePath: fp,
          line: posOf(en).line,
          extra: {},
          confidence: 1.0,
          confidenceTier: 'DECLARED',
        });
      },

      ConstStatement: (c: ConstStatement) => {
        const qname = `${fp}::${c.fullName}`;
        const ns = namespaceOf(c);
        nodes.push({
          kind: 'Const',
          name: c.tokens.name.text,
          qualifiedName: qname,
          filePath: fp,
          lineStart: posOf(c).line,
          lineEnd: posOf(c).line,
          language: lang,
          parentName: null,
          params: null,
          returnType: null,
          modifiers: null,
          isTest: false,
          fileHash: null,
          extra: {},
        });
        addEdge({
          kind: 'CONTAINS',
          sourceQualified: ns ? `${fp}::${ns}` : fileQname,
          targetQualified: qname,
          filePath: fp,
          line: posOf(c).line,
          extra: {},
          confidence: 1.0,
          confidenceTier: 'DECLARED',
        });
      },

      CallExpression: (expr) => {
        // `new Foo()` wraps a CallExpression for the constructor call itself; that's
        // already captured (and better resolved) by the NewExpression/INSTANTIATES visitor below.
        if (isNewExpression(expr.parent)) return;
        const calleeText = exprText(expr.callee);
        if (!calleeText) return;
        const site = enclosingScope(expr);
        const ns = namespaceOf(expr);
        const resolved = resolveCallTarget(expr.callee, calleeText, site.classChain, ns);
        addEdge({
          kind: 'CALLS',
          sourceQualified: site.qname,
          targetQualified: resolved.target,
          filePath: fp,
          line: posOf(expr).line,
          extra: { col: posOf(expr).col },
          confidence: resolved.confidence,
          confidenceTier: resolved.tier,
        });
      },

      NewExpression: (expr) => {
        const site = enclosingScope(expr);
        const ns = namespaceOf(expr);
        const resolved = resolveClassTarget(expr.className, ns);
        addEdge({
          kind: 'INSTANTIATES',
          sourceQualified: site.qname,
          targetQualified: resolved.target,
          filePath: fp,
          line: posOf(expr).line,
          extra: { col: posOf(expr).col },
          confidence: resolved.confidence,
          confidenceTier: resolved.tier,
        });
      },

      DottedSetStatement: (stmt) => {
        const memberName = stmt.tokens.name?.text;
        if (!memberName) return;
        const site = enclosingScope(stmt);
        const objText = exprText(stmt.obj);
        let target = objText ? `${objText}.${memberName}` : memberName;
        let tier: ConfidenceTier = 'TEXTUAL';
        let confidence = 0.4;

        if (site.classChain && objText?.toLowerCase() === 'm') {
          const found = findFieldInChain(site.classChain, memberName);
          if (found) {
            target = found.qname;
            tier = 'RESOLVED';
            confidence = 0.9;
          }
        }

        addEdge({
          kind: 'WRITES',
          sourceQualified: site.qname,
          targetQualified: target,
          filePath: fp,
          line: posOf(stmt).line,
          extra: { col: posOf(stmt).col },
          confidence,
          confidenceTier: tier,
        });
      },
    }),
    { walkMode: WalkMode.visitAllRecursive },
  );

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// XML components (.xml)
// ---------------------------------------------------------------------------

export function extractXmlFile(file: XmlFile, program: Program): { nodes: CrgNode[]; edges: CrgEdge[] } {
  const nodes: CrgNode[] = [];
  const edges: CrgEdge[] = [];
  const fp = file.srcPath;
  const componentName = file.componentName?.text;
  if (!componentName) return { nodes, edges };

  const qname = `${fp}::${componentName}`;
  const scope: Scope | undefined = safe(() => program.getFirstScopeForFile(file));

  nodes.push({
    kind: 'Component',
    name: componentName,
    qualifiedName: qname,
    filePath: fp,
    lineStart: 1,
    lineEnd: 0,
    language: 'xml',
    parentName: null,
    params: null,
    returnType: null,
    modifiers: null,
    isTest: false,
    fileHash: fileHash(file.fileContents ?? ''),
    extra: { extends: file.parentComponentName?.text ?? null },
  });

  const parentName = file.parentComponentName?.text;
  if (parentName) {
    const parent = safe(() => program.getComponent(parentName));
    addComponentExtendsEdge(edges, qname, parentName, parent?.file, fp);
  }

  for (const script of file.scriptTagImports) {
    const target = script.destPath ?? script.text;
    if (!target) continue;
    const resolved = safe(() => program.getFile(target));
    edges.push({
      kind: 'HAS_SCRIPT',
      sourceQualified: qname,
      targetQualified: resolved?.srcPath ?? target,
      filePath: fp,
      line: 0,
      extra: {},
      confidence: resolved ? 1.0 : 0.6,
      confidenceTier: resolved ? 'RESOLVED' : 'TEXTUAL',
    });
  }

  const component = file.ast.componentElement;
  const iface = component?.interfaceElement;
  if (iface) {
    for (const field of iface.fields) {
      const fieldQname = `${qname}::field:${field.id}`;
      nodes.push({
        kind: 'ComponentField',
        name: field.id,
        qualifiedName: fieldQname,
        filePath: fp,
        lineStart: field.location?.range?.start?.line != null ? field.location.range.start.line + 1 : 0,
        lineEnd: 0,
        language: 'xml',
        parentName: qname,
        params: null,
        returnType: field.type || null,
        modifiers: null,
        isTest: false,
        fileHash: null,
        extra: { onChange: field.onChange || null, alwaysNotify: field.alwaysNotify || null, alias: field.alias || null },
      });
      edges.push({
        kind: 'CONTAINS',
        sourceQualified: qname,
        targetQualified: fieldQname,
        filePath: fp,
        line: 0,
        extra: {},
        confidence: 1.0,
        confidenceTier: 'DECLARED',
      });

      if (field.onChange) {
        const callable = scope ? safe(() => scope.getCallableByName(field.onChange)) : undefined;
        const target = callable?.file
          ? `${(callable.file as BrsFile).srcPath}::${callable.getName(ParseMode.BrighterScript)}`
          : field.onChange;
        edges.push({
          kind: 'OBSERVES',
          sourceQualified: fieldQname,
          targetQualified: target,
          filePath: fp,
          line: 0,
          extra: {},
          confidence: callable ? 1.0 : 0.4,
          confidenceTier: callable ? 'RESOLVED' : 'TEXTUAL',
        });
      }
    }

    for (const fn of iface.functions) {
      const fnQname = `${qname}::function:${fn.name}`;
      const callable = scope ? safe(() => scope.getCallableByName(fn.name)) : undefined;
      nodes.push({
        kind: 'ComponentFunction',
        name: fn.name,
        qualifiedName: fnQname,
        filePath: fp,
        lineStart: fn.location?.range?.start?.line != null ? fn.location.range.start.line + 1 : 0,
        lineEnd: 0,
        language: 'xml',
        parentName: qname,
        params: null,
        returnType: null,
        modifiers: null,
        isTest: false,
        fileHash: null,
        extra: {},
      });
      edges.push({
        kind: 'CONTAINS',
        sourceQualified: qname,
        targetQualified: fnQname,
        filePath: fp,
        line: 0,
        extra: {},
        confidence: 1.0,
        confidenceTier: 'DECLARED',
      });
      if (callable?.file) {
        edges.push({
          kind: 'CALLS',
          sourceQualified: fnQname,
          targetQualified: `${(callable.file as BrsFile).srcPath}::${callable.getName(ParseMode.BrighterScript)}`,
          filePath: fp,
          line: 0,
          extra: { reason: 'component-interface-function' },
          confidence: 1.0,
          confidenceTier: 'RESOLVED',
        });
      }
    }
  }

  return { nodes, edges };
}

function addComponentExtendsEdge(
  edges: CrgEdge[],
  sourceQname: string,
  parentName: string,
  parentFile: XmlFile | undefined,
  fp: string,
): void {
  const target = parentFile ? `${parentFile.srcPath}::${parentName}` : `builtin::${parentName}`;
  edges.push({
    kind: 'EXTENDS',
    sourceQualified: sourceQname,
    targetQualified: target,
    filePath: fp,
    line: 0,
    extra: { builtin: !parentFile },
    confidence: parentFile ? 1.0 : 0.8,
    confidenceTier: parentFile ? 'RESOLVED' : 'DECLARED',
  });
}
