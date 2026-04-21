import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/html-vite";

const workspaceAliases = {
  "@pretext-md/parser": fileURLToPath(new URL("../packages/parser/src/index.ts", import.meta.url)),
  "@pretext-md/layout": fileURLToPath(new URL("../packages/layout/src/index.ts", import.meta.url)),
  "@pretext-md/editor": fileURLToPath(new URL("../packages/editor/src/index.ts", import.meta.url)),
  "@pretext-md/highlight": fileURLToPath(
    new URL("../packages/highlight/src/index.ts", import.meta.url),
  ),
  "@pretext-md/html-renderer": fileURLToPath(
    new URL("../packages/html-renderer/src/index.ts", import.meta.url),
  ),
  "@pretext-md/wiki-canvas": fileURLToPath(
    new URL("../packages/wiki-canvas/src/index.ts", import.meta.url),
  ),
  "@pretext-md/workspace": fileURLToPath(
    new URL("../packages/workspace/src/index.ts", import.meta.url),
  ),
};

const config: StorybookConfig = {
  framework: "@storybook/html-vite",
  stories: ["../stories/**/*.stories.ts"],
  addons: [],
  viteFinal(viteConfig) {
    const existingAlias = viteConfig.resolve?.alias;
    const alias = Array.isArray(existingAlias)
      ? [
          ...existingAlias,
          ...Object.entries(workspaceAliases).map(([find, replacement]) => ({
            find,
            replacement,
          })),
        ]
      : {
          ...(existingAlias as Record<string, string> | undefined),
          ...workspaceAliases,
        };
    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        alias,
      },
    };
  },
};

export default config;
