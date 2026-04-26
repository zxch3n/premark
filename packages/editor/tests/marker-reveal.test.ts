import { createLayoutEngine } from "@pretext-md/layout";
import { createIncrementalParseState, createMarkdownInlineSourceMap } from "@pretext-md/parser";
import { describe, expect, it } from "vite-plus/test";

import { createActiveMarkerRevealMarkdown } from "../src/index.ts";

function reveal(markdown: string, from: number, to = from) {
  const state = createIncrementalParseState(markdown);
  return createActiveMarkerRevealMarkdown({
    markdown,
    inlineSources: createMarkdownInlineSourceMap(state),
    blockSpans: state.blockSpans,
    selectionRange: { from, to },
  });
}

describe("Markdown control reveal", () => {
  it("shows heading control markers when the caret is inside the heading block", () => {
    const markdown = "# Head **bold** text\n\nPlain paragraph";

    const revealed = reveal(markdown, markdown.indexOf("Head") + 1);
    expect(revealed.markerState).toBe("active");
    expect(revealed.activeControls.map((control) => control.type)).toEqual(["heading"]);
    expect(revealed.markdown).toBe("# \\# Head **bold** text\n\nPlain paragraph");

    const layout = createLayoutEngine({ fontTheme: "github" }).layout(revealed.markdown, 640);
    expect(layout.blocks[0]?.type).toBe("heading");
  });

  it("shows both block and inline controls when the caret is inside inline style in a heading", () => {
    const markdown = "# Head **bold** text";
    const caret = markdown.indexOf("bold") + 1;

    const revealed = reveal(markdown, caret);
    expect(revealed.activeControls.map((control) => control.type)).toEqual(["heading", "strong"]);
    expect(revealed.markdown).toBe("# \\# Head \\*\\***bold**\\*\\* text");
  });

  it("hides heading controls when the selection already contains the full heading block", () => {
    const markdown = "# Head\n\nPlain";
    const revealed = reveal(markdown, 0, markdown.indexOf("Plain"));

    expect(revealed.markerState).toBe("hidden");
    expect(revealed.markdown).toBe(markdown);
  });

  it("does not show heading controls for a caret on the blank line after the heading", () => {
    const markdown = "# Head\n\nPlain";
    const blankLineStart = markdown.indexOf("\n\n") + 1;
    const revealed = reveal(markdown, blankLineStart);

    expect(revealed.markerState).toBe("hidden");
    expect(revealed.markdown).toBe(markdown);
  });

  it("shows fenced code controls for a caret or inner selection inside the code block", () => {
    const markdown = ["```ts", "const value = 1;", "```", "", "After"].join("\n");

    const caretReveal = reveal(markdown, markdown.indexOf("value"));
    expect(caretReveal.markerState).toBe("active");
    expect(caretReveal.activeControls.map((control) => control.type)).toEqual(["code-block"]);
    expect(caretReveal.markdown).toContain("````\n```ts\nconst value = 1;\n```\n````");

    const layout = createLayoutEngine({ fontTheme: "github" }).layout(caretReveal.markdown, 640);
    expect(layout.blocks[0]?.type).toBe("code_block");

    const innerSelectionReveal = reveal(
      markdown,
      markdown.indexOf("const"),
      markdown.indexOf("1;") + "1;".length,
    );
    expect(innerSelectionReveal.markerState).toBe("active");
    expect(innerSelectionReveal.markdown).toContain("```ts");
  });

  it("hides fenced code controls when the selection contains the full code block", () => {
    const markdown = ["Before", "", "```ts", "const value = 1;", "```", "", "After"].join("\n");
    const from = markdown.indexOf("```ts");
    const to = markdown.indexOf("After");

    const revealed = reveal(markdown, from, to);
    expect(revealed.markerState).toBe("hidden");
    expect(revealed.markdown).toBe(markdown);
  });

  it("shows inline style controls at the caret, inside content, and on source boundaries", () => {
    const markdown = "**bold** *em* ~~del~~ `code` [docs](https://example.com)";

    for (const [sourceText, expectedType] of [
      ["**bold**", "strong"],
      ["*em*", "emphasis"],
      ["~~del~~", "strikethrough"],
      ["`code`", "code-span"],
      ["[docs](https://example.com)", "link"],
    ] as const) {
      const sourceStart = markdown.indexOf(sourceText);
      for (const caret of [sourceStart, sourceStart + 1, sourceStart + sourceText.length]) {
        const revealed = reveal(markdown, caret);
        expect(revealed.activeToken?.type, `${sourceText} at ${caret}`).toBe(expectedType);
        expect(revealed.markdown, `${sourceText} at ${caret}`).toContain(sourceText);
      }
    }
  });

  it("keeps inline content styled while showing its Markdown controls", () => {
    const markdown = "**bold** *em* ~~del~~ `code` [docs](https://example.com)";
    const layoutEngine = createLayoutEngine({ fontTheme: "github" });

    for (const [sourceText, expectedType, content] of [
      ["**bold**", "strong", "bold"],
      ["*em*", "emphasis", "em"],
      ["~~del~~", "strikethrough", "del"],
      ["`code`", "inline_code", "code"],
      ["[docs](https://example.com)", "link", "docs"],
    ] as const) {
      const revealed = reveal(markdown, markdown.indexOf(content));
      const layout = layoutEngine.layout(revealed.markdown, 720);
      const fragment = layout.lines
        .filter((line) => line.kind === "text")
        .flatMap((line) => line.fragments)
        .find((candidate) => candidate.text === content);
      expect(revealed.markdown, sourceText).toContain(sourceText);
      expect(fragment?.type, sourceText).toBe(expectedType);
      if (expectedType === "link") {
        expect(fragment?.meta?.type).toBe("link");
      }
    }
  });

  it("does not reveal Markdown controls for bare URL links", () => {
    const markdown = "Visit https://example.com now";
    const revealed = reveal(markdown, markdown.indexOf("example"));

    expect(revealed.markerState).toBe("hidden");
    expect(revealed.markdown).toBe(markdown);
    expect(revealed.activeControls).toEqual([]);
  });

  it("requests source-text rendering for the active table block only", () => {
    const firstTable = "| A | B |\n| - | - |\n| **x** | y |";
    const secondTable = "| C | D |\n| - | - |\n| 1 | 2 |";
    const markdown = `${firstTable}\n\noutside **bold**\n\n${secondTable}`;

    const first = reveal(markdown, markdown.indexOf("x"));
    expect(first.markerState).toBe("active");
    expect(first.markdown).toBe(markdown);
    expect(first.activeControls.map((control) => control.type)).toEqual(["table"]);
    expect(first.sourceTextBlockRanges).toEqual([{ from: 0, to: firstTable.length }]);

    const secondTableFrom = markdown.indexOf(secondTable);
    const second = reveal(markdown, markdown.indexOf("1 | 2"));
    expect(second.activeControls.map((control) => control.type)).toEqual(["table"]);
    expect(second.sourceTextBlockRanges).toEqual([
      { from: secondTableFrom, to: secondTableFrom + secondTable.length },
    ]);

    const outside = reveal(markdown, markdown.indexOf("bold"));
    expect(outside.activeControls.map((control) => control.type)).toEqual(["strong"]);
    expect(outside.sourceTextBlockRanges).toEqual([]);
  });

  it("requests source-text rendering for the active image block only", () => {
    const firstImage = "![alt](./one.png)";
    const secondImage = "![other](./two.png)";
    const markdown = `${firstImage}\n\noutside **bold**\n\n${secondImage}`;

    const first = reveal(markdown, markdown.indexOf("alt"));
    expect(first.markerState).toBe("active");
    expect(first.markdown).toBe(markdown);
    expect(first.activeControls.map((control) => control.type)).toEqual(["image"]);
    expect(first.sourceTextBlockRanges).toEqual([{ from: 0, to: firstImage.length }]);

    const secondImageFrom = markdown.indexOf(secondImage);
    const second = reveal(markdown, markdown.indexOf("other"));
    expect(second.activeControls.map((control) => control.type)).toEqual(["image"]);
    expect(second.sourceTextBlockRanges).toEqual([
      { from: secondImageFrom, to: secondImageFrom + secondImage.length },
    ]);

    const outside = reveal(markdown, markdown.indexOf("bold"));
    expect(outside.activeControls.map((control) => control.type)).toEqual(["strong"]);
    expect(outside.sourceTextBlockRanges).toEqual([]);
  });

  it("treats a paragraph containing an image as one active source line", () => {
    const markdown = "before ![alt](./one.png) after";
    const revealed = reveal(markdown, markdown.indexOf("before"));

    expect(revealed.markerState).toBe("active");
    expect(revealed.activeControls.map((control) => control.type)).toEqual(["image"]);
    expect(revealed.sourceTextBlockRanges).toEqual([{ from: 0, to: markdown.length }]);
  });

  it("emits explicit editable runs for revealed control characters", () => {
    const strong = reveal("**abc**", 1);
    const strongControls = strong.sourceMap.runs.filter(
      (run) => run.kind === "control" && run.controlType === "strong",
    );
    expect(strongControls.map((run) => run.sourceOffsets)).toEqual([
      [0, 1],
      [1, 2],
      [5, 6],
      [6, 7],
    ]);

    const linkMarkdown = "[hello](https://example.com)";
    const link = reveal(linkMarkdown, linkMarkdown.indexOf("https") + 1);
    const suffixStart = linkMarkdown.indexOf("]");
    const suffixControls = link.sourceMap.runs.filter(
      (run) =>
        run.kind === "control" &&
        run.controlType === "link" &&
        run.sourceOffsets[0]! >= suffixStart,
    );
    expect(suffixControls.map((run) => run.sourceOffsets).slice(0, 4)).toEqual([
      [suffixStart, suffixStart + 1],
      [suffixStart + 1, suffixStart + 2],
      [suffixStart + 2, suffixStart + 3],
      [suffixStart + 3, suffixStart + 4],
    ]);
  });

  it("hides inline controls when the selection contains the full styled source range", () => {
    const markdown = "abc **123** 456";
    const revealed = reveal(markdown, markdown.indexOf("abc"), markdown.indexOf("456") + 3);

    expect(revealed.markerState).toBe("hidden");
    expect(revealed.markdown).toBe(markdown);
  });

  it("shows inline controls when a noncollapsed selection is inside the styled range only", () => {
    const markdown = "abc **123** 456";
    const revealed = reveal(markdown, markdown.indexOf("123"), markdown.indexOf("123") + 3);

    expect(revealed.markerState).toBe("active");
    expect(revealed.activeToken?.type).toBe("strong");
    expect(revealed.markdown).toContain("\\*\\***123**\\*\\*");
  });

  it("does not show inline controls for a caret just outside the controlling source range", () => {
    const markdown = "abc **123** 456";
    const tokenStart = markdown.indexOf("**123**");

    const revealed = reveal(markdown, tokenStart - 1);
    expect(revealed.markerState).toBe("hidden");
    expect(revealed.markdown).toBe(markdown);
  });
});
