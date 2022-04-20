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
const utils_1 = require("@actions/github/lib/utils");
const os = __importStar(require("os"));
const plugin_throttling_1 = require("@octokit/plugin-throttling");
const ThrottlingOctokit = utils_1.GitHub.plugin(plugin_throttling_1.throttling);
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // set up auth/environment
            const token = process.env['GITHUB_TOKEN'];
            if (!token) {
                throw new Error(`No GitHub token found`);
            }
            const octokit = new ThrottlingOctokit(Object.assign({ throttle: {
                    onRateLimit: (retryAfter, options) => {
                        core.warning(`RateLimit detected for request ${options.method} ${options.url}.`);
                        core.info(`Retrying after ${retryAfter} seconds.`);
                        return true;
                    },
                    onSecondaryRateLimit: (retryAfter, options) => {
                        core.warning(`SecondaryRateLimit detected for request ${options.method} ${options.url}.`);
                        core.info(`Retrying after ${retryAfter} seconds.`);
                        return true;
                    },
                } }, utils_1.getOctokitOptions(token)));
            const repo = core.getInput("repo");
            if (!repo) {
                throw new Error(`Repo was not specified`);
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
                getReleaseUrl = yield octokit.rest.repos.getLatestRelease({
                    owner: owner,
                    repo: project,
                });
            }
            else {
                getReleaseUrl = yield octokit.rest.repos.getReleaseByTag({
                    owner: owner,
                    repo: project,
                    tag: tag,
                });
            }
            let re = new RegExp(`${osPlatform}.${osArch}.*\.(tar.gz|zip)`);
            let asset = getReleaseUrl.data.assets.find(obj => {
                core.info(`searching for ${obj.name} with ${re.source}`);
                return re.test(obj.name);
            });
            if (!asset) {
                const found = getReleaseUrl.data.assets.map(f => f.name);
                throw new Error(`Could not find a release for ${tag}. Found: ${found}`);
            }
            const extractFn = getExtractFn(asset.name);
            const url = asset.browser_download_url;
            core.info(`Downloading ${project} from ${url}`);
            const binPath = yield tc.downloadTool(url);
            const extractedPath = yield extractFn(binPath);
            core.info(`Successfully extracted ${project} to ${extractedPath}`);
            core.addPath(extractedPath);
        }
        catch (error) {
            let errorMessage = "Failed to download and extract release";
            if (error instanceof Error) {
                core.setFailed(error.message);
            }
            else {
                core.setFailed("catastrophic failure, please file an issue");
            }
        }
    });
}
function getExtractFn(assetName) {
    if (assetName.endsWith('.tar.gz')) {
        return tc.extractTar;
    }
    else if (assetName.endsWith('.zip')) {
        return tc.extractZip;
    }
    else {
        throw new Error(`Unreachable error? File is neither .tar.gz nor .zip, got: ${assetName}`);
    }
}
run();
