import sax, { QualifiedAttribute } from 'sax';
import { Node } from './types';
import { logger } from './debug';

const parseXml = (templateXml: string): Promise<Node> => {
  const parser = sax.parser(true, {
    // true for XML-like (false for HTML-like)
    trim: false,
    normalize: false,
  });
  let template: Node;
  let curNode: Node | null | undefined = null;
  let numXmlElements = 0;
  return new Promise((resolve, reject) => {
    parser.onopentag = node => {
      const newNode: Node = {
        _parent: curNode || undefined,
        _children: [],
        _fTextNode: false,
        _tag: node.name,
        _attrs: node.attributes,
      };
      if (curNode != null) curNode._children.push(newNode);
      else template = newNode;
      curNode = newNode;
      numXmlElements += 1;
    };
    parser.onclosetag = () => {
      curNode = curNode != null ? curNode._parent : null;
    };
    parser.ontext = text => {
      if (curNode == null) return;
      curNode._children.push({
        _parent: curNode,
        _children: [],
        _fTextNode: true,
        _text: text,
      });
    };
    parser.onend = () => {
      logger.debug(`Number of XML elements: ${numXmlElements}`);
      resolve(template);
    };
    parser.onerror = err => {
      reject(err);
    };
    parser.write(templateXml);
    parser.end();
  });
};

type XmlOptions = {
  literalXmlDelimiter: string;
  indentXml: boolean;
};

function buildXml(
  node: Node,
  options: XmlOptions,
  indent: string = '',
  firstRun: boolean = true
): Buffer {
  const xml =
    indent.length || !firstRun
      ? ''
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const xmlBuffers = [Buffer.from(xml, 'utf-8')];
  if (node._fTextNode)
    xmlBuffers.push(Buffer.from(sanitizeText(node._text, options)));
  else {
    let attrs = '';
    const nodeAttrs = node._attrs;
    Object.keys(nodeAttrs).forEach(key => {
      attrs += ` ${key}="${sanitizeAttr(nodeAttrs[key])}"`;
    });
    const fHasChildren = node._children.length > 0;
    const suffix = fHasChildren ? '' : '/';

    // Conditionally add newlines and indentation based on indentXml option
    const newline = options.indentXml ? `\n${indent}` : '';
    xmlBuffers.push(Buffer.from(`${newline}<${node._tag}${attrs}${suffix}>`));

    let fLastChildIsNode = false;
    node._children.forEach(child => {
      xmlBuffers.push(
        buildXml(child, options, options.indentXml ? `${indent}  ` : '', false)
      );
      fLastChildIsNode = !child._fTextNode;
    });
    if (fHasChildren) {
      // Only add indentation if indentXml is true and last child is a node
      const indent2 =
        options.indentXml && fLastChildIsNode ? `\n${indent}` : '';
      xmlBuffers.push(Buffer.from(`${indent2}</${node._tag}>`));
    }
  }
  return Buffer.concat(xmlBuffers);
}

// MEMORY OPTIMIZATION: Combined regex for XML entity escaping (single pass instead of multiple)
const TEXT_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};
const TEXT_ESCAPE_REGEX = /[&<>]/g;

const ATTR_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&apos;',
  '"': '&quot;',
};
const ATTR_ESCAPE_REGEX = /[&<>'"]/g;

const sanitizeText = (str: string, options: XmlOptions) => {
  const segments = str.split(options.literalXmlDelimiter);
  const result: string[] = [];
  let fLiteral = false;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    result.push(
      fLiteral
        ? segment
        : segment.replace(TEXT_ESCAPE_REGEX, ch => TEXT_ENTITIES[ch])
    );
    fLiteral = !fLiteral;
  }
  return result.join('');
};

const sanitizeAttr = (attr: string | QualifiedAttribute) => {
  const value = typeof attr === 'string' ? attr : attr.value;

  return value.replace(ATTR_ESCAPE_REGEX, ch => ATTR_ENTITIES[ch]);
};

// ==========================================
// Public API
// ==========================================
export { parseXml, buildXml };
