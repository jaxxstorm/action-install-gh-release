import * as os from "os";
import * as path from "path";
import * as fs from "fs";

import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { GitHub, getOctokitOptions } from "@actions/github/lib/utils";
import { throttling } from "@octokit/plugin-throttling";

const ThrottlingOctokit = GitHub.plugin(throttling);

const SUPPORTED_TAR_EXTENSIONS = [
  '.tar.gz',
  '.tar.xz',
  '.tar.bz2',
  '.tgz',
];

interface ToolInfo {
    owner: string;
    assetName: string;
    repoName: string;
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

        let prerelease = core.getInput("prerelease") === "true"

        const cacheEnabled = (core.getInput("cache") === "enable")
            && tag !== "latest"
            && tag !== "";

        const [owner, repoName] = repo.split("/")

        // Use configured project name if present
        let assetName = core.getInput("asset-name");

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

        const osArchMatch: string[] = [];

        // Determine Architecture
        let osArch = core.getInput("arch");
        if (osArch === "") {
            osArch = os.arch()
            switch (os.arch()) {
                case "x64":
                    osArchMatch.push("x86_64", "x64", "amd64")
                    break;
                case "arm64":
                    osArchMatch.push("aarch64", "arm64")
                    break;
                default:
                    osArchMatch.push(os.arch())
                    break;
            }
        } else {
            osArchMatch.push(osArch)
        }
        core.info(`==> System reported arch: ${os.arch()}`)
        core.info(`==> Using arch: ${osArch}`)

        // Determine File Extensions (if any)
        const extMatching = core.getInput("extension-matching") === "enable";
        let extension = core.getInput("extension");
        let extMatchRegexForm = "";
        if (extMatching) {
            if (extension === "") {
                extMatchRegexForm = "\.(tar.gz|tar.xz|zip|tgz)";
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
            owner,
            repoName,
            assetName,
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
                core.info(`Found ${assetName} in the cache: ${dest}`)
                core.info(`Adding ${finalBinLocation} to the path`);
                core.addPath(finalBinLocation);
                return;
            }
        }

        const getRelease = async () => {
            if (tag === "latest") {
                if (prerelease) {
                    let page = 1
                    const per_page = 30
                    while (true) {
                        const { data: releases } = await octokit.rest.repos.listReleases({
                            owner: owner,
                            repo: repoName,
                            per_page,
                            page
                        })
                        const release = releases.find(release => release.prerelease)
                        if (!!release) {
                            return release
                        }

                        if (releases.length < per_page) {
                            return undefined;
                        }

                        ++page
                    }
                } else {
                    const release = await octokit.rest.repos.getLatestRelease({
                        owner: owner,
                        repo: repoName,
                    })
                    return release.data
                }
            } else {
                const release = await octokit.rest.repos.getReleaseByTag({
                    owner: owner,
                    repo: repoName,
                    tag: tag,
                })
                return release.data
            }
        }

        let release = await getRelease()
        if (!release) {
            throw new Error(
                `Could not find release for tag ${tag}${prerelease ? ' with prerelease' : ''}.`
            )
        }

        // Build regular expressions for all the target triple components
        //
        // See: https://wiki.osdev.org/Target_Triplet
        let osArchMatchRegexForm = `(${osArchMatch.join('|')})`
        let osArchRegex = new RegExp(`${osArchMatchRegexForm}`);

        let vendorRegex = new RegExp("(apple|linux|pc|unknown)?") // vendor may not be specified

        let osMatchRegexForm = `(${osMatch.join('|')})`
        let osRegex = new RegExp(`${osMatchRegexForm}`);

        let libcRegex = new RegExp("(gnu|glibc|musl)?"); // libc calling convention may not be specified

        let extensionRegex = new RegExp(`${extMatchRegexForm}$`)

        // Attempt to find the asset, with matches for arch, vendor, os, libc and extension as appropriate
        let asset = release.assets.find(obj => {
            let normalized = obj.name.toLowerCase()
            core.info(`checking for arch/vendor/os/glibc triple matches for (normalized) asset [${normalized}]`)

            const nameIncluded = assetName ? normalized.includes(assetName) : true;
            if (!nameIncluded) { core.debug(`name [${assetName}] wasn't included in [${normalized}]`); }
            const osArchMatches = osArchRegex.test(normalized);
            if (!osArchMatches) { core.debug("osArch didn't match"); }
            const osMatches = osRegex.test(normalized);
            if (!osMatches) { core.debug("os didn't match"); }
            const vendorMatches = vendorRegex.test(normalized);
            if (!vendorMatches) { core.debug("vendor didn't match"); }
            const libcMatches = libcRegex.test(normalized);
            if (!libcMatches) { core.debug("libc calling didn't match"); }
            const extensionMatches = extensionRegex.test(normalized);
            if (!extensionMatches) { core.debug("extension didn't match"); }

            const matches = nameIncluded && osArchMatches && osMatches && vendorMatches && libcMatches && extensionMatches;
            if (matches) { core.info(`artifact matched: ${normalized}`); }

            return matches;
        })

        if (!asset) {
            const found = release.assets.map(f => f.name)
            throw new Error(
                `Could not find asset for ${tag}. Found: ${found}`
            )
        }

        const url = asset.url

        core.info(`Downloading ${asset.name} from ${url}`)
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

            // Attempt to find an extracted file that might be a binary matching the project
            const binFiles = fs.readdirSync(finalBinLocation, { recursive: true, withFileTypes: true })
              .filter(item => item.name.includes(assetName) && item.isFile());
            if (binFiles.length === 0)
                throw new Error(`No files found in ${finalBinLocation}`);
            else if (binFiles.length > 1 && renameTo !== "") {
                core.warning("rename-to parameter ignored when installing \
                a release from an archive that contains multiple files.");
            }

            // Ensure binaries that were found are in the dir that will be added to PATH
            for (const { parentPath, name } of binFiles) {
              const currentBinPath = path.resolve(path.join(parentPath, name));
              const finalBinPath = path.resolve(path.join(finalBinLocation, name));

              // If the binary is in a path *other* than the one that will be added to PATH
              // copy it over
              if (currentBinPath != finalBinPath) {
                try {
                core.debug(`detected binary not in folder on PATH, copying binary from [${currentBinPath}] to [${finalBinPath}]`);
                fs.copyFileSync(currentBinPath, finalBinPath);
                } catch (copyErr) {
                  core.setFailed(`Failed to copy binary to folder in PATH: ${copyErr}`);
                }
              }

              // Apply chmod if configured
              if (chmodTo !== "") {
                try {
                  fs.chmodSync(finalBinPath, chmodTo);
                  core.info(`chmod'd ${finalBinPath} to ${chmodTo}`)
                } catch (chmodErr) {
                  core.setFailed(`Failed to chmod ${finalBinPath} to ${chmodTo}: ${chmodErr}`);
                }
              }

              core.info(`installed binary [${finalBinPath}] (present in PATH)`);
            }
        } else {
            // As it wasn't an archive we've just downloaded it as a blob, this uses an auto-assigned name which will
            // be a UUID which is likely meaningless to the caller.  If they have specified a rename-to and a chmod
            // parameter then this is where we apply those.
            // Regardless of any rename-to parameter we still need to move the download to the actual destination
            // otherwise it won't end up on the path as expected
            core.info(
                `Release asset ${asset.name} did not have a recognised file extension, unable to automatically extract it`)
            try {
                fs.mkdirSync(dest, { 'recursive': true });

                const outputPath = path.join(dest, renameTo !== "" ? renameTo : path.basename(binPath));
                core.info(`Created output directory ${dest}`);

                var moveFailed = false;

                try {
                    fs.renameSync(binPath, outputPath);
                } catch (renameErr) {
                    if (renameErr instanceof Error && 'code' in renameErr && renameErr.code === 'EXDEV')  {
                        core.debug(`Falling back to copy and remove, due to: ${renameErr}`);
                        try {
                            fs.copyFileSync(binPath, outputPath);
                            fs.rmSync(binPath);
                        } catch (copyRemoveErr) {
                            moveFailed = true;
                            core.setFailed(`Failed to copy and remove downloaded release asset ${asset.name} from ${binPath} to ${outputPath}: ${copyRemoveErr}`);
                        }
                    } else {
                        moveFailed = true;
                        core.setFailed(`Failed to move downloaded release asset ${asset.name} from ${binPath} to ${outputPath}: ${renameErr}`);
                    }
                }

                if (!moveFailed) {
                    core.info(`Moved release asset ${asset.name} to ${outputPath}`);
                }

                if ((chmodTo !== "") && !moveFailed) {
                    try {
                        fs.chmodSync(outputPath, chmodTo);
                        core.info(`chmod'd ${outputPath} to ${chmodTo}`)
                    } catch (chmodErr) {
                        core.setFailed(`Failed to chmod ${outputPath} to ${chmodTo}: ${chmodErr}`);
                    }
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
        core.info(`Successfully installed ${assetName}`);
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
        `${info.owner}/${info.assetName}/${info.tag}/${info.osPlatform}-${info.osArch}`;
}

function toolPath(info: ToolInfo): string {
    let subDir = info.assetName ? info.assetName : info.repoName;
    return path.join(getCacheDirectory(),
        info.owner, subDir, info.tag,
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
  if (SUPPORTED_TAR_EXTENSIONS.some(ext => assetName.endsWith(ext))) {
        return tc.extractTar;
    } else if (assetName.endsWith('.zip')) {
        return tc.extractZip;
    } else {
        return undefined;
    }
}

function getExtractFlags(assetName: any) {
    if (assetName.endsWith('tar.xz')) {
        return "xJ";
    } else if (assetName.endsWith('tar.bz2')) {
        return "xj";
    } else {
        return undefined;
    }
}


run();
