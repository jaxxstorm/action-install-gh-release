import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stringify, parse } from "yaml";

const cli = resolve("scripts/generate-docs.mjs");
const directories: string[] = [];
const inputMarker = '<!-- action-docs-inputs source="action.yml" -->';
const outputMarker = '<!-- action-docs-outputs source="action.yml" -->';
const template = `before\n${inputMarker}\nstale inputs\n${inputMarker}\nbetween\n${outputMarker}\nstale outputs\n${outputMarker}\nafter\n`;
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
function fixture(metadata: object, readme = template) {
    const cwd = mkdtempSync(join(tmpdir(), "action-docs-test-"));
    directories.push(cwd);
    writeFileSync(join(cwd, "action.yml"), stringify({ name: "Fixture", description: "Fixture action", runs: { using: "node24", main: "lib/index.js" }, ...metadata }));
    writeFileSync(join(cwd, "README.md"), readme);
    return cwd;
}
function generate(cwd: string) {
    return spawnSync(process.execPath, [cli, "--update-readme"], { cwd, encoding: "utf8", timeout: 10000 });
}

describe("README metadata generation", () => {
    it("renders outputs and multiline descriptions without changing table columns", () => {
        const cwd = fixture({ outputs: { result: { description: "first\nsecond | <value>" } } });
        expect(generate(cwd).status).toBe(0);
        const result = readFileSync(join(cwd, "README.md"), "utf8");
        expect(result).toContain("## Outputs");
        expect(result).toContain("| `result` | first<br>second &#124; &lt;value&gt; |");
        expect(result).not.toContain("## Inputs");
    });

    it("fails without writing when either marker pair is malformed", () => {
        for (const readme of [template.replace(outputMarker, ""), template + inputMarker]) {
            const cwd = fixture({ inputs: { value: { description: "value" } } }, readme);
            expect(generate(cwd).status).not.toBe(0);
            expect(readFileSync(join(cwd, "README.md"), "utf8")).toBe(readme);
        }
    });

    it("fails without writing when YAML is invalid", () => {
        const cwd = fixture({});
        writeFileSync(join(cwd, "action.yml"), "inputs: [");
        expect(generate(cwd).status).not.toBe(0);
        expect(readFileSync(join(cwd, "README.md"), "utf8")).toBe(template);
    });

    it("escapes raw HTML and pipes without interpreting metadata as HTML", () => {
        const cwd = fixture({ inputs: { value: { description: '<img src=x onerror=alert(1)> | text', default: '${{ github.token }}' } } });
        expect(generate(cwd).status).toBe(0);
        const result = readFileSync(join(cwd, "README.md"), "utf8");
        expect(result).not.toContain("<img");
        expect(result).toContain("&lt;img");
        expect(result).toContain("&#124;");
        expect(result).toContain("${{ github.token }}");
    });

    it("retains every real input, surrounding prose, and is idempotent", () => {
        const metadata = parse(readFileSync("action.yml", "utf8"));
        const cwd = fixture(metadata);
        expect(generate(cwd).status).toBe(0);
        const first = readFileSync(join(cwd, "README.md"), "utf8");
        for (const name of Object.keys(metadata.inputs)) expect(first).toContain(`\`${name}\``);
        expect(first).toMatch(/^before\n/);
        expect(first).toContain("\nbetween\n");
        expect(first).toMatch(/\nafter\n$/);
        expect(first).not.toContain("stale");
        expect(generate(cwd).status).toBe(0);
        expect(readFileSync(join(cwd, "README.md"), "utf8")).toBe(first);
    });
});
