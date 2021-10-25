"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const github = __importStar(require("@actions/github"));
const os = __importStar(require("os"));
const mkdirp = require("mkdirp-promise");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // set up auth/environment
            const token = process.env['GITHUB_TOKEN'];
            if (!token) {
                throw new Error(`No GitHub token found`);
            }
            const octokit = new github.GitHub(token);
            const repo = core.getInput("repo");
            if (!repo) {
                throw new Error(`Repo was not specified`);
                return;
            }
            const tag = core.getInput("tag");
            if (!tag) {
                throw new Error(`Tag not specified`);
            }
            const [owner, project] = repo.split("/");
            let osPlatform = "";
            switch (os.platform()) {
                case "linux":
                    osPlatform = "linux";
                    break;
                case "darwin":
                    osPlatform = "darwin";
                    break;
                case "win32":
                    osPlatform = "windows";
                    break;
                default:
                    core.setFailed("Unsupported operating system - $this action is only released for Darwin, Linux and Windows");
                    return;
            }
            // set up some arch regexs
            let osArch = "";
            switch (os.arch()) {
                case "x64":
                    osArch = "(x64|amd64)";
                    break;
                default:
                    osArch = os.arch();
                    return;
            }
            let getReleaseUrl;
            if (tag === "latest") {
                getReleaseUrl = yield octokit.repos.getLatestRelease({
                    owner: owner,
                    repo: project,
                });
            }
            else {
                getReleaseUrl = yield octokit.repos.getReleaseByTag({
                    owner: owner,
                    repo: project,
                    tag: tag,
                });
            }
            let re = new RegExp(`${osPlatform}.${osArch}.${osPlatform == "windows" ? "*zip" : "*tar.gz"}`);
            let asset = getReleaseUrl.data.assets.find(obj => {
                core.info(`searching for ${obj.name} with ${re.source}`);
                return re.test(obj.name);
            });
            if (!asset) {
                const found = getReleaseUrl.data.assets.map(f => f.name);
                throw new Error(`Could not find a release for ${tag}. Found: ${found}`);
            }
            const url = asset.browser_download_url;
            core.info(`Downloading ${project} from ${url}`);
            const binPath = yield tc.downloadTool(url);
            let extractedPath = yield tc.extractTar(binPath);
            core.info(`Successfully extracted ${project} to ${extractedPath}`);
            core.addPath(extractedPath);
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
