import * as path from "path";
import * as fs from "fs";
import lo from "lodash";
import * as tc from "@actions/tool-cache";

const { escapeRegExp } = lo;

export const SUPPORTED_TAR_EXTENSIONS = [".tar.gz", ".tar.xz", ".tar.bz2", ".tgz"];

export function resolveToken(inputToken: string, environmentToken: string | undefined): string {
    return inputToken || environmentToken || "";
}

export async function downloadReleaseAsset(asset: ReleaseAsset, token: string): Promise<string> {
    try {
        return await tc.downloadTool(asset.url, undefined, token ? `token ${token}` : undefined, {
            accept: "application/octet-stream"
        });
    } catch (error) {
        if (error instanceof tc.HTTPError && error.httpStatusCode === 404) {
            throw new Error(`Could not download release asset ${asset.name}: Not Found (404). For private repositories, supply a token with access to the release repository via the token input.`);
        }
        throw error;
    }
}

export function installExtractedFiles(binaryDirectory: string): string[] {
    // asset-name selects the archive, not the filenames inside it.
    const files = fs.readdirSync(binaryDirectory, { recursive: true, withFileTypes: true })
        .filter(item => item.isFile());
    if (files.length === 0) {
        throw new Error(`No files found in ${binaryDirectory}`);
    }
    return files.map(({ parentPath, name }) => {
        const source = path.resolve(parentPath, name);
        const destination = path.resolve(binaryDirectory, name);
        if (source !== destination) {
            fs.copyFileSync(source, destination);
        }
        return destination;
    });
}

export interface ToolInfo {
    owner: string;
    assetName: string;
    repoName: string;
    tag: string;
    osPlatform: string;
    osArch: string;
    platformMatching?: boolean;
    archMatching?: boolean;
}

export interface ReleaseAsset {
    name: string;
    url: string;
}

export interface Release {
    prerelease?: boolean;
    assets: ReleaseAsset[];
}

export interface Logger {
    info(message: string): void;
    debug(message: string): void;
}

interface OctokitReposClient {
    getLatestRelease(params: { owner: string; repo: string }): Promise<{ data: Release }>;
    getReleaseByTag(params: { owner: string; repo: string; tag: string }): Promise<{ data: Release }>;
    listReleases(params: { owner: string; repo: string; per_page: number; page: number }): Promise<{ data: Release[] }>;
}

export function resolvePlatform(inputPlatform: string, systemPlatform: NodeJS.Platform): string {
    const escapedPlatform = escapeRegExp(inputPlatform);
    if (escapedPlatform !== "") {
        return escapedPlatform;
    }

    switch (systemPlatform) {
        case "linux":
            return "linux";
        case "darwin":
            return "darwin";
        case "win32":
            return "windows";
        default:
            throw new Error("Unsupported operating system - this action is only released for Darwin, Linux and Windows");
    }
}

export function resolveArch(inputArch: string, systemArch: string): { osArch: string; osArchMatch: string[] } {
    const escapedArch = escapeRegExp(inputArch);
    if (escapedArch !== "") {
        return {
            osArch: escapedArch,
            osArchMatch: [escapedArch]
        };
    }

    switch (systemArch) {
        case "x64":
            return {
                osArch: systemArch,
                osArchMatch: ["x86_64", "x64", "amd64"]
            };
        case "arm64":
            return {
                osArch: systemArch,
                osArchMatch: ["aarch64", "arm64"]
            };
        default:
            return {
                osArch: systemArch,
                osArchMatch: [systemArch]
            };
    }
}

export function getExtensionMatchRegexForm(extMatching: boolean, extension: string): string {
    if (!extMatching) {
        return "";
    }

    if (extension === "") {
        return "\\.(tar.gz|tar.xz|zip|tgz)";
    }

    return escapeRegExp(extension);
}

export async function getRelease(
    repos: OctokitReposClient,
    owner: string,
    repoName: string,
    tag: string,
    prerelease: boolean
): Promise<Release | undefined> {
    if (tag === "latest") {
        if (!prerelease) {
            const release = await repos.getLatestRelease({ owner, repo: repoName });
            return release.data;
        }

        let page = 1;
        const per_page = 30;
        while (true) {
            const { data: releases } = await repos.listReleases({ owner, repo: repoName, per_page, page });
            const release = releases.find(candidate => candidate.prerelease);
            if (release) {
                return release;
            }
            if (releases.length < per_page) {
                return undefined;
            }
            ++page;
        }
    }

    const release = await repos.getReleaseByTag({ owner, repo: repoName, tag });
    return release.data;
}

export function findMatchingAsset(
    release: Release,
    options: {
        assetName: string;
        osPlatform: string;
        osArchMatch: string[];
        extensionMatchRegexForm: string;
        platformMatching?: boolean;
        archMatching?: boolean;
    },
    logger: Logger
): ReleaseAsset | undefined {
    const osArchRegex = new RegExp(`(${options.osArchMatch.join("|")})`);
    const vendorRegex = new RegExp("(apple|linux|pc|unknown)?");
    const osRegex = new RegExp(`(${options.osPlatform})`);
    const libcRegex = new RegExp("(gnu|glibc|musl)?");
    const extensionRegex = new RegExp(`${options.extensionMatchRegexForm}$`);

    return release.assets.find(obj => {
        const normalized = obj.name.toLowerCase();
        logger.info(`checking for arch/vendor/os/glibc triple matches for (normalized) asset [${normalized}]`);
        const nameIncluded = options.assetName ? normalized.includes(options.assetName) : true;
        if (!nameIncluded) {
            logger.debug(`name [${options.assetName}] wasn't included in [${normalized}]`);
        }
        const osArchMatches = options.archMatching === false || osArchRegex.test(normalized);
        if (!osArchMatches) {
            logger.debug("osArch didn't match");
        }
        const osMatches = options.platformMatching === false || osRegex.test(normalized);
        if (!osMatches) {
            logger.debug("os didn't match");
        }
        const vendorMatches = vendorRegex.test(normalized);
        if (!vendorMatches) {
            logger.debug("vendor didn't match");
        }
        const libcMatches = libcRegex.test(normalized);
        if (!libcMatches) {
            logger.debug("libc calling didn't match");
        }
        const extensionMatches = extensionRegex.test(normalized);
        if (!extensionMatches) {
            logger.debug("extension didn't match");
        }
        const matches = nameIncluded && osArchMatches && osMatches && vendorMatches && libcMatches && extensionMatches;
        if (matches) {
            logger.info(`artifact matched: ${normalized}`);
        }
        return matches;
    });
}

export function verifyDigest(assetName: string, expectedDigest: string, computedDigest: string): void {
    if (expectedDigest !== computedDigest) {
        throw new Error(`Digests mismatch for the release asset ${assetName}. Expected "${expectedDigest}". Got "${computedDigest}".`);
    }
}

export function cachePrimaryKey(info: ToolInfo): string | undefined {
    if (info.tag === "latest") {
        return undefined;
    }
    // Cache restores prefix-match keys, so every mode needs a distinct namespace.
    const matchingMode = `platform-${info.platformMatching !== false}-arch-${info.archMatching !== false}`;
    return `action-install-gh-release/v2/${matchingMode}/${info.owner}/${info.assetName}/${info.tag}/${info.osPlatform}-${info.osArch}`;
}

export function toolPath(info: ToolInfo, cacheDirectory: string): string {
    const subDir = info.assetName ? info.assetName : info.repoName;
    return path.join(cacheDirectory, info.owner, subDir, info.tag, `${info.osPlatform}-${info.osArch}`);
}

export function getExtractFn(assetName: string) {
    if (SUPPORTED_TAR_EXTENSIONS.some(ext => assetName.endsWith(ext))) {
        return tc.extractTar;
    }
    if (assetName.endsWith(".zip")) {
        return tc.extractZip;
    }
    return undefined;
}

export function getExtractFlags(assetName: string) {
    if (assetName.endsWith("tar.xz")) {
        return "xJ";
    }
    if (assetName.endsWith("tar.bz2")) {
        return "xj";
    }
    return undefined;
}

export function getOutputPath(dest: string, binPath: string, renameTo: string): string {
    return path.join(dest, renameTo !== "" ? renameTo : path.basename(binPath));
}

export function moveDownloadedFile(
    fsModule: Pick<typeof import("fs"), "renameSync" | "copyFileSync" | "rmSync">,
    binPath: string,
    outputPath: string
): { moveFailed: boolean; usedCopyFallback: boolean; error?: unknown } {
    try {
        fsModule.renameSync(binPath, outputPath);
        return { moveFailed: false, usedCopyFallback: false };
    } catch (renameErr) {
        if (renameErr instanceof Error && "code" in renameErr && renameErr.code === "EXDEV") {
            try {
                fsModule.copyFileSync(binPath, outputPath);
                fsModule.rmSync(binPath);
                return { moveFailed: false, usedCopyFallback: true };
            } catch (copyRemoveErr) {
                return { moveFailed: true, usedCopyFallback: true, error: copyRemoveErr };
            }
        }

        return { moveFailed: true, usedCopyFallback: false, error: renameErr };
    }
}
