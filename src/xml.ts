import sax, { QualifiedAttribute } from 'sax';
import { Node, NonTextNode } from './types';
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

export type XmlOptions = {
  literalXmlDelimiter: string;
  indentXml: boolean;
};

type Frame = {
  node: Node;
  indent: string;
  // -1 = not yet opened; otherwise index of the next child to visit
  i: number;
  lastChildIsNode: boolean;
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
export function* emitXml(root: Node, options: XmlOptions): Generator<string> {
  yield '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const stack: Frame[] = [
    { node: root, indent: '', i: -1, lastChildIsNode: false },
  ];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const node = frame.node;

    // Opening pass
    if (frame.i === -1) {
      if (node._fTextNode) {
        yield sanitizeText(node._text, options);
        stack.pop();
        continue;
      }
      let attrs = '';
      const nodeAttrs = node._attrs;
      Object.keys(nodeAttrs).forEach(key => {
        attrs += ` ${key}="${sanitizeAttr(nodeAttrs[key])}"`;
      });
      const fHasChildren = node._children.length > 0;
      const suffix = fHasChildren ? '' : '/';
      const newline = options.indentXml ? `\n${frame.indent}` : '';
      yield `${newline}<${node._tag}${attrs}${suffix}>`;
      if (!fHasChildren) {
        stack.pop();
        continue;
      }
      frame.i = 0;
      continue;
    }

    // Child pass
    if (frame.i < node._children.length) {
      const child = node._children[frame.i];
      frame.lastChildIsNode = !child._fTextNode;
      frame.i += 1;
      stack.push({
        node: child,
        indent: options.indentXml ? `${frame.indent}  ` : '',
        i: -1,
        lastChildIsNode: false,
      });
      continue;
    }

    // Closing pass
    // By construction, only non-text nodes reach this point: text nodes are
    // popped in the opening pass above, before ever being assigned a frame.i.
    const indent2 =
      options.indentXml && frame.lastChildIsNode ? `\n${frame.indent}` : '';
    yield `${indent2}</${(node as NonTextNode)._tag}>`;
    stack.pop();
  }
}

function buildXml(node: Node, options: XmlOptions): Buffer {
  return Buffer.from(Array.from(emitXml(node, options)).join(''), 'utf-8');
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
