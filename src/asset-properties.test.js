import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { findMatchingAsset, getExtensionMatchRegexForm, resolveArch, resolvePlatform, verifyDigest } from "./install.js";

// Fixed seeds make CI failures replayable. fast-check also prints the shrunk
// counterexample and path; retain discovered cases as explicit regressions.
const parameters = { seed: 20261108, numRuns: 1000 };
const logger = { info() {}, debug() {} };
function matches(name, extension = "") {
    return findMatchingAsset({ assets: [{ name, url: "https://example.invalid/asset" }] }, {
        assetName: "", osPlatform: "linux", osArchMatch: ["amd64"],
        extensionMatchRegexForm: getExtensionMatchRegexForm(true, extension)
    }, logger) !== undefined;
}

describe("release asset input properties", () => {
    it("rejects lookalike archive suffixes (regression: unescaped dot)", () => {
        expect(matches("tool-linux-amd64.tarXgz")).toBe(false);
    });

    it("matches default suffixes literally across generated asset names", () => {
        fc.assert(fc.property(fc.string({ maxLength: 80 }), fc.constantFrom("gz", "xz"),
            fc.constantFrom("x", "-", "_", "0", " "), (prefix, compression, separator) => {
                expect(matches(`${prefix}-linux-amd64.tar.${compression}`)).toBe(true);
                expect(matches(`${prefix}-linux-amd64.tar${separator}${compression}`)).toBe(false);
            }), parameters);
    });

    it("requires the actual end of the filename, not before a trailing newline", () => {
        expect(matches("tool-linux-amd64.zip\n")).toBe(false);
        fc.assert(fc.property(fc.constantFrom("\n", "\r", "\r\n", "\u2028", "\u2029"), ending => {
            expect(matches(`tool-linux-amd64.zip${ending}`)).toBe(false);
        }), parameters);
    });

    it("treats custom extension metacharacters as literal suffix text", () => {
        fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 40 }), extension => {
            const literal = extension.toLowerCase();
            expect(matches(`tool-linux-amd64${literal}`, literal)).toBe(true);
            const differentLastCharacter = literal.endsWith("#") ? "!" : "#";
            expect(matches(`tool-linux-amd64${literal}${differentLastCharacter}`, literal)).toBe(false);
        }), parameters);
    });

    it("escapes platform and architecture input instead of executing regex syntax", () => {
        fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 80 }), input => {
            const platform = resolvePlatform(input, "linux");
            const { osArchMatch } = resolveArch(input, "x64");
            expect(new RegExp(`^(?:${platform})$(?![\\s\\S])`).test(input)).toBe(true);
            expect(new RegExp(`^(?:${osArchMatch[0]})$(?![\\s\\S])`).test(input + "extra")).toBe(false);
        }), parameters);
    });

    it("never accepts a different computed digest", () => {
        fc.assert(fc.property(fc.string({ maxLength: 128 }), digest => {
            expect(() => verifyDigest("asset", digest, digest)).not.toThrow();
            expect(() => verifyDigest("asset", digest, digest + "0")).toThrow(/Digests mismatch/);
        }), parameters);
    });
});
