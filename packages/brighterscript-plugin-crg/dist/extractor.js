"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBrsFile = extractBrsFile;
exports.extractXmlFile = extractXmlFile;
const brighterscript_1 = require("brighterscript");
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const ORIGIN = { line: 0, col: 0 };
function posOf(node) {
    var _a, _b;
    const start = (_b = (_a = node === null || node === void 0 ? void 0 : node.location) === null || _a === void 0 ? void 0 : _a.range) === null || _b === void 0 ? void 0 : _b.start;
    if (!start)
        return ORIGIN;
    return { line: start.line + 1, col: start.character };
}
function endLineOf(node) {
    var _a, _b, _c, _d;
    return ((_d = (_c = (_b = (_a = node === null || node === void 0 ? void 0 : node.location) === null || _a === void 0 ? void 0 : _a.range) === null || _b === void 0 ? void 0 : _b.end) === null || _c === void 0 ? void 0 : _c.line) !== null && _d !== void 0 ? _d : -1) + 1;
}
function fileHash(contents) {
    return crypto.createHash('sha1').update(contents).digest('hex');
}
/**
 * Resolve a callee-ish expression to a dotted name string.
 * Handles VariableExpression (foo), DottedGetExpression (a.b.c),
 * and falls back to getText() for anything else.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exprText(node) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!node)
        return null;
    if (typeof node.getText === 'function') {
        const text = (_b = (_a = node.getText()) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : '';
        if (text)
            return text;
    }
    const parts = [];
    let cur = node;
    while (cur) {
        const nameText = (_d = (_c = cur.name) === null || _c === void 0 ? void 0 : _c.text) !== null && _d !== void 0 ? _d : (_f = (_e = cur.tokens) === null || _e === void 0 ? void 0 : _e.name) === null || _f === void 0 ? void 0 : _f.text;
        if (nameText) {
            parts.unshift(nameText);
            cur = cur.obj;
        }
        else {
            const varName = (_j = (_h = (_g = cur.tokens) === null || _g === void 0 ? void 0 : _g.name) === null || _h === void 0 ? void 0 : _h.text) !== null && _j !== void 0 ? _j : (_k = cur.name) === null || _k === void 0 ? void 0 : _k.text;
            if (varName)
                parts.unshift(varName);
            break;
        }
    }
    return parts.length > 0 ? parts.join('.') : null;
}
/** Safely invoke a brighterscript resolution API that may throw on malformed/partial programs. */
function safe(fn) {
    try {
        return fn();
    }
    catch {
        return undefined;
    }
}
function typeExpressionText(typeExpr) {
    if (!typeExpr)
        return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return exprText(typeExpr.expression);
}
function namespaceOf(node) {
    const ns = node.findAncestor(brighterscript_1.isNamespaceStatement);
    return ns ? ns.getName(brighterscript_1.ParseMode.BrighterScript) : undefined;
}
function paramsJson(func) {
    var _a;
    const params = ((_a = func === null || func === void 0 ? void 0 : func.parameters) !== null && _a !== void 0 ? _a : []).map(p => {
        var _a, _b, _c, _d;
        return ({
            name: (_c = (_b = (_a = p.tokens) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.text) !== null && _c !== void 0 ? _c : '',
            type: (_d = typeExpressionText(p.typeExpression)) !== null && _d !== void 0 ? _d : undefined,
            optional: !!p.defaultValue,
        });
    });
    return JSON.stringify(params);
}
function returnTypeText(func) {
    return typeExpressionText(func === null || func === void 0 ? void 0 : func.returnTypeExpression);
}
function isSubKeyword(func) {
    var _a, _b, _c;
    return ((_c = (_b = (_a = func === null || func === void 0 ? void 0 : func.tokens) === null || _a === void 0 ? void 0 : _a.functionType) === null || _b === void 0 ? void 0 : _b.text) !== null && _c !== void 0 ? _c : '').toLowerCase() === 'sub';
}
function looksLikeTest(name, annotations) {
    if (annotations === null || annotations === void 0 ? void 0 : annotations.some(a => /test/i.test(a.name)))
        return true;
    return /test/i.test(name);
}
// ---------------------------------------------------------------------------
// BrightScript / BrighterScript (.brs / .bs) files
// ---------------------------------------------------------------------------
function extractBrsFile(file, program) {
    var _a, _b;
    const nodes = [];
    const edges = [];
    const seenEdges = new Set();
    const fp = file.srcPath;
    const lang = fp.endsWith('.bs') ? 'brighterscript' : 'brightscript';
    const fileQname = fp;
    const scope = safe(() => program.getFirstScopeForFile(file));
    function addEdge(e) {
        const key = `${e.kind}|${e.sourceQualified}|${e.targetQualified}|${e.line}`;
        if (seenEdges.has(key))
            return;
        seenEdges.add(key);
        edges.push(e);
    }
    function resolveFileSrcPath(destOrText) {
        var _a;
        const resolved = safe(() => program.getFile(destOrText));
        return (_a = resolved === null || resolved === void 0 ? void 0 : resolved.srcPath) !== null && _a !== void 0 ? _a : null;
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
        fileHash: fileHash((_a = file.fileContents) !== null && _a !== void 0 ? _a : ''),
        extra: { parser: 'brighterscript' },
    });
    // IMPORTS_FROM edges from library/import statements
    for (const imp of file.ownScriptImports) {
        const target = (_b = imp.destPath) !== null && _b !== void 0 ? _b : imp.text;
        if (!target)
            continue;
        const resolvedSrcPath = resolveFileSrcPath(target);
        addEdge({
            kind: 'IMPORTS_FROM',
            sourceQualified: fileQname,
            targetQualified: resolvedSrcPath !== null && resolvedSrcPath !== void 0 ? resolvedSrcPath : target,
            filePath: fp,
            line: 0,
            extra: {},
            confidence: resolvedSrcPath ? 1.0 : 0.6,
            confidenceTier: resolvedSrcPath ? 'RESOLVED' : 'TEXTUAL',
        });
    }
    /** Class name -> {cls, file} chain, self first then ancestors, resolved as far as possible. */
    function classChain(cls, containingNamespace) {
        const chain = [{ cls, file }];
        let current = cls;
        let guard = 0;
        while (current.hasParentClass() && guard++ < 50 && scope) {
            const parentText = typeExpressionText(current.parentClassName);
            if (!parentText)
                break;
            const link = safe(() => scope.getClassFileLink(parentText, containingNamespace));
            if (!(link === null || link === void 0 ? void 0 : link.item) || chain.some(c => c.cls === link.item))
                break;
            chain.push({ cls: link.item, file: link.file });
            current = link.item;
        }
        return chain;
    }
    function findMethodInChain(chain, methodName) {
        const lower = methodName.toLowerCase();
        for (const { cls, file: clsFile } of chain) {
            const method = cls.methods.find(m => { var _a, _b; return ((_b = (_a = m.tokens.name) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : '').toLowerCase() === lower; });
            if (method) {
                const classQname = `${clsFile.srcPath}::${cls.getName(brighterscript_1.ParseMode.BrighterScript)}`;
                return { qname: `${classQname}.${method.tokens.name.text}` };
            }
        }
        return null;
    }
    function findFieldInChain(chain, fieldName) {
        const lower = fieldName.toLowerCase();
        for (const { cls, file: clsFile } of chain) {
            const field = cls.fields.find(f => { var _a, _b; return ((_b = (_a = f.tokens.name) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : '').toLowerCase() === lower; });
            if (field) {
                const classQname = `${clsFile.srcPath}::${cls.getName(brighterscript_1.ParseMode.BrighterScript)}`;
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
    function enclosingScope(node) {
        const enclosingFunc = node.findAncestor(brighterscript_1.isFunctionExpression);
        if (!enclosingFunc)
            return { qname: fileQname };
        const owner = enclosingFunc.parent;
        if (owner && (0, brighterscript_1.isMethodStatement)(owner)) {
            const cls = owner.findAncestor(brighterscript_1.isClassStatement);
            if (cls) {
                const ns = namespaceOf(cls);
                const chain = classChain(cls, ns);
                const classQname = `${fp}::${cls.getName(brighterscript_1.ParseMode.BrighterScript)}`;
                return { qname: `${classQname}.${owner.tokens.name.text}`, classChain: chain };
            }
        }
        if (owner && (0, brighterscript_1.isFunctionStatement)(owner)) {
            return { qname: `${fp}::${owner.getName(brighterscript_1.ParseMode.BrighterScript)}` };
        }
        // Anonymous function expression (assigned to a var/field, passed as a callback, etc.)
        const pos = posOf(enclosingFunc);
        const outer = enclosingScope(enclosingFunc);
        return { qname: `${outer.qname}::<anonymous@${pos.line}:${pos.col}>`, classChain: outer.classChain };
    }
    function resolveCallTarget(calleeExpr, calleeText, classChainForSite, containingNamespace) {
        var _a, _b, _c, _d, _e;
        // `m.Foo(...)` inside a class method -> resolve against the class/ancestor method map.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = calleeExpr.obj;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const memberName = (_b = (_a = calleeExpr.name) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : (_d = (_c = calleeExpr.tokens) === null || _c === void 0 ? void 0 : _c.name) === null || _d === void 0 ? void 0 : _d.text;
        if (classChainForSite && obj && ((_e = exprText(obj)) === null || _e === void 0 ? void 0 : _e.toLowerCase()) === 'm' && memberName) {
            const found = findMethodInChain(classChainForSite, memberName);
            if (found)
                return { target: found.qname, tier: 'RESOLVED', confidence: 0.9 };
        }
        if (scope) {
            const callable = safe(() => scope.getCallableByName(calleeText));
            if (callable === null || callable === void 0 ? void 0 : callable.file) {
                const qname = `${callable.file.srcPath}::${callable.getName(brighterscript_1.ParseMode.BrighterScript)}`;
                return { target: qname, tier: 'RESOLVED', confidence: 1.0 };
            }
        }
        return { target: calleeText, tier: 'TEXTUAL', confidence: 0.4 };
    }
    function resolveClassTarget(classNameExpr, containingNamespace) {
        var _a;
        const text = (_a = exprText(classNameExpr)) !== null && _a !== void 0 ? _a : 'UnknownClass';
        if (scope) {
            const link = safe(() => scope.getClassFileLink(text, containingNamespace));
            if (link === null || link === void 0 ? void 0 : link.item) {
                return {
                    target: `${link.file.srcPath}::${link.item.getName(brighterscript_1.ParseMode.BrighterScript)}`,
                    tier: 'RESOLVED',
                    confidence: 1.0,
                };
            }
        }
        return { target: text, tier: 'TEXTUAL', confidence: 0.4 };
    }
    const ast = file.ast;
    if (!(ast === null || ast === void 0 ? void 0 : ast.walk))
        return { nodes, edges };
    ast.walk((0, brighterscript_1.createVisitor)({
        NamespaceStatement: (ns) => {
            const qname = `${fp}::${ns.getName(brighterscript_1.ParseMode.BrighterScript)}`;
            nodes.push({
                kind: 'Namespace',
                name: ns.getName(brighterscript_1.ParseMode.BrighterScript),
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
        FunctionStatement: (stmt) => {
            const fullName = stmt.getName(brighterscript_1.ParseMode.BrighterScript);
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
                extra: { col: posOf(stmt).col, namespace: ns !== null && ns !== void 0 ? ns : null },
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
        ClassStatement: (cls) => {
            var _a, _b, _c, _d;
            const fullName = cls.getName(brighterscript_1.ParseMode.BrighterScript);
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
                extra: { namespace: ns !== null && ns !== void 0 ? ns : null },
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
                const resolved = resolveClassTarget(cls.parentClassName.expression, ns);
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
                    (_b = (_a = method.accessModifier) === null || _a === void 0 ? void 0 : _a.text) !== null && _b !== void 0 ? _b : 'public',
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
                const modifiers = [(_d = (_c = field.tokens.accessModifier) === null || _c === void 0 ? void 0 : _c.text) !== null && _d !== void 0 ? _d : 'public'].filter(Boolean);
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
        InterfaceStatement: (iface) => {
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
                const text = typeExpressionText(iface.parentInterfaceName);
                if (text) {
                    const link = scope ? safe(() => scope.getInterfaceFileLink(text, ns)) : undefined;
                    addEdge({
                        kind: 'EXTENDS',
                        sourceQualified: qname,
                        targetQualified: (link === null || link === void 0 ? void 0 : link.item) ? `${link.file.srcPath}::${link.item.fullName}` : text,
                        filePath: fp,
                        line: posOf(iface).line,
                        extra: {},
                        confidence: (link === null || link === void 0 ? void 0 : link.item) ? 1.0 : 0.4,
                        confidenceTier: (link === null || link === void 0 ? void 0 : link.item) ? 'RESOLVED' : 'TEXTUAL',
                    });
                }
            }
        },
        EnumStatement: (en) => {
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
        ConstStatement: (c) => {
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
            if ((0, brighterscript_1.isNewExpression)(expr.parent))
                return;
            const calleeText = exprText(expr.callee);
            if (!calleeText)
                return;
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
            var _a;
            const memberName = (_a = stmt.tokens.name) === null || _a === void 0 ? void 0 : _a.text;
            if (!memberName)
                return;
            const site = enclosingScope(stmt);
            const objText = exprText(stmt.obj);
            let target = objText ? `${objText}.${memberName}` : memberName;
            let tier = 'TEXTUAL';
            let confidence = 0.4;
            if (site.classChain && (objText === null || objText === void 0 ? void 0 : objText.toLowerCase()) === 'm') {
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
    }), { walkMode: brighterscript_1.WalkMode.visitAllRecursive });
    return { nodes, edges };
}
// ---------------------------------------------------------------------------
// XML components (.xml)
// ---------------------------------------------------------------------------
function extractXmlFile(file, program) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const nodes = [];
    const edges = [];
    const fp = file.srcPath;
    const componentName = (_a = file.componentName) === null || _a === void 0 ? void 0 : _a.text;
    if (!componentName)
        return { nodes, edges };
    const qname = `${fp}::${componentName}`;
    const scope = safe(() => program.getFirstScopeForFile(file));
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
        fileHash: fileHash((_b = file.fileContents) !== null && _b !== void 0 ? _b : ''),
        extra: { extends: (_d = (_c = file.parentComponentName) === null || _c === void 0 ? void 0 : _c.text) !== null && _d !== void 0 ? _d : null },
    });
    const parentName = (_e = file.parentComponentName) === null || _e === void 0 ? void 0 : _e.text;
    if (parentName) {
        const parent = safe(() => program.getComponent(parentName));
        addComponentExtendsEdge(edges, qname, parentName, parent === null || parent === void 0 ? void 0 : parent.file, fp);
    }
    for (const script of file.scriptTagImports) {
        const target = (_f = script.destPath) !== null && _f !== void 0 ? _f : script.text;
        if (!target)
            continue;
        const resolved = safe(() => program.getFile(target));
        edges.push({
            kind: 'HAS_SCRIPT',
            sourceQualified: qname,
            targetQualified: (_g = resolved === null || resolved === void 0 ? void 0 : resolved.srcPath) !== null && _g !== void 0 ? _g : target,
            filePath: fp,
            line: 0,
            extra: {},
            confidence: resolved ? 1.0 : 0.6,
            confidenceTier: resolved ? 'RESOLVED' : 'TEXTUAL',
        });
    }
    const component = file.ast.componentElement;
    const iface = component === null || component === void 0 ? void 0 : component.interfaceElement;
    if (iface) {
        for (const field of iface.fields) {
            const fieldQname = `${qname}::field:${field.id}`;
            nodes.push({
                kind: 'ComponentField',
                name: field.id,
                qualifiedName: fieldQname,
                filePath: fp,
                lineStart: ((_k = (_j = (_h = field.location) === null || _h === void 0 ? void 0 : _h.range) === null || _j === void 0 ? void 0 : _j.start) === null || _k === void 0 ? void 0 : _k.line) != null ? field.location.range.start.line + 1 : 0,
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
                const target = (callable === null || callable === void 0 ? void 0 : callable.file)
                    ? `${callable.file.srcPath}::${callable.getName(brighterscript_1.ParseMode.BrighterScript)}`
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
                lineStart: ((_o = (_m = (_l = fn.location) === null || _l === void 0 ? void 0 : _l.range) === null || _m === void 0 ? void 0 : _m.start) === null || _o === void 0 ? void 0 : _o.line) != null ? fn.location.range.start.line + 1 : 0,
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
            if (callable === null || callable === void 0 ? void 0 : callable.file) {
                edges.push({
                    kind: 'CALLS',
                    sourceQualified: fnQname,
                    targetQualified: `${callable.file.srcPath}::${callable.getName(brighterscript_1.ParseMode.BrighterScript)}`,
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
function addComponentExtendsEdge(edges, sourceQname, parentName, parentFile, fp) {
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
//# sourceMappingURL=extractor.js.map