/**
 * roku-app.xml.mjs
 *
 * Extracts graph nodes/edges from a single SceneGraph component (.xml) file:
 * the component itself, its <interface> fields/functions, and its EXTENDS /
 * HAS_SCRIPT / OBSERVES relationships, resolved via the `brighterscript`
 * program where possible.
 */

import { ParseMode } from 'brighterscript';
import * as crypto from 'crypto';

function fileHash(contents) {
  return crypto.createHash('sha1').update(contents).digest('hex');
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function lineOf(node) {
  return node?.location?.range?.start?.line != null ? node.location.range.start.line + 1 : 0;
}

function extendsEdge(sourceQname, parentName, parentFile, fp) {
  const target = parentFile ? `${parentFile.srcPath}::${parentName}` : `builtin::${parentName}`;
  return { kind: 'EXTENDS', sourceQualified: sourceQname, targetQualified: target, filePath: fp, line: 0, extra: { builtin: !parentFile }, confidence: parentFile ? 1.0 : 0.8, confidenceTier: parentFile ? 'RESOLVED' : 'DECLARED' };
}

function extractInterfaceFields(iface, qname, fp, scope, nodes, edges) {
  for (const field of iface.fields) {
    const fieldQname = `${qname}::field:${field.id}`;
    nodes.push({
      kind: 'ComponentField', name: field.id, qualifiedName: fieldQname, filePath: fp,
      lineStart: lineOf(field), lineEnd: 0, language: 'xml', parentName: qname,
      params: null, returnType: field.type || null, modifiers: null, isTest: false, fileHash: null,
      extra: { onChange: field.onChange || null, alwaysNotify: field.alwaysNotify || null, alias: field.alias || null },
    });
    edges.push({ kind: 'CONTAINS', sourceQualified: qname, targetQualified: fieldQname, filePath: fp, line: 0, extra: {}, confidence: 1.0, confidenceTier: 'DECLARED' });

    if (field.onChange) {
      const callable = scope ? safe(() => scope.getCallableByName(field.onChange)) : undefined;
      const target = callable?.file ? `${callable.file.srcPath}::${callable.getName(ParseMode.BrighterScript)}` : field.onChange;
      edges.push({ kind: 'OBSERVES', sourceQualified: fieldQname, targetQualified: target, filePath: fp, line: 0, extra: {}, confidence: callable ? 1.0 : 0.4, confidenceTier: callable ? 'RESOLVED' : 'TEXTUAL' });
    }
  }
}

function extractInterfaceFunctions(iface, qname, fp, scope, nodes, edges) {
  for (const fn of iface.functions) {
    const fnQname = `${qname}::function:${fn.name}`;
    const callable = scope ? safe(() => scope.getCallableByName(fn.name)) : undefined;
    nodes.push({
      kind: 'ComponentFunction', name: fn.name, qualifiedName: fnQname, filePath: fp,
      lineStart: lineOf(fn), lineEnd: 0, language: 'xml', parentName: qname,
      params: null, returnType: null, modifiers: null, isTest: false, fileHash: null, extra: {},
    });
    edges.push({ kind: 'CONTAINS', sourceQualified: qname, targetQualified: fnQname, filePath: fp, line: 0, extra: {}, confidence: 1.0, confidenceTier: 'DECLARED' });
    if (callable?.file) {
      edges.push({ kind: 'CALLS', sourceQualified: fnQname, targetQualified: `${callable.file.srcPath}::${callable.getName(ParseMode.BrighterScript)}`, filePath: fp, line: 0, extra: { reason: 'component-interface-function' }, confidence: 1.0, confidenceTier: 'RESOLVED' });
    }
  }
}

/** Extract nodes/edges for a single XmlFile: the component, its interface, and its relationships. */
export function extractXmlFile(file, program) {
  const nodes = [];
  const edges = [];
  const fp = file.srcPath;
  const componentName = file.componentName?.text;
  if (!componentName) return { nodes, edges };

  const qname = `${fp}::${componentName}`;
  const scope = safe(() => program.getFirstScopeForFile(file));

  nodes.push({
    kind: 'Component', name: componentName, qualifiedName: qname, filePath: fp,
    lineStart: 1, lineEnd: 0, language: 'xml', parentName: null,
    params: null, returnType: null, modifiers: null, isTest: false,
    fileHash: fileHash(file.fileContents ?? ''), extra: { extends: file.parentComponentName?.text ?? null },
  });

  const parentName = file.parentComponentName?.text;
  if (parentName) {
    const parent = safe(() => program.getComponent(parentName));
    edges.push(extendsEdge(qname, parentName, parent?.file, fp));
  }

  for (const script of file.scriptTagImports) {
    const target = script.destPath ?? script.text;
    if (!target) continue;
    const resolved = safe(() => program.getFile(target));
    edges.push({ kind: 'HAS_SCRIPT', sourceQualified: qname, targetQualified: resolved?.srcPath ?? target, filePath: fp, line: 0, extra: {}, confidence: resolved ? 1.0 : 0.6, confidenceTier: resolved ? 'RESOLVED' : 'TEXTUAL' });
  }

  const iface = file.ast.componentElement?.interfaceElement;
  if (iface) {
    extractInterfaceFields(iface, qname, fp, scope, nodes, edges);
    extractInterfaceFunctions(iface, qname, fp, scope, nodes, edges);
  }

  return { nodes, edges };
}
