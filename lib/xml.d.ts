/// <reference types="node" />
import { Node } from './types';
declare const parseXml: (templateXml: string) => Promise<Node>;
export type XmlOptions = {
    literalXmlDelimiter: string;
    indentXml: boolean;
};
/**
 * Emit a node tree as XML string chunks.
 *
 * Iterative (explicit stack) rather than recursive: the previous implementation
 * called Buffer.concat at every node, which allocated O(depth x size), and it
 * blew the JS stack on deeply nested documents.
 *
 * This is the single source of truth for XML serialisation. `buildXml` and
 * `writeXml` (src/diskSinks.ts) are both thin consumers of it, so their output
 * is byte-identical by construction.
 */
export declare function emitXml(root: Node, options: XmlOptions): Generator<string>;
declare function buildXml(node: Node, options: XmlOptions): Buffer;
export { parseXml, buildXml };
