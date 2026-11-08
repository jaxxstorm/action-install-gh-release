import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

// This repository only needs README input/output tables, not Markdown-to-HTML
// conversion. Keep metadata as text, preserving inline Markdown in descriptions.
function cell(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll("|", "&#124;")
        .replace(/\r\n|\r|\n/g, "<br>");
}
function code(value) {
    return `\`${cell(value).replaceAll("`", "&#96;")}\``;
}
function table(kind, entries) {
    if (!entries || Object.keys(entries).length === 0) return "";
    const inputs = kind === "inputs";
    const rows = Object.entries(entries).map(([name, entry]) => {
        const columns = [code(name), cell(entry.description ?? "")];
        if (inputs) columns.push(code(entry.required ?? false), code(entry.default ?? '""'));
        return `| ${columns.join(" | ")} |`;
    });
    return [`## ${inputs ? "Inputs" : "Outputs"}`, "",
        inputs ? "| name | description | required | default |" : "| name | description |",
        inputs ? "| --- | --- | --- | --- |" : "| --- | --- |", ...rows].join("\n");
}

const metadata = parse(readFileSync("action.yml", "utf8"));
let readme = readFileSync("README.md", "utf8");
for (const kind of ["inputs", "outputs"]) {
    const marker = `<!-- action-docs-${kind} source="action.yml" -->`;
    const parts = readme.split(marker);
    if (parts.length !== 3) throw new Error(`Expected exactly two ${kind} markers in README.md`);
    readme = `${parts[0]}${marker}\n${table(kind, metadata[kind])}\n${marker}${parts[2]}`;
}
// Validate both sections before writing, so malformed markers never truncate it.
writeFileSync("README.md", readme);
