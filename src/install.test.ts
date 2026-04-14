import * as tc from "@actions/tool-cache";
import { describe, expect, it, vi } from "vitest";
import {
    cachePrimaryKey,
    findMatchingAsset,
    getExtensionMatchRegexForm,
    getExtractFlags,
    getExtractFn,
    getOutputPath,
    getRelease,
    moveDownloadedFile,
    resolveArch,
    resolvePlatform,
    toolPath,
    verifyDigest,
    type Release,
    type ReleaseAsset
} from "./install.js";

const logger = {
    info: vi.fn(),
    debug: vi.fn()
};

function releaseWithAssets(...assets: string[]): Release {
    return {
        assets: assets.map(name => ({
            name,
            url: `https://example.test/${name}`
        }))
    };
}

describe("resolvePlatform", () => {
    it("maps supported runner platforms", () => {
        expect(resolvePlatform("", "linux")).toBe("linux");
        expect(resolvePlatform("", "darwin")).toBe("darwin");
        expect(resolvePlatform("", "win32")).toBe("windows");
    });

    it("escapes explicit platform input", () => {
        expect(resolvePlatform("linux.x86", "linux")).toBe("linux\\.x86");
    });

    it("throws for unsupported platforms", () => {
        expect(() => resolvePlatform("", "freebsd")).toThrow(/Unsupported operating system/);
    });
});

describe("resolveArch", () => {
    it("expands x64 aliases", () => {
        expect(resolveArch("", "x64")).toEqual({
            osArch: "x64",
            osArchMatch: ["x86_64", "x64", "amd64"]
        });
    });

    it("expands arm64 aliases", () => {
        expect(resolveArch("", "arm64")).toEqual({
            osArch: "arm64",
            osArchMatch: ["aarch64", "arm64"]
        });
    });

    it("uses explicit arch as-is after escaping", () => {
        expect(resolveArch("amd64+v3", "x64")).toEqual({
            osArch: "amd64\\+v3",
            osArchMatch: ["amd64\\+v3"]
        });
    });
});

describe("getExtensionMatchRegexForm", () => {
    it("uses default archive extensions when enabled", () => {
        expect(getExtensionMatchRegexForm(true, "")).toBe("\\.(tar.gz|tar.xz|zip|tgz)");
    });

    it("escapes custom extensions", () => {
        expect(getExtensionMatchRegexForm(true, ".bz2")).toBe("\\.bz2");
    });

    it("disables extension matching", () => {
        expect(getExtensionMatchRegexForm(false, ".zip")).toBe("");
    });
});

describe("findMatchingAsset", () => {
    it("matches a default archive by platform and arch aliases", () => {
        const asset = findMatchingAsset(
            releaseWithAssets("tool_darwin_amd64.tar.gz", "tool_linux_arm64.tar.gz"),
            {
                assetName: "",
                osPlatform: "darwin",
                osArchMatch: ["x86_64", "x64", "amd64"],
                extensionMatchRegexForm: "\\.(tar.gz|tar.xz|zip|tgz)"
            },
            logger
        );

        expect(asset?.name).toBe("tool_darwin_amd64.tar.gz");
    });

    it("filters assets by asset-name", () => {
        const asset = findMatchingAsset(
            releaseWithAssets("cli_linux_amd64.tar.gz", "helper_linux_amd64.tar.gz"),
            {
                assetName: "helper",
                osPlatform: "linux",
                osArchMatch: ["x86_64", "x64", "amd64"],
                extensionMatchRegexForm: "\\.(tar.gz|tar.xz|zip|tgz)"
            },
            logger
        );

        expect(asset?.name).toBe("helper_linux_amd64.tar.gz");
    });

    it("supports custom extensions", () => {
        const asset = findMatchingAsset(
            releaseWithAssets("tool_linux_amd64.bz2", "tool_linux_amd64.zip"),
            {
                assetName: "",
                osPlatform: "linux",
                osArchMatch: ["x86_64", "x64", "amd64"],
                extensionMatchRegexForm: "\\.bz2"
            },
            logger
        );

        expect(asset?.name).toBe("tool_linux_amd64.bz2");
    });

    it("supports binaries with extension matching disabled", () => {
        const asset = findMatchingAsset(
            releaseWithAssets("ocb_linux_amd64", "ocb_darwin_amd64"),
            {
                assetName: "ocb",
                osPlatform: "linux",
                osArchMatch: ["x86_64", "x64", "amd64"],
                extensionMatchRegexForm: ""
            },
            logger
        );

        expect(asset?.name).toBe("ocb_linux_amd64");
    });
});

describe("getRelease", () => {
    it("uses latest release for latest tags", async () => {
        const latest = { assets: [] };
        const repos = {
            getLatestRelease: vi.fn().mockResolvedValue({ data: latest }),
            getReleaseByTag: vi.fn(),
            listReleases: vi.fn()
        };

        await expect(getRelease(repos, "owner", "repo", "latest", false)).resolves.toBe(latest);
        expect(repos.getLatestRelease).toHaveBeenCalledWith({ owner: "owner", repo: "repo" });
    });

    it("uses tagged release lookup for specific tags", async () => {
        const tagged = { assets: [] };
        const repos = {
            getLatestRelease: vi.fn(),
            getReleaseByTag: vi.fn().mockResolvedValue({ data: tagged }),
            listReleases: vi.fn()
        };

        await expect(getRelease(repos, "owner", "repo", "v1.2.3", false)).resolves.toBe(tagged);
        expect(repos.getReleaseByTag).toHaveBeenCalledWith({ owner: "owner", repo: "repo", tag: "v1.2.3" });
    });

    it("pages through releases until it finds a prerelease", async () => {
        const firstPage = Array.from({ length: 30 }, (_, index) => ({ prerelease: false, assets: [{ name: `asset-${index}`, url: "" }] }));
        const prerelease = { prerelease: true, assets: [] };
        const repos = {
            getLatestRelease: vi.fn(),
            getReleaseByTag: vi.fn(),
            listReleases: vi
                .fn()
                .mockResolvedValueOnce({ data: firstPage })
                .mockResolvedValueOnce({ data: [prerelease] })
        };

        await expect(getRelease(repos, "owner", "repo", "latest", true)).resolves.toBe(prerelease);
        expect(repos.listReleases).toHaveBeenNthCalledWith(1, { owner: "owner", repo: "repo", per_page: 30, page: 1 });
        expect(repos.listReleases).toHaveBeenNthCalledWith(2, { owner: "owner", repo: "repo", per_page: 30, page: 2 });
    });

    it("returns undefined when no prerelease exists", async () => {
        const repos = {
            getLatestRelease: vi.fn(),
            getReleaseByTag: vi.fn(),
            listReleases: vi.fn().mockResolvedValue({ data: [{ prerelease: false, assets: [] }] })
        };

        await expect(getRelease(repos, "owner", "repo", "latest", true)).resolves.toBeUndefined();
    });
});

describe("cache and path helpers", () => {
    it("disables cache keys for latest", () => {
        expect(cachePrimaryKey({
            owner: "owner",
            assetName: "asset",
            repoName: "repo",
            tag: "latest",
            osPlatform: "linux",
            osArch: "amd64"
        })).toBeUndefined();
    });

    it("builds cache keys and tool paths for tagged releases", () => {
        const info = {
            owner: "owner",
            assetName: "asset",
            repoName: "repo",
            tag: "v1.2.3",
            osPlatform: "linux",
            osArch: "amd64"
        };

        expect(cachePrimaryKey(info)).toBe("action-install-gh-release/owner/asset/v1.2.3/linux-amd64");
        expect(toolPath(info, "/tool-cache")).toBe("/tool-cache/owner/asset/v1.2.3/linux-amd64");
    });
});

describe("archive helpers", () => {
    it("selects the right extract functions", () => {
        expect(getExtractFn("tool.tar.gz")).toBe(tc.extractTar);
        expect(getExtractFn("tool.tgz")).toBe(tc.extractTar);
        expect(getExtractFn("tool.zip")).toBe(tc.extractZip);
        expect(getExtractFn("tool")).toBeUndefined();
    });

    it("returns custom extract flags only when needed", () => {
        expect(getExtractFlags("tool.tar.xz")).toBe("xJ");
        expect(getExtractFlags("tool.tar.bz2")).toBe("xj");
        expect(getExtractFlags("tool.tar.gz")).toBeUndefined();
    });
});

describe("digest verification", () => {
    it("allows matching digests", () => {
        expect(() => verifyDigest("tool", "abc", "abc")).not.toThrow();
    });

    it("throws on digest mismatch", () => {
        expect(() => verifyDigest("tool", "abc", "def")).toThrow(/Digests mismatch/);
    });
});

describe("non-archive install helpers", () => {
    it("builds output paths with optional rename", () => {
        expect(getOutputPath("/dest", "/tmp/tool-linux-amd64", "")).toBe("/dest/tool-linux-amd64");
        expect(getOutputPath("/dest", "/tmp/tool-linux-amd64", "tool")).toBe("/dest/tool");
    });

    it("moves files directly when rename succeeds", () => {
        const fsModule = {
            renameSync: vi.fn(),
            copyFileSync: vi.fn(),
            rmSync: vi.fn()
        };

        expect(moveDownloadedFile(fsModule, "/tmp/bin", "/dest/bin")).toEqual({
            moveFailed: false,
            usedCopyFallback: false
        });
        expect(fsModule.renameSync).toHaveBeenCalledWith("/tmp/bin", "/dest/bin");
    });

    it("falls back to copy and remove on cross-device moves", () => {
        const exdevError = Object.assign(new Error("cross-device"), { code: "EXDEV" });
        const fsModule = {
            renameSync: vi.fn().mockImplementation(() => {
                throw exdevError;
            }),
            copyFileSync: vi.fn(),
            rmSync: vi.fn()
        };

        expect(moveDownloadedFile(fsModule, "/tmp/bin", "/dest/bin")).toEqual({
            moveFailed: false,
            usedCopyFallback: true
        });
        expect(fsModule.copyFileSync).toHaveBeenCalledWith("/tmp/bin", "/dest/bin");
        expect(fsModule.rmSync).toHaveBeenCalledWith("/tmp/bin");
    });

    it("returns a failure when the fallback copy/remove fails", () => {
        const exdevError = Object.assign(new Error("cross-device"), { code: "EXDEV" });
        const copyError = new Error("copy failed");
        const fsModule = {
            renameSync: vi.fn().mockImplementation(() => {
                throw exdevError;
            }),
            copyFileSync: vi.fn().mockImplementation(() => {
                throw copyError;
            }),
            rmSync: vi.fn()
        };

        expect(moveDownloadedFile(fsModule, "/tmp/bin", "/dest/bin")).toEqual({
            moveFailed: true,
            usedCopyFallback: true,
            error: copyError
        });
    });
});
