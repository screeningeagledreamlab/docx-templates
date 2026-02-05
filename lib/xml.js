"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildXml = exports.parseXml = void 0;
var sax_1 = __importDefault(require("sax"));
var debug_1 = require("./debug");
var parseXml = function (templateXml) {
    var parser = sax_1.default.parser(true, {
        // true for XML-like (false for HTML-like)
        trim: false,
        normalize: false,
    });
    var template;
    var curNode = null;
    var numXmlElements = 0;
    return new Promise(function (resolve, reject) {
        parser.onopentag = function (node) {
            var newNode = {
                _parent: curNode || undefined,
                _children: [],
                _fTextNode: false,
                _tag: node.name,
                _attrs: node.attributes,
            };
            if (curNode != null)
                curNode._children.push(newNode);
            else
                template = newNode;
            curNode = newNode;
            numXmlElements += 1;
        };
        parser.onclosetag = function () {
            curNode = curNode != null ? curNode._parent : null;
        };
        parser.ontext = function (text) {
            if (curNode == null)
                return;
            curNode._children.push({
                _parent: curNode,
                _children: [],
                _fTextNode: true,
                _text: text,
            });
        };
        parser.onend = function () {
            debug_1.logger.debug("Number of XML elements: ".concat(numXmlElements));
            resolve(template);
        };
        parser.onerror = function (err) {
            reject(err);
        };
        parser.write(templateXml);
        parser.end();
    });
};
exports.parseXml = parseXml;
function buildXml(node, options, indent, firstRun) {
    if (indent === void 0) { indent = ''; }
    if (firstRun === void 0) { firstRun = true; }
    var xml = indent.length || !firstRun
        ? ''
        : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var xmlBuffers = [Buffer.from(xml, 'utf-8')];
    if (node._fTextNode)
        xmlBuffers.push(Buffer.from(sanitizeText(node._text, options)));
    else {
        var attrs_1 = '';
        var nodeAttrs_1 = node._attrs;
        Object.keys(nodeAttrs_1).forEach(function (key) {
            attrs_1 += " ".concat(key, "=\"").concat(sanitizeAttr(nodeAttrs_1[key]), "\"");
        });
        var fHasChildren = node._children.length > 0;
        var suffix = fHasChildren ? '' : '/';
        // Conditionally add newlines and indentation based on indentXml option
        var newline = options.indentXml ? "\n".concat(indent) : '';
        xmlBuffers.push(Buffer.from("".concat(newline, "<").concat(node._tag).concat(attrs_1).concat(suffix, ">")));
        var fLastChildIsNode_1 = false;
        node._children.forEach(function (child) {
            xmlBuffers.push(buildXml(child, options, options.indentXml ? "".concat(indent, "  ") : '', false));
            fLastChildIsNode_1 = !child._fTextNode;
        });
        if (fHasChildren) {
            // Only add indentation if indentXml is true and last child is a node
            var indent2 = options.indentXml && fLastChildIsNode_1 ? "\n".concat(indent) : '';
            xmlBuffers.push(Buffer.from("".concat(indent2, "</").concat(node._tag, ">")));
        }
    }
    return Buffer.concat(xmlBuffers);
}
exports.buildXml = buildXml;
// MEMORY OPTIMIZATION: Combined regex for XML entity escaping (single pass instead of multiple)
var TEXT_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
};
var TEXT_ESCAPE_REGEX = /[&<>]/g;
var ATTR_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&apos;',
    '"': '&quot;',
};
var ATTR_ESCAPE_REGEX = /[&<>'"]/g;
var sanitizeText = function (str, options) {
    var segments = str.split(options.literalXmlDelimiter);
    var result = [];
    var fLiteral = false;
    for (var i = 0; i < segments.length; i++) {
        var segment = segments[i];
        result.push(fLiteral
            ? segment
            : segment.replace(TEXT_ESCAPE_REGEX, function (ch) { return TEXT_ENTITIES[ch]; }));
        fLiteral = !fLiteral;
    }
    return result.join('');
};
var sanitizeAttr = function (attr) {
    var value = typeof attr === 'string' ? attr : attr.value;
    return value.replace(ATTR_ESCAPE_REGEX, function (ch) { return ATTR_ENTITIES[ch]; });
};
