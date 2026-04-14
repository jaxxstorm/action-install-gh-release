import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            include: ["src/install.ts"],
            thresholds: {
                lines: 90,
                functions: 95,
                branches: 85,
                statements: 90
            }
        }
    }
});
