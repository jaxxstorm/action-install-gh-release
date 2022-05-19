import * as os from "os";
import * as path from "path";

import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { GitHub, getOctokitOptions} from "@actions/github/lib/utils";
import { throttling } from "@octokit/plugin-throttling";

const ThrottlingOctokit = GitHub.plugin(throttling);

interface ToolInfo {
    owner: string;
    project: string;
    tag: string;
    osPlatform: string;
    osArch: string;
}

async function run() {
    try {

        // set up auth/environment
        const token = process.env['GITHUB_TOKEN']
        if (!token) {
            throw new Error(
                `No GitHub token found`
            )
        }
        const octokit = new ThrottlingOctokit({
            throttle: {
                onRateLimit: (retryAfter, options) => {
                    core.warning(
                      `RateLimit detected for request ${options.method} ${options.url}.`
                    );
                    core.info(`Retrying after ${retryAfter} seconds.`);
                    return true;
                },
                onSecondaryRateLimit: (retryAfter, options) => {
                    core.warning(
                        `SecondaryRateLimit detected for request ${options.method} ${options.url}.`
                    );
                    core.info(`Retrying after ${retryAfter} seconds.`);
                    return true;
                },
            },
            ...getOctokitOptions(token),
        })

        const repo = core.getInput("repo");
        if (!repo) {
            throw new Error(
                `Repo was not specified`
            )
        }

        const tag = core.getInput("tag");
        if (!tag) {
            throw new Error(
                `Tag not specified`
            )
        }

        const cacheEnabled = (core.getInput("cache") === "enable")
            && tag !== "latest"
            && tag !== "";

        const [owner, project] = repo.split("/")

        let osMatch : string[] = []

        // Determine Platform
        let osPlatform = core.getInput("platform");
        if (osPlatform === ""){
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
        osMatch.push(osPlatform)
        core.info(`==> System reported platform: ${os.platform()}`)
        core.info(`==> Using platform: ${osPlatform}`)

        // Determine Architecture
        let osArch = core.getInput("arch");
        if (osArch === "") {
            osArch = os.arch()
            switch (os.arch()) {
                case "x64":
                    osMatch.push("x86_64", "x64", "amd64")
                    break;
                default:
                    osMatch.push(os.arch())
                    return;
            }
        } else {
            osMatch.push(osArch)
        }
        core.info(`==> System reported arch: ${os.arch()}`)
        core.info(`==> Using arch: ${osArch}`)

        let toolInfo: ToolInfo = {
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
            let ok = await cache.restoreCache([dest], cacheKey);
            if (ok !== undefined) {
                core.info(`Found ${project} in the cache: ${dest}`)
                core.addPath(dest);
                return;
            }
        }

        let getReleaseUrl;
        if (tag === "latest") {
            getReleaseUrl = await octokit.rest.repos.getLatestRelease({
                owner: owner,
                repo: project,
            })
        } else {
            getReleaseUrl = await octokit.rest.repos.getReleaseByTag({
                owner: owner,
                repo: project,
                tag: tag,
            })
        }

        let osMatchRegexForm = `(${osMatch.join('|')})`
        let re = new RegExp(`${osMatchRegexForm}.*${osMatchRegexForm}.*\.(tar.gz|zip)`)
        let asset = getReleaseUrl.data.assets.find(obj => {
            core.info(`searching for ${obj.name} with ${re.source}`)
            let normalized_obj_name = obj.name.toLowerCase()
            return re.test(normalized_obj_name)
        })

        if (!asset ) {
            const found = getReleaseUrl.data.assets.map(f => f.name)
            throw new Error(
                `Could not find a release for ${tag}. Found: ${found}`
            )
        }

        const extractFn = getExtractFn(asset.name);

        const url = asset.browser_download_url

        core.info(`Downloading ${project} from ${url}`)
        const binPath = await tc.downloadTool(url);
        await extractFn(binPath, dest);

        if (cacheEnabled && cacheKey !== undefined) {
            await cache.saveCache([dest], cacheKey);
        }

        core.addPath(dest);
        core.info(`Successfully extracted ${project} to ${dest}`)
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed("catastrophic failure, please file an issue")
        }
    }
}

function cachePrimaryKey(info: ToolInfo): string|undefined {
    // Currently not caching "latest" verisons of the tool.
    if (info.tag === "latest") {
        return undefined;
    }
    return "action-install-gh-release/" +
        `${info.owner}/${info.project}/${info.tag}/${info.osPlatform}-${info.osArch}`;
}

function toolPath(info: ToolInfo): string {
    return path.join(getCacheDirectory(),
                     info.owner, info.project, info.tag,
                     `${info.osPlatform}-${info.osArch}`);
}

function getCacheDirectory() {
    const cacheDirectory = process.env['RUNNER_TOOL_CACHE'] || '';
    if (cacheDirectory === '') {
        core.warning('Expected RUNNER_TOOL_CACHE to be defined');
    }
    return cacheDirectory;
}

function getExtractFn(assetName: any) {
    if (assetName.endsWith('.tar.gz')) {
        return tc.extractTar;
    } else if (assetName.endsWith('.zip')) {
        return tc.extractZip;
    } else {
        throw new Error(`Unreachable error? File is neither .tar.gz nor .zip, got: ${assetName}`);
    }
}


run();
