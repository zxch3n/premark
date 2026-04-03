import { resolve } from "node:path";

import { defineConfig } from "vite-plus";

export default defineConfig({
  resolve: {
    alias: {
      "@pretext-md/parser": resolve("packages/parser/src/index.ts"),
      "@pretext-md/layout": resolve("packages/layout/src/index.ts"),
      "@pretext-md/highlight": resolve("packages/highlight/src/index.ts"),
      "@pretext-md/html-renderer": resolve("packages/html-renderer/src/index.ts"),
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    include: ["packages/*/tests/**/*.test.ts"],
  },
});
