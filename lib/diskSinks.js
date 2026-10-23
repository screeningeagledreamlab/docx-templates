"use strict";
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
exports.zipSaveToFile = exports.zipSetStream = exports.storeImage = exports.writeXml = exports.cleanupRunDir = exports.removeFile = exports.xmlSpoolPath = exports.assertOutputDirExists = exports.makeRunDir = exports.lazyFileStream = void 0;
var fs_1 = require("fs");
var stream_1 = require("stream");
var promises_1 = require("stream/promises");
var promises_2 = require("fs/promises");
var crypto_1 = require("crypto");
var os_1 = __importDefault(require("os"));
var path_1 = __importDefault(require("path"));
var events_1 = require("events");
var xml_1 = require("./xml");
var errors_1 = require("./errors");
var debug_1 = require("./debug");
/**
 * A Readable that opens its file descriptor on first read, not on construction.
 *
 * Why this exists: JSZip's NodejsStreamInputAdapter binds the stream in its
 * constructor (at `zip.file()` time) and only calls `stream.pause()`. But a
 * paused fs.createReadStream has ALREADY opened its fd. Handing JSZip one
 * stream per image therefore opens every fd up front -- 8000 images against a
 * typical `ulimit -n` of 1024 is a hard EMFILE before a single byte is written.
 *
 * JSZip pulls entries strictly sequentially, so deferring the open to the first
 * _read() keeps the live fd count at ~1.
 *
 * This is safe because _bindStream calls pause() BEFORE attaching its 'data'
 * listener, and Node's on('data') only auto-resumes when readableFlowing is not
 * already false. So the stream is never read until JSZip resumes it.
 */
function lazyFileStream(filePath) {
    var inner = null;
    var stopped = false;
    var out = new stream_1.Readable({
        read: function () {
            if (stopped)
                return;
            if (inner == null) {
                var src_1 = (0, fs_1.createReadStream)(filePath);
                inner = src_1;
                src_1.on('data', function (chunk) {
                    if (!out.push(chunk))
                        src_1.pause();
                });
                src_1.on('end', function () { return out.push(null); });
                src_1.on('error', function (err) { return out.destroy(err); });
            }
            else {
                inner.resume();
            }
        },
        destroy: function (err, cb) {
            stopped = true;
            if (inner != null)
                inner.destroy();
            cb(err);
        },
    });
    return out;
}
exports.lazyFileStream = lazyFileStream;
var DEFAULT_WORK_ROOT = 'docx-templates';
/** Bytes buffered before a write is issued. Keeps syscall count sane. */
var WRITE_CHUNK_BYTES = 64 * 1024;
/**
 * Create `<root>/<runId>/{media,xml}/` and return the run dir.
 *
 * The per-run directory is the unit of cleanup, which is what makes concurrent
 * createReport calls safe against a shared root.
 */
function makeRunDir(workDir) {
    return __awaiter(this, void 0, void 0, function () {
        var root, runDir, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    root = workDir !== null && workDir !== void 0 ? workDir : path_1.default.join(os_1.default.tmpdir(), DEFAULT_WORK_ROOT);
                    runDir = path_1.default.join(root, (0, crypto_1.randomBytes)(8).toString('hex'));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fs_1.promises.mkdir(path_1.default.join(runDir, 'media'), { recursive: true })];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, fs_1.promises.mkdir(path_1.default.join(runDir, 'xml'), { recursive: true })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    throw new errors_1.ReportOutputError("Could not create work directory at ".concat(runDir), e_1);
                case 5: return [2 /*return*/, runDir];
            }
        });
    });
}
exports.makeRunDir = makeRunDir;
/**
 * Throw if the parent directory of `outputPath` does not exist.
 *
 * Deliberately synchronous: this is the one fail-fast check, run before any
 * template work happens, so a typo in the output path costs nothing.
 *
 * Lives here rather than in main.ts for the same reason zipSetStream does:
 * main.ts is on the browser import chain (browser.ts -> index.ts -> main.ts),
 * so a static `fs`/`path` import there would drag Node builtins into the
 * browser bundle. main.ts reaches this only through the dynamic import.
 */
function assertOutputDirExists(outputPath) {
    var dir = path_1.default.dirname(outputPath);
    if (!(0, fs_1.existsSync)(dir)) {
        throw new errors_1.ReportOutputError("The output directory ".concat(dir, " does not exist. Create it before calling createReport."));
    }
}
exports.assertOutputDirExists = assertOutputDirExists;
/** Where a spooled XML part lives inside the run dir. */
function xmlSpoolPath(runDir, name) {
    return path_1.default.join(runDir, 'xml', name);
}
exports.xmlSpoolPath = xmlSpoolPath;
/**
 * Remove a file, swallowing any failure.
 *
 * Used by zipSaveToFile to drop a partial output file after a failed write: a
 * truncated .docx is worse than no file at all. It runs on an error path, so
 * it must never mask the error that got us there.
 */
function removeFile(file) {
    return __awaiter(this, void 0, void 0, function () {
        var e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, fs_1.promises.rm(file, { force: true })];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    e_2 = _a.sent();
                    debug_1.logger.debug("Could not remove ".concat(file, ": ").concat(String(e_2)));
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
exports.removeFile = removeFile;
/**
 * Remove a run dir. Never throws: this runs in a `finally` and must not mask
 * the error that got us there. The caller-supplied root is never removed.
 */
function cleanupRunDir(runDir) {
    return __awaiter(this, void 0, void 0, function () {
        var e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (runDir == null)
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fs_1.promises.rm(runDir, { recursive: true, force: true })];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    e_3 = _a.sent();
                    debug_1.logger.debug("Could not clean up work directory ".concat(runDir, ": ").concat(String(e_3)));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
exports.cleanupRunDir = cleanupRunDir;
/**
 * Serialise a node tree straight to disk.
 *
 * Shares emitXml with buildXml, so output is byte-identical by construction.
 * Batches into ~64KB chunks and honours backpressure.
 *
 * emitXml is a Generator, and this project targets es5 without
 * downlevelIteration, so `for...of` over it does not type-check. A manual
 * iterator loop is used instead of `Array.from` so chunks are streamed to disk
 * rather than materialised in memory -- the whole point of this function.
 */
function writeXml(node, options, dest) {
    return __awaiter(this, void 0, void 0, function () {
        var ws, buffered, it_1, r, e_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ws = (0, fs_1.createWriteStream)(dest);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, , 11]);
                    buffered = '';
                    it_1 = (0, xml_1.emitXml)(node, options);
                    r = it_1.next();
                    _a.label = 2;
                case 2:
                    if (!!r.done) return [3 /*break*/, 6];
                    buffered += r.value;
                    if (!(buffered.length >= WRITE_CHUNK_BYTES)) return [3 /*break*/, 5];
                    if (!!ws.write(buffered, 'utf-8')) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, events_1.once)(ws, 'drain')];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    buffered = '';
                    _a.label = 5;
                case 5:
                    r = it_1.next();
                    return [3 /*break*/, 2];
                case 6:
                    if (!(buffered.length > 0)) return [3 /*break*/, 8];
                    if (!!ws.write(buffered, 'utf-8')) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, events_1.once)(ws, 'drain')];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8:
                    ws.end();
                    // Wait for 'close', not 'finish'. 'finish' only means the data has been
                    // flushed to the OS -- the underlying fs.close() (autoClose defaults to
                    // true) happens after that, so `ws.closed` can still be false when
                    // 'finish' fires. Callers (e.g. cleanupRunDir) rely on the fd actually
                    // being closed by the time this promise resolves: on Windows a file with
                    // an open fd cannot be deleted, so racing ahead on 'finish' could make
                    // cleanup silently fail to remove the run directory. 'close' fires after
                    // 'finish' and is emitted asynchronously, so attaching the listener here
                    // (after ws.end()) cannot miss it; events.once still rejects if the
                    // stream emits 'error' while we wait.
                    return [4 /*yield*/, (0, events_1.once)(ws, 'close')];
                case 9:
                    // Wait for 'close', not 'finish'. 'finish' only means the data has been
                    // flushed to the OS -- the underlying fs.close() (autoClose defaults to
                    // true) happens after that, so `ws.closed` can still be false when
                    // 'finish' fires. Callers (e.g. cleanupRunDir) rely on the fd actually
                    // being closed by the time this promise resolves: on Windows a file with
                    // an open fd cannot be deleted, so racing ahead on 'finish' could make
                    // cleanup silently fail to remove the run directory. 'close' fires after
                    // 'finish' and is emitted asynchronously, so attaching the listener here
                    // (after ws.end()) cannot miss it; events.once still rejects if the
                    // stream emits 'error' while we wait.
                    _a.sent();
                    return [3 /*break*/, 11];
                case 10:
                    e_4 = _a.sent();
                    ws.destroy();
                    throw new errors_1.ReportOutputError("Could not write XML to ".concat(dest), e_4);
                case 11: return [2 /*return*/];
            }
        });
    });
}
exports.writeXml = writeXml;
/**
 * Spool one image's bytes to the run dir, returning a file reference instead of
 * the bytes. Returns the image untouched when disk-backed mode is off.
 *
 * Base64 input is decoded here, which also sheds its 1.33x size overhead.
 */
function storeImage(runDir, id, img) {
    return __awaiter(this, void 0, void 0, function () {
        var bytes, file, e_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (runDir == null)
                        return [2 /*return*/, img];
                    bytes = typeof img.data === 'string'
                        ? Buffer.from(img.data, 'base64')
                        : Buffer.from(img.data);
                    file = path_1.default.join(runDir, 'media', "".concat(id).concat(img.extension));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fs_1.promises.writeFile(file, bytes)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    e_5 = _a.sent();
                    throw new errors_1.ReportOutputError("Could not spool image ".concat(id, " to ").concat(file), e_5);
                case 4: return [2 /*return*/, { extension: img.extension, file: file }];
            }
        });
    });
}
exports.storeImage = storeImage;
/**
 * Add a zip entry whose content is read lazily from disk at generate time.
 *
 * Lives here rather than in zip.ts because zip.ts is on the browser import
 * chain: a static import of this module from there drags fs/path/crypto/os
 * into the browser bundle.
 *
 * `binary: true` is required — the spooled file already holds encoded bytes,
 * so JSZip must treat it as pre-encoded rather than re-encoding it.
 */
var zipSetStream = function (zip, filename, filePath) {
    zip.file(filename, lazyFileStream(filePath), { binary: true });
};
exports.zipSetStream = zipSetStream;
/**
 * Stream the zip straight to disk, so the whole archive never exists in memory.
 *
 * `streamFiles: false` is deliberate. JSZip pipes the compress worker into
 * ZipFileWorker, so its per-entry accumulation holds POST-compression bytes --
 * one deflated entry at a time, which is small. Setting it to true would emit
 * ZIP data descriptors (GP bit 3), which some OOXML consumers handle poorly.
 */
var zipSaveToFile = function (zip, outputPath, compressionLevel) { return __awaiter(void 0, void 0, void 0, function () {
    var ws, e_6, e_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                ws = (0, fs_1.createWriteStream)(outputPath);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                // 'open' is emitted asynchronously, so attaching here cannot miss it;
                // events.once rejects instead if the stream errors.
                return [4 /*yield*/, (0, events_1.once)(ws, 'open')];
            case 2:
                // 'open' is emitted asynchronously, so attaching here cannot miss it;
                // events.once rejects instead if the stream errors.
                _a.sent();
                return [3 /*break*/, 4];
            case 3:
                e_6 = _a.sent();
                ws.destroy();
                throw new errors_1.ReportOutputError("Could not open ".concat(outputPath, " for writing"), e_6);
            case 4:
                _a.trys.push([4, 7, , 9]);
                return [4 /*yield*/, (0, promises_1.pipeline)(zip.generateNodeStream({
                        type: 'nodebuffer',
                        compression: 'DEFLATE',
                        compressionOptions: { level: compressionLevel },
                        streamFiles: false,
                    }), ws)];
            case 5:
                _a.sent();
                return [4 /*yield*/, (0, promises_2.stat)(outputPath)];
            case 6: 
            // Inside the try on purpose: a stat failure here (the file vanished, the
            // mount went away) is just as much a write failure as a pipeline error,
            // and must surface as a ReportOutputError like every other failure path
            // in this module rather than as a bare ENOENT.
            return [2 /*return*/, (_a.sent()).size];
            case 7:
                e_7 = _a.sent();
                return [4 /*yield*/, removeFile(outputPath)];
            case 8:
                _a.sent();
                throw new errors_1.ReportOutputError("Could not write the report to ".concat(outputPath), e_7);
            case 9: return [2 /*return*/];
        }
    });
}); };
exports.zipSaveToFile = zipSaveToFile;
