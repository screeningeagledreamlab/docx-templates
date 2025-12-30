/// <reference types="node" />
import { Node } from './types';
declare const parseXml: (templateXml: string) => Promise<Node>;
type XmlOptions = {
    literalXmlDelimiter: string;
    indentXml: boolean;
};
declare function buildXml(node: Node, options: XmlOptions, indent?: string, firstRun?: boolean): Buffer;
export { parseXml, buildXml };
