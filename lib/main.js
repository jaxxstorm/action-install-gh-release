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
            const destination = `/home/runner/.${project}`;
            yield mkdirp(destination);
            let osPlatform = os.platform();
            if (osPlatform != "linux" && osPlatform != "darwin") {
                core.setFailed(`Unsupported operating system - $this action is only released for Darwin and Linux`);
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
            let re = new RegExp(`${osPlatform}.*tar.gz`);
            let asset = getReleaseUrl.data.assets.find(obj => {
                return re.test(obj.name);
            });
            if (!asset) {
                const found = getReleaseUrl.data.assets.map(f => f.name);
                throw new Error(`Could not find a release for ${tag}. Found: ${found}`);
            }
            const url = asset.browser_download_url;
            console.log(`Downloading ${project} from ${url}`);
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
