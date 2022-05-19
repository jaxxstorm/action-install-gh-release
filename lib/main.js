"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
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
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const cache = __importStar(require("@actions/cache"));
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const utils_1 = require("@actions/github/lib/utils");
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
                } }, (0, utils_1.getOctokitOptions)(token)));
            const repo = core.getInput("repo");
            if (!repo) {
                throw new Error(`Repo was not specified`);
            }
            const tag = core.getInput("tag");
            if (!tag) {
                throw new Error(`Tag not specified`);
            }
            const cacheEnabled = (core.getInput("cache") === "enable")
                && tag !== "latest"
                && tag !== "";
            const [owner, project] = repo.split("/");
            let osMatch = [];
            // Determine Platform
            let osPlatform = core.getInput("platform");
            if (osPlatform === "") {
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
            }
            osMatch.push(osPlatform);
            core.info(`==> System reported platform: ${os.platform()}`);
            core.info(`==> Using platform: ${osPlatform}`);
            // Determine Architecture
            let osArch = core.getInput("arch");
            if (osArch === "") {
                osArch = os.arch();
                switch (os.arch()) {
                    case "x64":
                        osMatch.push("x86_64", "x64", "amd64");
                        break;
                    default:
                        osMatch.push(os.arch());
                        return;
                }
            }
            else {
                osMatch.push(osArch);
            }
            core.info(`==> System reported arch: ${os.arch()}`);
            core.info(`==> Using arch: ${osArch}`);
            let toolInfo = {
                owner: owner,
                project: project,
                tag: tag,
                osArch: osArch,
                osPlatform: osPlatform
            };
            let dest = toolPath(toolInfo);
            // Look in the cache first.
            let cacheKey = cachePrimaryKey(toolInfo);
            if (cacheEnabled && cacheKey !== undefined) {
                let ok = yield cache.restoreCache([dest], cacheKey);
                if (ok !== undefined) {
                    core.info(`Found ${project} in the cache: ${dest}`);
                    core.addPath(dest);
                    return;
                }
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
            let osMatchRegexForm = `(${osMatch.join('|')})`;
            let re = new RegExp(`${osMatchRegexForm}.*${osMatchRegexForm}.*\.(tar.gz|zip)`);
            let asset = getReleaseUrl.data.assets.find(obj => {
                core.info(`searching for ${obj.name} with ${re.source}`);
                let normalized_obj_name = obj.name.toLowerCase();
                return re.test(normalized_obj_name);
            });
            if (!asset) {
                const found = getReleaseUrl.data.assets.map(f => f.name);
                throw new Error(`Could not find a release for ${tag}. Found: ${found}`);
            }
            const extractFn = getExtractFn(asset.name);
            const url = asset.browser_download_url;
            core.info(`Downloading ${project} from ${url}`);
            const binPath = yield tc.downloadTool(url);
            yield extractFn(binPath, dest);
            if (cacheEnabled && cacheKey !== undefined) {
                yield cache.saveCache([dest], cacheKey);
            }
            core.addPath(dest);
            core.info(`Successfully extracted ${project} to ${dest}`);
        }
        catch (error) {
            if (error instanceof Error) {
                core.setFailed(error.message);
            }
            else {
                core.setFailed("catastrophic failure, please file an issue");
            }
        }
    });
}
function cachePrimaryKey(info) {
    // Currently not caching "latest" verisons of the tool.
    if (info.tag === "latest") {
        return undefined;
    }
    return "action-install-gh-release/" +
        `${info.owner}/${info.project}/${info.tag}/${info.osPlatform}-${info.osArch}`;
}
function toolPath(info) {
    return path.join(getCacheDirectory(), info.owner, info.project, info.tag, `${info.osPlatform}-${info.osArch}`);
}
function getCacheDirectory() {
    const cacheDirectory = process.env['RUNNER_TOOL_CACHE'] || '';
    if (cacheDirectory === '') {
        core.warning('Expected RUNNER_TOOL_CACHE to be defined');
    }
    return cacheDirectory;
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
