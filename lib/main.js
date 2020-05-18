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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const os = __importStar(require("os"));
const mkdirp = require("mkdirp-promise");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const repo = core.getInput("repo");
            if (repo == undefined) {
                core.setFailed("Must specify github repo");
                return;
            }
            const binary = core.getInput("binary_name");
            if (binary == undefined) {
                core.setFailed("Must specify binary name");
                return;
            }
            const version = core.getInput("version");
            if (version == undefined) {
                core.setFailed("version not specified");
                return;
            }
            const destination = `/home/runner/.${binary}`;
            yield mkdirp(destination);
            let osPlatform = os.platform();
            if (osPlatform != "linux" && osPlatform != "darwin") {
                core.setFailed(`Unsupported operating system - ${binary} is only released for Darwin and Linux`);
                return;
            }
            const url = `https://github.com/${repo}/releases/download/v${version}/${binary}-v${version}-${osPlatform}-x64.tar.gz`;
            const binPath = yield tc.downloadTool(url);
            const extractedPath = yield tc.extractTar(binPath, destination);
            core.addPath(extractedPath);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
