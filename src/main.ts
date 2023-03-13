import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils";
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
        const token = process.env['GITHUB_TOKEN'] || core.getInput("token")
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

        let tag = core.getInput("tag");
        tag = !tag ? "latest" : tag

        const cacheEnabled = (core.getInput("cache") === "enable")
            && tag !== "latest"
            && tag !== "";

        const [owner, project] = repo.split("/")

        let osMatch: string[] = []

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

        // Determine File Extensions (if any)
        const extMatching = core.getInput("extension-matching") === "enable";
        let extension = core.getInput("extension");
        let extMatchRegexForm = "";
        if (extMatching) {
            if (extension === "") {
                extMatchRegexForm = "\.(tar.gz|zip)";
                core.info(`==> Using default file extension matching: ${extMatchRegexForm}`);
            } else {
                extMatchRegexForm = extension;
                core.info(`==> Using custom file extension matching: ${extMatchRegexForm}`);
            }
        } else {
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

        let toolInfo: ToolInfo = {
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
        let re = new RegExp(`${osMatchRegexForm}.*${osMatchRegexForm}.*${extMatchRegexForm}`)
        let asset = getReleaseUrl.data.assets.find(obj => {
            core.info(`searching for ${obj.name} with ${re.source}`)
            let normalized_obj_name = obj.name.toLowerCase()
            return re.test(normalized_obj_name)
        })

        if (!asset) {
            const found = getReleaseUrl.data.assets.map(f => f.name)
            throw new Error(
                `Could not find a release for ${tag}. Found: ${found}`
            )
        }

        const url = asset.url

        core.info(`Downloading ${project} from ${url}`)
        const binPath = await tc.downloadTool(url,
            undefined,
            `token ${token}`,
            {
                accept: 'application/octet-stream'
            }
        );

        const extractFn = getExtractFn(asset.name)
        if (extractFn !== undefined) {
            // Release is an archive file so extract it to the destination
            const extractFlags = getExtractFlags(asset.name)
            if (extractFlags !== undefined) {
                core.info(`Attempting to extract archive with custom flags ${extractFlags}`)
                await extractFn(binPath, dest, extractFlags);
            } else {
                await extractFn(binPath, dest);
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
                        core.info(`chmod'd ${binPath} to ${chmodTo}`)
                    } catch (chmodErr) {
                        core.setFailed(`Failed to chmod ${binPath} to ${chmodTo}: ${chmodErr}`);
                    }
                });
            }
        } else {
            // As it wasn't an archive we've just downloaded it as a blob, this uses an auto-assigned name which will
            // be a UUID which is likely meaningless to the caller.  If they have specified a rename-to and a chmod
            // parameter then this is where we apply those.
            // Regardless of any rename-to parameter we still need to move the download to the actual destination
            // otherwise it won't end up on the path as expected
            core.warning(
                `Release asset ${asset.name} did not have a recognised file extension, unable to automatically extract it`)
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
                            core.info(`chmod'd ${outputPath} to ${chmodTo}`)
                        } catch (chmodErr) {
                            core.setFailed(`Failed to chmod ${outputPath} to ${chmodTo}: ${chmodErr}`);
                        }
                    }
                } catch (renameErr) {
                    core.setFailed(`Failed to move downloaded release asset ${asset.name} from ${binPath} to ${outputPath}: ${renameErr}`);
                }
            } catch (err) {
                core.setFailed(`Failed to create required output directory ${dest}`);
            }
        }

        if (cacheEnabled && cacheKey !== undefined) {
            try {
                await cache.saveCache([dest], cacheKey);
            } catch (error) {
                const typedError = error as Error;
                if (typedError.name === cache.ValidationError.name) {
                    throw error;
                } else if (typedError.name === cache.ReserveCacheError.name) {
                    core.info(typedError.message);
                } else {
                    core.warning(typedError.message);
                }
            }
        }

        core.info(`Adding ${finalBinLocation} to the path`);
        core.addPath(finalBinLocation);
        core.info(`Successfully installed ${project}`);
        core.info(`Binaries available at ${finalBinLocation}`);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed("catastrophic failure, please file an issue")
        }
    }
}

function cachePrimaryKey(info: ToolInfo): string | undefined {
    // Currently not caching "latest" versions of the tool.
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
    if (assetName.endsWith('.tar.gz') || assetName.endsWith('.tar.bz2')) {
        return tc.extractTar;
    } else if (assetName.endsWith('.zip')) {
        return tc.extractZip;
    } else {
        return undefined;
    }
}

function getExtractFlags(assetName: any) {
    if (assetName.endsWith('tar.bz2')) {
        return "xj";
    } else {
        return undefined;
    }
}


run();
