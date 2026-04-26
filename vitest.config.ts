import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: process.env.SMOKE === "1"
      ? ["**/node_modules/**", "**/dist/**"]
      : [
          "tests/smoke.live.test.ts",
          "tests/smoke.edgar.live.test.ts",
          "tests/smoke.finra.live.test.ts",
          "**/node_modules/**",
          "**/dist/**",
        ],
  },
});
