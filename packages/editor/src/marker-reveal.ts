import type { MarkdownInlineSourceRecord, SourceRange } from "@pretext-md/parser";

export type RevealedMarkerType = "strong" | "code-span" | "link";

export interface ActiveMarkerRevealMarkdown {
  readonly markdown: string;
  readonly activeToken: MarkdownInlineSourceRecord | null;
  readonly markerState: "hidden" | "active";
}

export interface ActiveMarkerRevealMarkdownInput {
  readonly markdown: string;
  readonly inlineSources: readonly MarkdownInlineSourceRecord[];
  readonly selectionRange: SourceRange;
}

const REVEALABLE_TYPES: ReadonlySet<MarkdownInlineSourceRecord["type"]> = new Set([
  "strong",
  "code-span",
  "link",
]);

const ESCAPABLE_MARKDOWN_PUNCTUATION_RE = /[\\`*_[\]{}()#+\-.!<>|]/gu;

export function createActiveMarkerRevealMarkdown(
  input: ActiveMarkerRevealMarkdownInput,
): ActiveMarkerRevealMarkdown {
  const activeToken = findActiveMarkerToken(input.inlineSources, input.selectionRange);
  if (activeToken === null) {
    return {
      markdown: input.markdown,
      activeToken: null,
      markerState: "hidden",
    };
  }

  return {
    markdown:
      input.markdown.slice(0, activeToken.source.from) +
      escapeMarkdownAsVisibleText(activeToken.sourceText) +
      input.markdown.slice(activeToken.source.to),
    activeToken,
    markerState: "active",
  };
}

export function findActiveMarkerToken(
  inlineSources: readonly MarkdownInlineSourceRecord[],
  selectionRange: SourceRange,
): MarkdownInlineSourceRecord | null {
  const from = Math.min(selectionRange.from, selectionRange.to);
  const to = Math.max(selectionRange.from, selectionRange.to);
  return (
    inlineSources
      .filter(
        (record) =>
          REVEALABLE_TYPES.has(record.type) &&
          (from === to
            ? from >= record.source.from && from <= record.source.to
            : from >= record.source.from && to <= record.source.to),
      )
      .sort(
        (left, right) => left.source.to - left.source.from - (right.source.to - right.source.from),
      )[0] ?? null
  );
}

function escapeMarkdownAsVisibleText(text: string): string {
  return text.replace(ESCAPABLE_MARKDOWN_PUNCTUATION_RE, "\\$&");
}
