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
const fs = __importStar(require("fs"));
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
            const token = process.env['GITHUB_TOKEN'] || core.getInput("token");
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
            let tag = core.getInput("tag");
            tag = !tag ? "latest" : tag;
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
            // Determine File Extensions (if any)
            const extMatching = core.getInput("extension-matching") === "enable";
            let extension = core.getInput("extension");
            let extMatchRegexForm = "";
            if (extMatching) {
                if (extension === "") {
                    extMatchRegexForm = "\.(tar.gz|zip)";
                    core.info(`==> Using default file extension matching: ${extMatchRegexForm}`);
                }
                else {
                    extMatchRegexForm = extension;
                    core.info(`==> Using custom file extension matching: ${extMatchRegexForm}`);
                }
            }
            else {
                core.info("==> File extension matching disabled");
            }
            // Determine whether renaming is in use
            let renameTo = core.getInput("rename-to");
            if (renameTo !== "") {
                core.info(`==> Will rename downloaded release to ${renameTo}`);
            }
            let chmodTo = core.getInput("chmod");
            if (chmodTo !== "") {
                core.info(`==> Will chmod downloaded release asset to ${chmodTo}`);
            }
            let toolInfo = {
                owner: owner,
                project: project,
                tag: tag,
                osArch: osArch,
                osPlatform: osPlatform
            };
            let dest = toolPath(toolInfo);
            // If the user has specified a custom location where the binaries are in the release
            // asset, we need to use modify the default path, joining the custom folder to the
            // default path.
            let binariesLocation = core.getInput("binaries-location");
            let finalBinLocation = dest;
            if (binariesLocation !== "") {
                core.info(`==> Given bin location: ${binariesLocation}`);
                finalBinLocation = path.join(dest, binariesLocation);
            }
            core.info(`==> Binaries will be located at: ${finalBinLocation}`);
            // Look in the cache first.
            let cacheKey = cachePrimaryKey(toolInfo);
            if (cacheEnabled && cacheKey !== undefined) {
                let ok = yield cache.restoreCache([dest], cacheKey);
                if (ok !== undefined) {
                    core.info(`Found ${project} in the cache: ${dest}`);
                    core.info(`Adding ${finalBinLocation} to the path`);
                    core.addPath(finalBinLocation);
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
            let re = new RegExp(`${osMatchRegexForm}.*${osMatchRegexForm}.*${extMatchRegexForm}`);
            let asset = getReleaseUrl.data.assets.find(obj => {
                core.info(`searching for ${obj.name} with ${re.source}`);
                let normalized_obj_name = obj.name.toLowerCase();
                return re.test(normalized_obj_name);
            });
            if (!asset) {
                const found = getReleaseUrl.data.assets.map(f => f.name);
                throw new Error(`Could not find a release for ${tag}. Found: ${found}`);
            }
            const url = asset.url;
            core.info(`Downloading ${project} from ${url}`);
            const binPath = yield tc.downloadTool(url, undefined, `token ${token}`, {
                accept: 'application/octet-stream'
            });
            const extractFn = getExtractFn(asset.name);
            if (extractFn !== undefined) {
                // Release is an archive file so extract it to the destination
                const extractFlags = getExtractFlags(asset.name);
                if (extractFlags !== undefined) {
                    core.info(`Attempting to extract archive with custom flags ${extractFlags}`);
                    yield extractFn(binPath, dest, extractFlags);
                }
                else {
                    yield extractFn(binPath, dest);
                }
                core.info(`Automatically extracted release asset ${asset.name} to ${dest}`);
                const bins = fs.readdirSync(finalBinLocation, { withFileTypes: true })
                    .filter(item => item.isFile())
                    .map(bin => bin.name);
                if (bins.length === 0)
                    throw new Error(`No files found in ${finalBinLocation}`);
                else if (bins.length > 1 && renameTo !== "") {
                    core.warning("rename-to parameter ignored when installing \
                a release from an archive that contains multiple files.");
                }
                if (chmodTo !== "") {
                    bins.forEach(bin => {
                        const binPath = path.join(finalBinLocation, bin);
                        try {
                            fs.chmodSync(binPath, chmodTo);
                            core.info(`chmod'd ${binPath} to ${chmodTo}`);
                        }
                        catch (chmodErr) {
                            core.setFailed(`Failed to chmod ${binPath} to ${chmodTo}: ${chmodErr}`);
                        }
                    });
                }
            }
            else {
                // As it wasn't an archive we've just downloaded it as a blob, this uses an auto-assigned name which will
                // be a UUID which is likely meaningless to the caller.  If they have specified a rename-to and a chmod
                // parameter then this is where we apply those.
                // Regardless of any rename-to parameter we still need to move the download to the actual destination
                // otherwise it won't end up on the path as expected
                core.info(`Release asset ${asset.name} did not have a recognised file extension, unable to automatically extract it`);
                try {
                    fs.mkdirSync(dest, { 'recursive': true });
                    const outputPath = path.join(dest, renameTo !== "" ? renameTo : path.basename(binPath));
                    core.info(`Created output directory ${dest}`);
                    try {
                        fs.renameSync(binPath, outputPath);
                        core.info(`Moved release asset ${asset.name} to ${outputPath}`);
                        if (chmodTo !== "") {
                            try {
                                fs.chmodSync(outputPath, chmodTo);
                                core.info(`chmod'd ${outputPath} to ${chmodTo}`);
                            }
                            catch (chmodErr) {
                                core.setFailed(`Failed to chmod ${outputPath} to ${chmodTo}: ${chmodErr}`);
                            }
                        }
                    }
                    catch (renameErr) {
                        core.setFailed(`Failed to move downloaded release asset ${asset.name} from ${binPath} to ${outputPath}: ${renameErr}`);
                    }
                }
                catch (err) {
                    core.setFailed(`Failed to create required output directory ${dest}`);
                }
            }
            if (cacheEnabled && cacheKey !== undefined) {
                try {
                    yield cache.saveCache([dest], cacheKey);
                }
                catch (error) {
                    const typedError = error;
                    if (typedError.name === cache.ValidationError.name) {
                        throw error;
                    }
                    else if (typedError.name === cache.ReserveCacheError.name) {
                        core.info(typedError.message);
                    }
                    else {
                        core.warning(typedError.message);
                    }
                }
            }
            core.info(`Adding ${finalBinLocation} to the path`);
            core.addPath(finalBinLocation);
            core.info(`Successfully installed ${project}`);
            core.info(`Binaries available at ${finalBinLocation}`);
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
    // Currently not caching "latest" versions of the tool.
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
    if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tar.bz2')) {
        return tc.extractTar;
    }
    else if (assetName.endsWith('.zip')) {
        return tc.extractZip;
    }
    else {
        return undefined;
    }
}
function getExtractFlags(assetName) {
    if (assetName.endsWith('tar.bz2')) {
        return "xj";
    }
    else {
        return undefined;
    }
}
run();
