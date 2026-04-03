import { defineConfig } from "vite-plus";

export default defineConfig({
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
