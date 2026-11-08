import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { expect, it } from "vitest";

it("preserves cache glob matching with the patched dependency tree", async () => {
    // Exercise cache's actual path resolver, not a possibly different hoisted glob.
    const cacheEntry = import.meta.resolve("@actions/cache");
    const { resolvePaths } = await import(new URL("./internal/cacheUtils.js", cacheEntry).href);
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cache-glob-"));
    try {
        await fs.mkdir(path.join(root, "nested"));
        await fs.writeFile(path.join(root, "nested", "tool"), "binary");
        await fs.writeFile(path.join(root, "nested", "tool.log"), "log");
        const matches: string[] = await resolvePaths([`${root}/**/*`, `!${root}/**/*.log`]);
        const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
        const relative = (name: string) => path.relative(workspace, path.join(root, "nested", name)).split(path.sep).join("/");
        expect(matches).toContain(relative("tool"));
        expect(matches).not.toContain(relative("tool.log"));
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
