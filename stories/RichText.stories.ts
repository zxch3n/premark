import { renderMarkdownStory } from "./render-story.ts";

export default {
  title: "Typography/Rich Text",
};

export const MixedInlineFormatting = () =>
  renderMarkdownStory(
    `A paragraph with **bold text**, *emphasis*, [a link](https://example.com), and \`inline code\` in one flow.`,
    460,
  );
