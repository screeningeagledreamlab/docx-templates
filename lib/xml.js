"use strict";
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildXml = exports.parseXml = exports.emitXml = void 0;
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
function emitXml(root, options) {
    var stack, _loop_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'];
            case 1:
                _a.sent();
                stack = [
                    { node: root, indent: '', i: -1, lastChildIsNode: false },
                ];
                _loop_1 = function () {
                    var frame, node, attrs_1, nodeAttrs_1, fHasChildren, suffix, newline, child, indent2;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                frame = stack[stack.length - 1];
                                node = frame.node;
                                if (!(frame.i === -1)) return [3 /*break*/, 4];
                                if (!node._fTextNode) return [3 /*break*/, 2];
                                return [4 /*yield*/, sanitizeText(node._text, options)];
                            case 1:
                                _b.sent();
                                stack.pop();
                                return [2 /*return*/, "continue"];
                            case 2:
                                attrs_1 = '';
                                nodeAttrs_1 = node._attrs;
                                Object.keys(nodeAttrs_1).forEach(function (key) {
                                    attrs_1 += " ".concat(key, "=\"").concat(sanitizeAttr(nodeAttrs_1[key]), "\"");
                                });
                                fHasChildren = node._children.length > 0;
                                suffix = fHasChildren ? '' : '/';
                                newline = options.indentXml ? "\n".concat(frame.indent) : '';
                                return [4 /*yield*/, "".concat(newline, "<").concat(node._tag).concat(attrs_1).concat(suffix, ">")];
                            case 3:
                                _b.sent();
                                if (!fHasChildren) {
                                    stack.pop();
                                    return [2 /*return*/, "continue"];
                                }
                                frame.i = 0;
                                return [2 /*return*/, "continue"];
                            case 4:
                                // Child pass
                                if (frame.i < node._children.length) {
                                    child = node._children[frame.i];
                                    frame.lastChildIsNode = !child._fTextNode;
                                    frame.i += 1;
                                    stack.push({
                                        node: child,
                                        indent: options.indentXml ? "".concat(frame.indent, "  ") : '',
                                        i: -1,
                                        lastChildIsNode: false,
                                    });
                                    return [2 /*return*/, "continue"];
                                }
                                indent2 = options.indentXml && frame.lastChildIsNode ? "\n".concat(frame.indent) : '';
                                return [4 /*yield*/, "".concat(indent2, "</").concat(node._tag, ">")];
                            case 5:
                                _b.sent();
                                stack.pop();
                                return [2 /*return*/];
                        }
                    });
                };
                _a.label = 2;
            case 2:
                if (!(stack.length > 0)) return [3 /*break*/, 4];
                return [5 /*yield**/, _loop_1()];
            case 3:
                _a.sent();
                return [3 /*break*/, 2];
            case 4: return [2 /*return*/];
        }
    });
}
exports.emitXml = emitXml;
function buildXml(node, options) {
    // Accumulate into a single string rather than `Array.from(...).join('')`:
    // Array.from materialises EVERY chunk before joining, so peak memory holds
    // the chunk array plus the joined string plus the Buffer. On a ~49.5MB XML
    // tree that measured +414MB peak against +368MB for plain string
    // accumulation -- a regression on the path every in-memory caller runs.
    //
    // The manual iterator loop (rather than `for...of`) is deliberate: this
    // project targets es5 without downlevelIteration, so iterating a Generator
    // directly does not type-check. writeXml (src/diskSinks.ts) does the same.
    var s = '';
    var it = emitXml(node, options);
    var r = it.next();
    while (!r.done) {
        s += r.value;
        r = it.next();
    }
    return Buffer.from(s, 'utf-8');
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
