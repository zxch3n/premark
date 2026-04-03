import type { StorybookConfig } from "@storybook/html-vite";

const config: StorybookConfig = {
  framework: "@storybook/html-vite",
  stories: ["../stories/**/*.stories.ts"],
  addons: [],
};

export default config;
