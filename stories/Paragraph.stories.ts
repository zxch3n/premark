import { renderMarkdownStory } from "./render-story.ts";

export default {
  title: "Typography/Paragraph",
};

export const MixedParagraphs = () =>
  renderMarkdownStory(
    `Long paragraphs wrap through Pretext measurement and stay stable across resize. 中文内容也会参与测量。 Emoji stay visible too: 🚀✨

Another paragraph follows with enough text to show multiple lines in a narrow container width.`,
    420,
  );
