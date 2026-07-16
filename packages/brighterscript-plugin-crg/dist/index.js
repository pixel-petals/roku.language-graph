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
exports.default = crgPlugin;
const brighterscript_1 = require("brighterscript");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const extractor_1 = require("./extractor");
const writer_1 = require("./writer");
function stripRoot(s, prefix) {
    // Only strip if the string starts with the root prefix.
    // Bare callee names (e.g. "parseResponse", "m.top.setFocus") are left as-is.
    return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}
function relativizePaths(data, rootDir) {
    const prefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
    function rel(qname) {
        // qualified names may be "abs/path::symbol" or just "abs/path"
        const sep = qname.indexOf('::');
        if (sep === -1)
            return stripRoot(qname, prefix);
        return stripRoot(qname.slice(0, sep), prefix) + '::' + qname.slice(sep + 2);
    }
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: data.nodes.map(n => ({
            ...n,
            file_path: stripRoot(n.file_path, prefix),
            qualified_name: rel(n.qualified_name),
            parent_name: n.parent_name ? rel(n.parent_name) : n.parent_name,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges: data.edges.map(e => ({
            ...e,
            file_path: stripRoot(e.file_path, prefix),
            source_qualified: rel(e.source_qualified),
            target_qualified: rel(e.target_qualified),
        })),
    };
}
function crgPlugin(options = {}, 
// second arg is the standard v1 PluginFactoryOptions (version info); unused here
_bscOptions) {
    return {
        name: 'brighterscript-plugin-crg',
        afterValidateProgram(event) {
            var _a, _b, _c;
            if (event.wasCancelled)
                return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rootDir = (_a = event.program.options.rootDir) !== null && _a !== void 0 ? _a : process.cwd();
            const rawDbPath = (_c = (_b = options.dbPath) !== null && _b !== void 0 ? _b : process.env['BSC_CRG_DB_PATH']) !== null && _c !== void 0 ? _c : path.join(rootDir, '.code-review-graph', 'graph.db');
            const dbPath = path.isAbsolute(rawDbPath)
                ? rawDbPath
                : path.resolve(rootDir, rawDbPath);
            const writer = new writer_1.GraphWriter(dbPath);
            try {
                for (const file of Object.values(event.program.files)) {
                    if ((0, brighterscript_1.isBrsFile)(file)) {
                        const { nodes, edges } = (0, extractor_1.extractBrsFile)(file, event.program);
                        writer.upsertNodes(nodes);
                        writer.upsertEdges(edges);
                    }
                    else if ((0, brighterscript_1.isXmlFile)(file)) {
                        const { nodes, edges } = (0, extractor_1.extractXmlFile)(file, event.program);
                        writer.upsertNodes(nodes);
                        writer.upsertEdges(edges);
                    }
                }
            }
            finally {
                writer.flush();
                const jsonPath = dbPath.replace(/\.db$/, '.json');
                const absRootDir = path.resolve(rootDir);
                fs.writeFileSync(jsonPath, JSON.stringify(relativizePaths(writer.queryAll(), absRootDir), null, 2));
                writer.close();
            }
        },
    };
}
//# sourceMappingURL=index.js.map