import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as github from "@actions/github";
import * as os from "os";

const mkdirp = require("mkdirp-promise");

async function run() {
    try {

        // set up auth/environment
        const token = process.env['GITHUB_TOKEN']
        if (!token) {
            throw new Error(
                `No GitHub token found`
            )
        }
        const octokit: github.GitHub = new github.GitHub(token)

        const repo = core.getInput("repo");
        if (!repo) {
            throw new Error(
                `Repo was not specified`
            )
            return;
        }

        const tag = core.getInput("tag");
        if (!tag) {
            throw new Error(
                `Tag not specified`
            )
        }
        const [owner, project] = repo.split("/")

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
                osArch = "(x64|amd64)"
                break;
            default:
                osArch = os.arch()
                return;

        }

        let getReleaseUrl;
        if (tag === "latest") {
            getReleaseUrl = await octokit.repos.getLatestRelease({
                owner: owner,
                repo: project,
            })
        } else {
            getReleaseUrl = await octokit.repos.getReleaseByTag({
                owner: owner,
                repo: project,
                tag: tag,
            })
        }

        let re = new RegExp(`${osPlatform}.${osArch}.${osPlatform == "windows" ? "*zip" : "*tar.gz"}`)
        let asset = getReleaseUrl.data.assets.find(obj => {
            core.info(`searching for ${obj.name} with ${re.source}`)
            return re.test(obj.name)
        })

        if (!asset ) {
            const found = getReleaseUrl.data.assets.map(f => f.name)
            throw new Error(
                `Could not find a release for ${tag}. Found: ${found}`
            )
        }

        const url = asset.browser_download_url

        core.info(`Downloading ${project} from ${url}`)
        const binPath = await tc.downloadTool(url);
        let extractedPath = await tc.extractTar(binPath);
        core.info(`Successfully extracted ${project} to ${extractedPath}`)

        core.addPath(extractedPath);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
