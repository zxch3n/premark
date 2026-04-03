import { renderMarkdownStory } from "./render-story.ts";

export default {
  title: "Blocks/Code Block",
};

export const Typescript = () =>
  renderMarkdownStory(
    `\`\`\`ts
type LayoutDelta = {
  version: number
  totalHeight: number
}

export function stringify(delta: LayoutDelta) {
  return JSON.stringify(delta, null, 2)
}
\`\`\``,
    560,
  );
