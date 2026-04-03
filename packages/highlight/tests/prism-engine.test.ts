import { describe, expect, it } from "vite-plus/test";

import { createHighlighter } from "../src/index.ts";

describe("createHighlighter", () => {
  it("highlights code to HTML", () => {
    const highlighter = createHighlighter();
    const html = highlighter.highlight("const x = 1", "typescript");
    expect(html).toContain("token");
  });

  it("tokenizes code line by line", () => {
    const highlighter = createHighlighter();
    const tokens = highlighter.tokenize("const x = 1\nconsole.log(x)", "typescript");
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.some((token: { tokenType: string }) => token.tokenType === "keyword")).toBe(
      true,
    );
  });
});
