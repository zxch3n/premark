import { renderMarkdownStory } from "./render-story.ts";

export default {
  title: "Blocks/Table",
};

export const BasicTable = () =>
  renderMarkdownStory(
    `| Column | Purpose | Notes |
| --- | --- | --- |
| Parser | Streaming block AST | Emits closed blocks only |
| Layout | Headless measurement | Works without DOM |
| Renderer | HTML + CSS | Zero runtime JS in output |`,
    640,
  );
