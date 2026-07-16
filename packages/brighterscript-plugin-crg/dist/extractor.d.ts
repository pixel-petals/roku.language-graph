import type { BrsFile, Program, XmlFile } from 'brighterscript';
export type CrgNodeKind = 'File' | 'Namespace' | 'Function' | 'Class' | 'Method' | 'Field' | 'Interface' | 'Enum' | 'Const' | 'Component' | 'ComponentField' | 'ComponentFunction';
export type CrgEdgeKind = 'CONTAINS' | 'CALLS' | 'IMPORTS_FROM' | 'EXTENDS' | 'INSTANTIATES' | 'HAS_SCRIPT' | 'OBSERVES' | 'WRITES';
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
export declare function extractBrsFile(file: BrsFile, program: Program): {
    nodes: CrgNode[];
    edges: CrgEdge[];
};
export declare function extractXmlFile(file: XmlFile, program: Program): {
    nodes: CrgNode[];
    edges: CrgEdge[];
};
//# sourceMappingURL=extractor.d.ts.map