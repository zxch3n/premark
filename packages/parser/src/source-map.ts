import type { BlockSpan, IncrementalParseState, MarkdownInlineSourceRecord } from "./types.ts";

export function findBlockSpanAtOffset(
  state: Pick<IncrementalParseState, "blockSpans">,
  offset: number,
): BlockSpan | null {
  let low = 0;
  let high = state.blockSpans.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const span = state.blockSpans[middle]!;
    if (offset < span.from) {
      high = middle - 1;
      continue;
    }
    if (offset > span.to) {
      low = middle + 1;
      continue;
    }
    return span;
  }

  return null;
}

export function findBlockSpanById(
  state: Pick<IncrementalParseState, "blockSpans">,
  id: string,
): BlockSpan | null {
  return state.blockSpans.find((span) => span.id === id) ?? null;
}

export function findInlineSourceRecordsAtOffset(
  records: readonly MarkdownInlineSourceRecord[],
  offset: number,
): MarkdownInlineSourceRecord[] {
  return [...records]
    .filter((record) => offset >= record.source.from && offset < record.source.to)
    .sort(
      (left, right) => left.source.to - left.source.from - (right.source.to - right.source.from),
    );
}
