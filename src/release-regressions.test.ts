import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as tc from "@actions/tool-cache";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadReleaseAsset, installExtractedFiles, resolveToken } from "./install.js";

vi.mock("fs", async importOriginal => {
    const original = await importOriginal<typeof import("fs")>();
    return { ...original, copyFileSync: vi.fn(original.copyFileSync) };
});

vi.mock("@actions/tool-cache", async importOriginal => ({
    ...await importOriginal<typeof import("@actions/tool-cache")>(),
    downloadTool: vi.fn()
}));

const directories: string[] = [];

afterEach(() => {
    vi.resetAllMocks();
    for (const directory of directories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function fixtureDirectory(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-regression-"));
    directories.push(directory);
    return directory;
}

describe("nested release archives (#63)", () => {
    it("installs cargo-make binaries from a versioned wrapper directory", () => {
        const destination = fixtureDirectory();
        const wrapper = path.join(destination, "cargo-make-v0.36.12-x86_64-unknown-linux-gnu");
        fs.mkdirSync(wrapper);
        fs.writeFileSync(path.join(wrapper, "cargo-make"), "cargo-make binary");
        fs.writeFileSync(path.join(wrapper, "makers"), "makers binary");

        expect(installExtractedFiles(destination).sort()).toEqual([
            path.join(destination, "cargo-make"),
            path.join(destination, "makers")
        ]);
        expect(fs.readFileSync(path.join(destination, "cargo-make"), "utf8")).toBe("cargo-make binary");
        expect(fs.readFileSync(path.join(destination, "makers"), "utf8")).toBe("makers binary");
    });

    it("finds binaries whose names differ from the selected archive", () => {
        const destination = fixtureDirectory();
        fs.mkdirSync(path.join(destination, "release", "bin"), { recursive: true });
        fs.writeFileSync(path.join(destination, "release", "bin", "tool"), "binary");
        expect(installExtractedFiles(destination)).toEqual([path.join(destination, "tool")]);
    });

    it("supports an explicit binaries-location and files already at its root", () => {
        const destination = fixtureDirectory();
        const bin = path.join(destination, "bin");
        fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, "tool"), "binary");
        fs.writeFileSync(path.join(destination, "README"), "documentation");
        expect(installExtractedFiles(bin)).toEqual([path.join(bin, "tool")]);
        expect(fs.existsSync(path.join(bin, "README"))).toBe(false);
    });

    it("fails for an empty archive instead of reporting success", () => {
        const destination = fixtureDirectory();
        fs.mkdirSync(path.join(destination, "empty-wrapper"));
        expect(() => installExtractedFiles(destination)).toThrow("No files found");
    });

    it("propagates a copy failure without attempting subsequent copies", () => {
        const destination = fixtureDirectory();
        const wrapper = path.join(destination, "release");
        fs.mkdirSync(wrapper);
        fs.writeFileSync(path.join(wrapper, "first"), "first binary");
        fs.writeFileSync(path.join(wrapper, "second"), "second binary");
        const error = new Error("Failed to copy binary");
        vi.mocked(fs.copyFileSync).mockImplementationOnce(() => {
            throw error;
        });

        expect(() => installExtractedFiles(destination)).toThrow(error);
        expect(fs.copyFileSync).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(path.join(destination, "first"))).toBe(false);
        expect(fs.existsSync(path.join(destination, "second"))).toBe(false);
    });
});

describe("private release downloads (#56)", () => {
    const asset = { name: "tool_linux_amd64.tar.gz", url: "https://api.github.com/repos/org/private/releases/assets/123" };

    it("uses an explicit private-repository token instead of the runner token", async () => {
        vi.mocked(tc.downloadTool).mockResolvedValue("downloaded-archive");
        const token = resolveToken("private-repo-token", "runner-token");
        await expect(downloadReleaseAsset(asset, token)).resolves.toBe("downloaded-archive");
        expect(tc.downloadTool).toHaveBeenCalledWith(asset.url, undefined, "token private-repo-token", {
            accept: "application/octet-stream"
        });
    });

    it("falls back to the environment token when no input token is supplied", () => {
        expect(resolveToken("", "environment-token")).toBe("environment-token");
    });

    it("omits authorization for anonymous public downloads", async () => {
        vi.mocked(tc.downloadTool).mockResolvedValue("downloaded-archive");
        await downloadReleaseAsset(asset, resolveToken("", undefined));
        expect(tc.downloadTool).toHaveBeenCalledWith(asset.url, undefined, undefined, {
            accept: "application/octet-stream"
        });
    });

    it("rejects a 404 with actionable private-repository guidance", async () => {
        vi.mocked(tc.downloadTool).mockRejectedValue(new tc.HTTPError(404));
        await expect(downloadReleaseAsset(asset, "token")).rejects.toThrow(
            "Not Found (404). For private repositories, supply a token with access to the release repository via the token input."
        );
    });

    it("preserves other download failures", async () => {
        const error = new tc.HTTPError(403);
        vi.mocked(tc.downloadTool).mockRejectedValue(error);
        await expect(downloadReleaseAsset(asset, "token")).rejects.toBe(error);
    });
});
