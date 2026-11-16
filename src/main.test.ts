import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@actions/core", () => ({
    getInput: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    setFailed: vi.fn(),
    addPath: vi.fn()
}));

vi.mock("@actions/tool-cache", async importOriginal => ({
    ...await importOriginal<typeof import("@actions/tool-cache")>(),
    downloadTool: vi.fn()
}));

vi.mock("@actions/cache", () => ({
    restoreCache: vi.fn(),
    saveCache: vi.fn()
}));

let directory: string;

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
});

it("installs a public release without a token, as with nektos/act (#85)", async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "anonymous-release-"));
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("RUNNER_TOOL_CACHE", directory);
    vi.stubEnv("GITHUB_API_URL", "https://api.github.com");
    const inputs: Record<string, string> = {
        repo: "open-telemetry/opentelemetry-collector",
        tag: "v0.62.1",
        platform: "linux",
        arch: "amd64",
        "extension-matching": "disable",
        "rename-to": "ocb"
    };
    vi.mocked(core.getInput).mockImplementation(name => inputs[name] || "");
    const assetUrl = "https://api.github.com/repos/open-telemetry/opentelemetry-collector/releases/assets/123";
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        assets: [{ name: "ocb_linux_amd64", url: assetUrl }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const downloadedFile = path.join(directory, "download");
    fs.writeFileSync(downloadedFile, "public binary");
    vi.mocked(tc.downloadTool).mockResolvedValue(downloadedFile);

    // Exercise the action entry point and real Octokit authentication setup.
    await import("./main.js");
    await vi.waitFor(() => expect(core.addPath).toHaveBeenCalled());

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/open-telemetry/opentelemetry-collector/releases/tags/v0.62.1",
        expect.any(Object)
    );
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.has("authorization")).toBe(false);
    expect(tc.downloadTool).toHaveBeenCalledWith(assetUrl, undefined, undefined, {
        accept: "application/octet-stream"
    });
    const destination = vi.mocked(core.addPath).mock.calls[0][0];
    expect(fs.readFileSync(path.join(destination, "ocb"), "utf8")).toBe("public binary");
});

/** Prepare a tagged release with caching enabled and a local download fixture. */
function prepareCachedRelease(digest: string) {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "cached-release-"));
    vi.stubEnv("GITHUB_TOKEN", "");
    vi.stubEnv("RUNNER_TOOL_CACHE", directory);
    vi.stubEnv("GITHUB_API_URL", "https://api.github.com");
    const inputs: Record<string, string> = {
        repo: "org/tool", tag: "v1", cache: "enable", digest,
        platform: "linux", arch: "amd64",
        "extension-matching": "disable", "rename-to": "tool"
    };
    vi.mocked(core.getInput).mockImplementation(name => inputs[name] || "");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        assets: [{ name: "tool_linux_amd64", url: "https://api.github.com/repos/org/tool/releases/assets/123" }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const downloadedFile = path.join(directory, "download");
    fs.writeFileSync(downloadedFile, "verified binary");
    vi.mocked(tc.downloadTool).mockResolvedValue(downloadedFile);
    return { fetch, downloadedFile };
}

it("downloads and verifies a supplied digest despite an available cache entry", async () => {
    const digest = createHash("sha256").update("verified binary").digest("hex");
    prepareCachedRelease(digest);
    vi.mocked(cache.restoreCache).mockResolvedValue("existing-cache-key");

    await import("./main.js");
    await vi.waitFor(() => expect(core.addPath).toHaveBeenCalled());

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(tc.downloadTool).toHaveBeenCalledOnce();
    const destination = vi.mocked(core.addPath).mock.calls[0][0];
    expect(fs.readFileSync(path.join(destination, "tool"), "utf8")).toBe("verified binary");
});

it("fails on a digest mismatch despite an available cache entry", async () => {
    const { downloadedFile } = prepareCachedRelease("0".repeat(64));
    vi.mocked(cache.restoreCache).mockResolvedValue("existing-cache-key");

    await import("./main.js");
    await vi.waitFor(() => expect(core.setFailed).toHaveBeenCalled());

    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining("Digests mismatch"));
    expect(cache.restoreCache).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(core.addPath).not.toHaveBeenCalled();
    expect(fs.existsSync(downloadedFile)).toBe(true);
    expect(fs.existsSync(path.join(directory, "org", "tool", "v1", "linux-amd64", "tool"))).toBe(false);
});

it("still restores cached releases when no digest is supplied", async () => {
    const { fetch } = prepareCachedRelease("");
    vi.mocked(cache.restoreCache).mockResolvedValue("existing-cache-key");

    await import("./main.js");
    await vi.waitFor(() => expect(core.addPath).toHaveBeenCalled());

    expect(cache.restoreCache).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(tc.downloadTool).not.toHaveBeenCalled();
    expect(cache.saveCache).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
});

it("still saves downloaded releases when no digest is supplied", async () => {
    prepareCachedRelease("");
    vi.mocked(cache.restoreCache).mockResolvedValue(undefined);

    await import("./main.js");
    await vi.waitFor(() => expect(core.addPath).toHaveBeenCalled());

    expect(cache.restoreCache).toHaveBeenCalledOnce();
    expect(tc.downloadTool).toHaveBeenCalledOnce();
    expect(cache.saveCache).toHaveBeenCalledOnce();
    expect(core.setFailed).not.toHaveBeenCalled();
});
