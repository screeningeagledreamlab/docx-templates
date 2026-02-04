"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var qrcode_1 = __importDefault(require("qrcode"));
var index_1 = require("../index");
var debug_1 = require("../debug");
var errors_1 = require("../errors");
if (process.env.DEBUG)
    (0, debug_1.setDebugLogSink)(console.log);
var NoErrorThrownError = /** @class */ (function (_super) {
    __extends(NoErrorThrownError, _super);
    function NoErrorThrownError() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return NoErrorThrownError;
}(Error));
var getError = function (call) { return __awaiter(void 0, void 0, void 0, function () {
    var error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, call()];
            case 1:
                _a.sent();
                throw new NoErrorThrownError();
            case 2:
                error_1 = _a.sent();
                return [2 /*return*/, error_1];
            case 3: return [2 /*return*/];
        }
    });
}); };
['noSandbox', 'sandbox'].forEach(function (sbStatus) {
    var noSandbox = sbStatus === 'sandbox' ? false : true;
    describe("".concat(sbStatus), function () {
        describe('rejectNullish setting', function () {
            it('INS', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'rejectNullishINS.docx'))];
                        case 1:
                            template = _a.sent();
                            // When not explicitly set, rejectNullish should be considered 'false' so this case should resolve.
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {
                                        testobj: {}, // accessing a non-existing property will result in `undefined`
                                        test2: 'second value!',
                                    },
                                })).resolves.toBeInstanceOf(Uint8Array)];
                        case 2:
                            // When not explicitly set, rejectNullish should be considered 'false' so this case should resolve.
                            _a.sent();
                            // The same case should throw when we decide NOT to accept nullish values.
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {
                                        testobj: {}, // accessing a non-existing property will result in `undefined`
                                        test2: 'second value!',
                                    },
                                    rejectNullish: true,
                                })).rejects.toBeInstanceOf(Error)];
                        case 3:
                            // The same case should throw when we decide NOT to accept nullish values.
                            _a.sent();
                            // Should be ok when we actually set the value.
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {
                                        testobj: { value: 'the value is now set' },
                                        test2: 'second value!',
                                    },
                                    rejectNullish: true,
                                })).resolves.toBeInstanceOf(Uint8Array)];
                        case 4:
                            // Should be ok when we actually set the value.
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            it('IMAGE', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'rejectNullishIMAGE.docx'))];
                        case 1:
                            template = _a.sent();
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    additionalJsContext: {
                                        qr: function () { return undefined; },
                                    },
                                })).resolves.toBeInstanceOf(Uint8Array)];
                        case 2:
                            _a.sent();
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    rejectNullish: true,
                                    additionalJsContext: {
                                        qr: function () { return undefined; },
                                    },
                                })).rejects.toThrowErrorMatchingSnapshot()];
                        case 3:
                            _a.sent();
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    rejectNullish: true,
                                    additionalJsContext: {
                                        qr: function (contents) { return __awaiter(void 0, void 0, void 0, function () {
                                            var dataUrl, data;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, qrcode_1.default.toDataURL(contents, { width: 500 })];
                                                    case 1:
                                                        dataUrl = _a.sent();
                                                        data = dataUrl.slice('data:image/gif;base64,'.length);
                                                        return [2 /*return*/, { width: 6, height: 6, data: data, extension: '.gif' }];
                                                }
                                            });
                                        }); },
                                    },
                                })).resolves.toBeInstanceOf(Uint8Array)];
                        case 4:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
        describe('custom ErrorHandler', function () {
            it('allows graceful handling of NullishCommandResultError', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            expect.assertions(3);
                            return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'rejectNullishINS.docx'))];
                        case 1:
                            template = _a.sent();
                            return [4 /*yield*/, (0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {
                                        testobj: {}, // accessing a non-existing property will result in `undefined`
                                        test2: 'second value!',
                                    },
                                    rejectNullish: true,
                                    errorHandler: function (err, code) {
                                        expect(err).toBeInstanceOf(errors_1.NullishCommandResultError);
                                        expect(code).toStrictEqual('testobj.value');
                                        return "".concat(err);
                                    },
                                }, 'XML')];
                        case 2:
                            result = _a.sent();
                            expect(result).toMatchSnapshot();
                            return [2 /*return*/];
                    }
                });
            }); });
            it('handles arbitrary errors occurring in command execution', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'commandExecutionError.docx'))];
                        case 1:
                            template = _b.sent();
                            // First check whether the CommandExecutionError is triggered correctly
                            return [4 /*yield*/, expect((0, index_1.createReport)({ noSandbox: noSandbox, template: template, data: {} })).rejects.toThrow(errors_1.CommandExecutionError)];
                        case 2:
                            // First check whether the CommandExecutionError is triggered correctly
                            _b.sent();
                            // Now try with an errorHandler
                            _a = expect;
                            return [4 /*yield*/, (0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    errorHandler: function (err, code) { return 'no problem dude'; },
                                }, 'XML')];
                        case 3:
                            // Now try with an errorHandler
                            _a.apply(void 0, [_b.sent()]).toMatchSnapshot();
                            return [2 /*return*/];
                    }
                });
            }); });
            it('properly handles InvalidCommandError', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template, errs, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'invalidCommand.docx'))];
                        case 1:
                            template = _b.sent();
                            errs = [];
                            _a = expect;
                            return [4 /*yield*/, (0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    errorHandler: function (err, code) {
                                        errs.push(err);
                                        return "".concat(err);
                                    },
                                }, 'XML')];
                        case 2:
                            _a.apply(void 0, [_b.sent()]).toMatchSnapshot();
                            expect(errs).toMatchSnapshot();
                            return [2 /*return*/];
                    }
                });
            }); });
            it('handler can decide to re-throw the error, crashing the render', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'invalidCommand.docx'))];
                        case 1:
                            template = _a.sent();
                            return [4 /*yield*/, expect((0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    errorHandler: function (err, code) {
                                        throw new Error('yeah, no!');
                                    },
                                })).rejects.toThrow('yeah, no!')];
                        case 2:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            it('properly handles nested InvalidCommandError from invalid FOR', function () { return __awaiter(void 0, void 0, void 0, function () {
                var template, errs, cmds, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'invalidForCmd.docx'))];
                        case 1:
                            template = _b.sent();
                            errs = [];
                            cmds = [];
                            _a = expect;
                            return [4 /*yield*/, (0, index_1.createReport)({
                                    noSandbox: noSandbox,
                                    template: template,
                                    data: {},
                                    errorHandler: function (err, code) {
                                        errs.push(err);
                                        cmds.push(code);
                                        return "".concat(err, " (").concat(code, ")");
                                    },
                                }, 'XML')];
                        case 2:
                            _a.apply(void 0, [_b.sent()]).toMatchSnapshot();
                            expect(errs).toMatchSnapshot();
                            expect(cmds).toMatchSnapshot();
                            return [2 /*return*/];
                    }
                });
            }); });
        });
    });
    it('throw when user tries to iterate over non-array', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'forOverObject.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {
                                companies: {
                                    one: 'FIRST',
                                    two: 'SECOND',
                                    three: 'THIRD',
                                },
                            },
                        })).rejects.toThrowErrorMatchingSnapshot()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('throw when result of INS command is an object', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'objectCommandResultError.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {
                                companies: {
                                    one: 'FIRST',
                                    two: 'SECOND',
                                    three: 'THIRD',
                                },
                            },
                        })).rejects.toThrowErrorMatchingSnapshot()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('attaches the result to ObjectCommandResultError', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'objectCommandResultError.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {
                                companies: {
                                    one: 'FIRST',
                                    two: 'SECOND',
                                    three: 'THIRD',
                                },
                            },
                        })).rejects.toHaveProperty('result', {
                            one: 'FIRST',
                            two: 'SECOND',
                            three: 'THIRD',
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('Incomplete conditional statement: missing END-IF', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'missingEndIf.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {},
                            rejectNullish: true,
                            // We use failFast:false to ensure the error handling of a missing END-IF and missing END-FOR are not accidentally mixed, see Github issue #322.
                            failFast: false,
                        })).rejects.toMatchSnapshot()];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('Incomplete conditional statement: missing IF statement', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'unmatchedEndIf.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {},
                            rejectNullish: false, // needs to be false for the expected error to trigger instead of the NullishCommandResultError.
                        })).rejects.toThrow("Unexpected END-IF outside of IF statement context: END-IF")];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('Incomplete loop statement: unmatched END-FOR', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'unmatchedEndFor.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {},
                        })).rejects.toThrow("Unexpected END-FOR outside of FOR loop context: END-FOR")];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('Incomplete loop statement: missing END-FOR', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'missingEndFor.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {},
                        })).rejects.toThrow("Unterminated FOR-loop ('FOR c'). Make sure each FOR loop has a corresponding END-FOR command.")];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    it('Incomplete loop statement: invalid FOR', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'invalidForCmd.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, expect((0, index_1.createReport)({
                            noSandbox: noSandbox,
                            template: template,
                            data: {},
                        })).rejects.toThrow('Invalid FOR command: FOR person')];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
});
describe('errors from different realms', function () {
    it('sandbox', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template, error, commandExecutionError;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'referenceError.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, getError(function () {
                            return (0, index_1.createReport)({ noSandbox: false, template: template, data: {} });
                        })];
                case 2:
                    error = _a.sent();
                    expect(error).toBeInstanceOf(errors_1.CommandExecutionError);
                    commandExecutionError = error;
                    expect(commandExecutionError.err).not.toBeInstanceOf(ReferenceError);
                    expect(commandExecutionError.err).not.toBeInstanceOf(Error);
                    expect(commandExecutionError.err.name).toBe('ReferenceError');
                    expect(commandExecutionError.err.message).toBe('nonExistentVariable is not defined');
                    return [2 /*return*/];
            }
        });
    }); });
    it('noSandbox', function () { return __awaiter(void 0, void 0, void 0, function () {
        var template, error, commandExecutionError;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs_1.default.promises.readFile(path_1.default.join(__dirname, 'fixtures', 'referenceError.docx'))];
                case 1:
                    template = _a.sent();
                    return [4 /*yield*/, getError(function () {
                            return (0, index_1.createReport)({ noSandbox: true, template: template, data: {} });
                        })];
                case 2:
                    error = _a.sent();
                    expect(error).toBeInstanceOf(errors_1.CommandExecutionError);
                    commandExecutionError = error;
                    expect(commandExecutionError.err).toBeInstanceOf(ReferenceError);
                    expect(commandExecutionError.err).toBeInstanceOf(Error);
                    expect(commandExecutionError.err.name).toBe('ReferenceError');
                    expect(commandExecutionError.err.message).toBe('nonExistentVariable is not defined');
                    return [2 /*return*/];
            }
        });
    }); });
});
describe('isError', function () {
    it('Error is an error', function () {
        expect((0, errors_1.isError)(new Error())).toBeTruthy();
    });
    it('error-like object is an error', function () {
        expect((0, errors_1.isError)({
            name: 'ReferenceError',
            message: 'nonExistentVariable is not defined',
        })).toBeTruthy();
    });
    it('primitive is not an error', function () {
        expect((0, errors_1.isError)(1)).toBeFalsy();
    });
});
