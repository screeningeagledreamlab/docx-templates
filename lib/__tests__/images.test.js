"use strict";
/* eslint-env jest */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
var path_1 = __importDefault(require("path"));
var fs_1 = __importDefault(require("fs"));
var pngjs_1 = require("pngjs");
var index_1 = require("../index");
var debug_1 = require("../debug");
var jszip_1 = __importDefault(require("jszip"));
if (process.env.DEBUG)
    (0, debug_1.setDebugLogSink)(console.log);
it('001: Issue #61 Correctly renders an SVG image', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, thumbnail, opts, result;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imagesSVG.docx'))];
            case 1:
                template = _b.sent();
                _a = {};
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                thumbnail = (_a.data = _b.sent(),
                    _a.extension = '.png',
                    _a);
                opts = {
                    template: template,
                    data: {},
                    additionalJsContext: {
                        svgImgFile: function () { return __awaiter(void 0, void 0, void 0, function () {
                            var data;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.svg'))];
                                    case 1:
                                        data = _a.sent();
                                        return [2 /*return*/, {
                                                width: 6,
                                                height: 6,
                                                data: data,
                                                extension: '.svg',
                                                thumbnail: thumbnail,
                                            }];
                                }
                            });
                        }); },
                        svgImgStr: function () {
                            var data = Buffer.from("<svg  xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n                                  <rect x=\"10\" y=\"10\" height=\"100\" width=\"100\" style=\"stroke:#ff0000; fill: #0000ff\"/>\n                              </svg>", 'utf-8');
                            return {
                                width: 6,
                                height: 6,
                                data: data,
                                extension: '.svg',
                                thumbnail: thumbnail,
                            };
                        },
                    },
                };
                return [4 /*yield*/, (0, index_1.createReport)(opts, 'JS')];
            case 3:
                result = _b.sent();
                expect(result).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
it('002: throws when thumbnail is incorrectly provided when inserting an SVG', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, thumbnail, opts;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imagesSVG.docx'))];
            case 1:
                template = _b.sent();
                _a = {};
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                thumbnail = (_a.data = _b.sent(),
                    _a);
                opts = {
                    template: template,
                    data: {},
                    additionalJsContext: {
                        svgImgFile: function () { return __awaiter(void 0, void 0, void 0, function () {
                            var data;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.svg'))];
                                    case 1:
                                        data = _a.sent();
                                        return [2 /*return*/, {
                                                width: 6,
                                                height: 6,
                                                data: data,
                                                extension: '.svg',
                                                thumbnail: thumbnail,
                                            }];
                                }
                            });
                        }); },
                        svgImgStr: function () {
                            var data = Buffer.from("<svg  xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n                                  <rect x=\"10\" y=\"10\" height=\"100\" width=\"100\" style=\"stroke:#ff0000; fill: #0000ff\"/>\n                              </svg>", 'utf-8');
                            return {
                                width: 6,
                                height: 6,
                                data: data,
                                extension: '.svg',
                                thumbnail: thumbnail,
                            };
                        },
                    },
                };
                return [2 /*return*/, expect((0, index_1.createReport)(opts)).rejects.toMatchSnapshot()];
        }
    });
}); });
it('003: can inject an svg without a thumbnail', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, opts, result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imagesSVG.docx'))];
            case 1:
                template = _a.sent();
                opts = {
                    template: template,
                    data: {},
                    additionalJsContext: {
                        svgImgFile: function () { return __awaiter(void 0, void 0, void 0, function () {
                            var data;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.svg'))];
                                    case 1:
                                        data = _a.sent();
                                        return [2 /*return*/, {
                                                width: 6,
                                                height: 6,
                                                data: data,
                                                extension: '.svg',
                                            }];
                                }
                            });
                        }); },
                        svgImgStr: function () {
                            var data = Buffer.from("<svg  xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n                                  <rect x=\"10\" y=\"10\" height=\"100\" width=\"100\" style=\"stroke:#ff0000; fill: #0000ff\"/>\n                              </svg>", 'utf-8');
                            return {
                                width: 6,
                                height: 6,
                                data: data,
                                extension: '.svg',
                            };
                        },
                    },
                };
                return [4 /*yield*/, (0, index_1.createReport)(opts, 'JS')];
            case 2:
                result = _a.sent();
                expect(result).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
it('004: can inject an image in the document header (regression test for #113)', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, opts, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageHeader.docx'))];
            case 1:
                template = _b.sent();
                opts = {
                    template: template,
                    data: {},
                    additionalJsContext: {
                        image: function () { return __awaiter(void 0, void 0, void 0, function () {
                            var data;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
                                    case 1:
                                        data = _a.sent();
                                        return [2 /*return*/, {
                                                width: 6,
                                                height: 6,
                                                data: data,
                                                extension: '.png',
                                            }];
                                }
                            });
                        }); },
                    },
                };
                // NOTE: bug does not happen when using debug probe arguments ('JS' or 'XML'),
                // as these exit before the headers are parsed.
                // TODO: build a snapshot test once _probe === 'XML' properly includes all document XMLs, not just
                // the main document
                _a = expect;
                return [4 /*yield*/, (0, index_1.createReport)(opts)];
            case 2:
                // NOTE: bug does not happen when using debug probe arguments ('JS' or 'XML'),
                // as these exit before the headers are parsed.
                // TODO: build a snapshot test once _probe === 'XML' properly includes all document XMLs, not just
                // the main document
                _a.apply(void 0, [_b.sent()]).toBeInstanceOf(Uint8Array);
                return [2 /*return*/];
        }
    });
}); });
it('005: can inject PNG files using ArrayBuffers without errors (related to issue #166)', function () { return __awaiter(void 0, void 0, void 0, function () {
    function toArrayBuffer(buf) {
        var ab = new ArrayBuffer(buf.length);
        var view = new Uint8Array(ab);
        for (var i = 0; i < buf.length; ++i) {
            view[i] = buf[i];
        }
        return ab;
    }
    var template, buff, fromAB, fromB;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageSimple.docx'))];
            case 1:
                template = _a.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                buff = _a.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        data: {},
                        additionalJsContext: {
                            injectImg: function () {
                                return {
                                    width: 6,
                                    height: 6,
                                    data: toArrayBuffer(buff),
                                    extension: '.png',
                                };
                            },
                        },
                    })];
            case 3:
                fromAB = _a.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        data: {},
                        additionalJsContext: {
                            injectImg: function () {
                                return {
                                    width: 6,
                                    height: 6,
                                    data: buff,
                                    extension: '.png',
                                };
                            },
                        },
                    })];
            case 4:
                fromB = _a.sent();
                expect(fromAB).toBeInstanceOf(Uint8Array);
                expect(fromB).toBeInstanceOf(Uint8Array);
                expect(fromAB).toStrictEqual(fromB);
                return [2 /*return*/];
        }
    });
}); });
it('006: can inject an image from the data instead of the additionalJsContext', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, buff, reportA, reportB, zip;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageSimple.docx'))];
            case 1:
                template = _b.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                buff = _b.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        data: {
                            injectImg: function () { return ({
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.png',
                            }); },
                        },
                    })];
            case 3:
                reportA = _b.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        data: {},
                        additionalJsContext: {
                            injectImg: function () { return ({
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.png',
                            }); },
                        },
                    })];
            case 4:
                reportB = _b.sent();
                expect(reportA).toBeInstanceOf(Uint8Array);
                expect(reportB).toBeInstanceOf(Uint8Array);
                expect(reportA).toStrictEqual(reportB);
                return [4 /*yield*/, jszip_1.default.loadAsync(reportA)];
            case 5:
                zip = _b.sent();
                expect(Object.keys((_a = zip === null || zip === void 0 ? void 0 : zip.files) !== null && _a !== void 0 ? _a : {})).toMatchInlineSnapshot("\n    [\n      \"[Content_Types].xml\",\n      \"_rels/.rels\",\n      \"word/_rels/document.xml.rels\",\n      \"word/document.xml\",\n      \"word/theme/theme1.xml\",\n      \"word/settings.xml\",\n      \"word/fontTable.xml\",\n      \"word/webSettings.xml\",\n      \"docProps/app.xml\",\n      \"docProps/core.xml\",\n      \"word/styles.xml\",\n      \"word/\",\n      \"word/media/\",\n      \"word/media/template_document.xml_img1.png\",\n      \"word/_rels/\",\n    ]\n  ");
                return [2 /*return*/];
        }
    });
}); });
it('007: can inject an image in a document that already contains images (regression test for #144)', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, buff, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageExisting.docx'))];
            case 1:
                template = _b.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                buff = _b.sent();
                _a = expect;
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        data: {
                            cv: { ProfilePicture: { url: 'abc' } },
                        },
                        additionalJsContext: {
                            getImage: function () { return ({
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.png',
                            }); },
                        },
                    }, 'XML')];
            case 3:
                _a.apply(void 0, [_b.sent()]).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
it('008: can inject an image in a shape in the doc footer (regression test for #217)', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, thumbnail_data, report;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageInShapeInFooter.docx'))];
            case 1:
                template = _a.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                thumbnail_data = _a.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        data: {},
                        additionalJsContext: {
                            injectSvg: function () {
                                var svg_data = Buffer.from("<svg  xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n                                    <rect x=\"10\" y=\"10\" height=\"100\" width=\"100\" style=\"stroke:#ff0000; fill: #0000ff\"/>\n                                  </svg>", 'utf-8');
                                var thumbnail = {
                                    data: thumbnail_data,
                                    extension: '.png',
                                };
                                return {
                                    width: 6,
                                    height: 6,
                                    data: svg_data,
                                    extension: '.svg',
                                    thumbnail: thumbnail,
                                };
                            },
                        },
                    }, 'XML')];
            case 3:
                report = _a.sent();
                expect(report).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
it('009 correctly rotate image', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, buff, opts, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageRotation.docx'))];
            case 1:
                template = _b.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                buff = _b.sent();
                opts = {
                    template: template,
                    data: {},
                    additionalJsContext: {
                        getImage: function () { return ({
                            width: 6,
                            height: 6,
                            data: buff,
                            extension: '.png',
                        }); },
                        getImage45: function () { return ({
                            width: 6,
                            height: 6,
                            data: buff,
                            extension: '.png',
                            rotation: 45,
                        }); },
                        getImage180: function () { return ({
                            width: 6,
                            height: 6,
                            data: buff,
                            extension: '.png',
                            rotation: 180,
                        }); },
                    },
                };
                _a = expect;
                return [4 /*yield*/, (0, index_1.createReport)(opts, 'XML')];
            case 3:
                _a.apply(void 0, [_b.sent()]).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
it('010: can inject an image in a document that already contains images inserted during an earlier run by createReport (regression test for #259)', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, buff, reportA, _a, _b, _c, reportB, _d, _e, _f;
    var _g, _h, _j, _k;
    return __generator(this, function (_l) {
        switch (_l.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageMultiDelimiter.docx'))];
            case 1:
                template = _l.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                buff = _l.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        cmdDelimiter: '+++',
                        data: {
                            injectImg: function () { return ({
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.png',
                            }); },
                        },
                    })];
            case 3:
                reportA = _l.sent();
                _a = expect;
                _c = (_b = Object).keys;
                return [4 /*yield*/, jszip_1.default.loadAsync(reportA)];
            case 4:
                _a.apply(void 0, [_c.apply(_b, [(_h = (_g = (_l.sent())) === null || _g === void 0 ? void 0 : _g.files) !== null && _h !== void 0 ? _h : {}]).filter(function (f) {
                        return f.includes('word/media');
                    })]).toMatchInlineSnapshot("\n    [\n      \"word/media/\",\n      \"word/media/template_document.xml_img1.png\",\n    ]\n  ");
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: reportA,
                        cmdDelimiter: '---',
                        data: {
                            injectImg: function () { return ({
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.png',
                            }); },
                        },
                    })];
            case 5:
                reportB = _l.sent();
                _d = expect;
                _f = (_e = Object).keys;
                return [4 /*yield*/, jszip_1.default.loadAsync(reportB)];
            case 6:
                _d.apply(void 0, [_f.apply(_e, [(_k = (_j = (_l.sent())) === null || _j === void 0 ? void 0 : _j.files) !== null && _k !== void 0 ? _k : {}]).filter(function (f) {
                        return f.includes('word/media');
                    })]).toMatchInlineSnapshot("\n    [\n      \"word/media/\",\n      \"word/media/template_document.xml_img1.png\",\n      \"word/media/template_document.xml_img3.png\",\n    ]\n  ");
                return [2 /*return*/];
        }
    });
}); });
it('011 correctly inserts the optional image caption', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, buff, opts, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'imageCaption.docx'))];
            case 1:
                template = _b.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.png'))];
            case 2:
                buff = _b.sent();
                opts = {
                    template: template,
                    data: {},
                    additionalJsContext: {
                        injectImg: function (caption) {
                            return {
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.png',
                                caption: caption ? 'The image caption!' : undefined,
                            };
                        },
                    },
                };
                _a = expect;
                return [4 /*yield*/, (0, index_1.createReport)(opts, 'XML')];
            case 3:
                _a.apply(void 0, [_b.sent()]).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
it('can inject image in document that already contained image with same extension but uppercase', function () { return __awaiter(void 0, void 0, void 0, function () {
    var template, buff, report, jsZip, contentType;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'existingUppercaseJPEGExtension.docx'))];
            case 1:
                template = _b.sent();
                return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'sample.jpg'))];
            case 2:
                buff = _b.sent();
                return [4 /*yield*/, (0, index_1.createReport)({
                        template: template,
                        cmdDelimiter: '+++',
                        data: {
                            injectImg: function () { return ({
                                width: 6,
                                height: 6,
                                data: buff,
                                extension: '.jpg',
                            }); },
                        },
                    })];
            case 3:
                report = _b.sent();
                return [4 /*yield*/, jszip_1.default.loadAsync(report)];
            case 4:
                jsZip = _b.sent();
                return [4 /*yield*/, ((_a = jsZip.file('[Content_Types].xml')) === null || _a === void 0 ? void 0 : _a.async('string'))];
            case 5:
                contentType = _b.sent();
                expect(contentType).toBeDefined();
                expect(contentType).toMatchSnapshot();
                return [2 /*return*/];
        }
    });
}); });
describe('012: Sequential vs Concurrent image processing', function () {
    var IMAGE_COUNT = 20;
    var IMAGE_DELAY_MS = 100;
    var imageCache = new Map();
    function loadBaseImage(filename) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, imagePath, imageBuffer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cached = imageCache.get(filename);
                        if (cached)
                            return [2 /*return*/, cached];
                        imagePath = path_1.default.join(__dirname, 'fixtures', filename);
                        return [4 /*yield*/, fs_1.default.promises.readFile(imagePath)];
                    case 1:
                        imageBuffer = _a.sent();
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                new pngjs_1.PNG().parse(imageBuffer, function (err, png) {
                                    if (err)
                                        return reject(err);
                                    var imageData = {
                                        width: png.width,
                                        height: png.height,
                                        data: Buffer.from(png.data),
                                    };
                                    imageCache.set(filename, imageData);
                                    resolve(imageData);
                                });
                            })];
                }
            });
        });
    }
    function hslToRgb(h, s, l) {
        var c = (1 - Math.abs(2 * l - 1)) * s;
        var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        var m = l - c / 2;
        var r = 0, g = 0, b = 0;
        if (h < 60) {
            r = c;
            g = x;
        }
        else if (h < 120) {
            r = x;
            g = c;
        }
        else if (h < 180) {
            g = c;
            b = x;
        }
        else if (h < 240) {
            g = x;
            b = c;
        }
        else if (h < 300) {
            r = x;
            b = c;
        }
        else {
            r = c;
            b = x;
        }
        return [
            Math.round((r + m) * 255),
            Math.round((g + m) * 255),
            Math.round((b + m) * 255),
        ];
    }
    function createVariantImage(index_2, totalImages_1) {
        return __awaiter(this, arguments, void 0, function (index, totalImages, baseFilename) {
            var baseImageData, png, hue, saturation, lightness, _a, r, g, b, squareSize, startX, startY, y, x, idx;
            if (baseFilename === void 0) { baseFilename = 'cube.png'; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, loadBaseImage(baseFilename)];
                    case 1:
                        baseImageData = _b.sent();
                        png = new pngjs_1.PNG({
                            width: baseImageData.width,
                            height: baseImageData.height,
                        });
                        baseImageData.data.copy(png.data);
                        hue = (index * 360) / totalImages;
                        saturation = 0.7 + (index % 3) * 0.1;
                        lightness = 0.4 + (index % 5) * 0.05;
                        _a = hslToRgb(hue % 360, saturation, lightness), r = _a[0], g = _a[1], b = _a[2];
                        squareSize = Math.floor(Math.min(png.width, png.height) * 0.3);
                        startX = Math.floor((png.width - squareSize) / 2);
                        startY = Math.floor((png.height - squareSize) / 2);
                        for (y = startY; y < startY + squareSize; y++) {
                            for (x = startX; x < startX + squareSize; x++) {
                                idx = (png.width * y + x) << 2;
                                png.data[idx] = r;
                                png.data[idx + 1] = g;
                                png.data[idx + 2] = b;
                                png.data[idx + 3] = 255;
                            }
                        }
                        return [2 /*return*/, pngjs_1.PNG.sync.write(png)];
                }
            });
        });
    }
    it('produces identical output for sequential and concurrent processing', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template, baseFilename, images, data, createGetImageFn, sequentialReport, concurrentReport, sequentialZip, concurrentZip, sequentialDoc, concurrentDoc, sequentialMediaFiles, concurrentMediaFiles;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'stress_test_template.docx'))];
                case 1:
                    template = _c.sent();
                    baseFilename = 'cube.png';
                    return [4 /*yield*/, loadBaseImage(baseFilename)];
                case 2:
                    _c.sent();
                    images = Array.from({ length: IMAGE_COUNT }, function (_, i) { return i; });
                    data = { images: images };
                    createGetImageFn = function () { return function (index) { return __awaiter(void 0, void 0, void 0, function () {
                        var imageBuffer;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, IMAGE_DELAY_MS); })];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, createVariantImage(index, IMAGE_COUNT, baseFilename)];
                                case 2:
                                    imageBuffer = _a.sent();
                                    return [2 /*return*/, {
                                            width: 6,
                                            height: 6,
                                            data: imageBuffer,
                                            extension: '.png',
                                        }];
                            }
                        });
                    }); }; };
                    return [4 /*yield*/, (0, index_1.createReport)({
                            template: template,
                            data: data,
                            additionalJsContext: { getImage: createGetImageFn() },
                            cmdDelimiter: ['{{', '}}'],
                        })];
                case 3:
                    sequentialReport = _c.sent();
                    return [4 /*yield*/, (0, index_1.createReport)({
                            template: template,
                            data: data,
                            additionalJsContext: { getImage: createGetImageFn() },
                            cmdDelimiter: ['{{', '}}'],
                            imageConcurrency: 5,
                        })];
                case 4:
                    concurrentReport = _c.sent();
                    // Both should produce valid output
                    expect(sequentialReport).toBeInstanceOf(Uint8Array);
                    expect(concurrentReport).toBeInstanceOf(Uint8Array);
                    return [4 /*yield*/, jszip_1.default.loadAsync(sequentialReport)];
                case 5:
                    sequentialZip = _c.sent();
                    return [4 /*yield*/, jszip_1.default.loadAsync(concurrentReport)];
                case 6:
                    concurrentZip = _c.sent();
                    return [4 /*yield*/, ((_a = sequentialZip
                            .file('word/document.xml')) === null || _a === void 0 ? void 0 : _a.async('string'))];
                case 7:
                    sequentialDoc = _c.sent();
                    return [4 /*yield*/, ((_b = concurrentZip
                            .file('word/document.xml')) === null || _b === void 0 ? void 0 : _b.async('string'))];
                case 8:
                    concurrentDoc = _c.sent();
                    // The document XML should be identical
                    expect(sequentialDoc).toBeDefined();
                    expect(concurrentDoc).toBeDefined();
                    expect(sequentialDoc).toEqual(concurrentDoc);
                    // Snapshot the document.xml
                    expect(sequentialDoc).toMatchSnapshot('document.xml');
                    sequentialMediaFiles = Object.keys(sequentialZip.files).filter(function (f) {
                        return f.startsWith('word/media/');
                    });
                    concurrentMediaFiles = Object.keys(concurrentZip.files).filter(function (f) {
                        return f.startsWith('word/media/');
                    });
                    expect(sequentialMediaFiles.length).toBe(concurrentMediaFiles.length);
                    expect(sequentialMediaFiles.length).toBeGreaterThanOrEqual(IMAGE_COUNT);
                    // Snapshot the media files structure
                    expect(sequentialMediaFiles.sort()).toMatchSnapshot('media-files');
                    return [2 /*return*/];
            }
        });
    }); }, 120000);
    it('concurrent processing is faster than sequential', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template, baseFilename, images, data, createGetImageFn, sequentialStart, sequentialTime, concurrentStart, concurrentTime;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'stress_test_template.docx'))];
                case 1:
                    template = _a.sent();
                    baseFilename = 'cube.png';
                    return [4 /*yield*/, loadBaseImage(baseFilename)];
                case 2:
                    _a.sent();
                    images = Array.from({ length: IMAGE_COUNT }, function (_, i) { return i; });
                    data = { images: images };
                    createGetImageFn = function () { return function (index) { return __awaiter(void 0, void 0, void 0, function () {
                        var imageBuffer;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, IMAGE_DELAY_MS); })];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, createVariantImage(index, IMAGE_COUNT, baseFilename)];
                                case 2:
                                    imageBuffer = _a.sent();
                                    return [2 /*return*/, {
                                            width: 6,
                                            height: 6,
                                            data: imageBuffer,
                                            extension: '.png',
                                        }];
                            }
                        });
                    }); }; };
                    sequentialStart = Date.now();
                    return [4 /*yield*/, (0, index_1.createReport)({
                            template: template,
                            data: data,
                            additionalJsContext: { getImage: createGetImageFn() },
                            cmdDelimiter: ['{{', '}}'],
                        })];
                case 3:
                    _a.sent();
                    sequentialTime = Date.now() - sequentialStart;
                    concurrentStart = Date.now();
                    return [4 /*yield*/, (0, index_1.createReport)({
                            template: template,
                            data: data,
                            additionalJsContext: { getImage: createGetImageFn() },
                            cmdDelimiter: ['{{', '}}'],
                            imageConcurrency: 5,
                        })];
                case 4:
                    _a.sent();
                    concurrentTime = Date.now() - concurrentStart;
                    // Concurrent should be faster than sequential
                    expect(concurrentTime).toBeLessThan(sequentialTime);
                    return [2 /*return*/];
            }
        });
    }); }, 60000);
});
