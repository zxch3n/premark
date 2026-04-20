import type { SourceRange } from "@pretext-md/parser";

export interface GraphemeSegment {
  readonly segment: string;
  readonly from: number;
  readonly to: number;
}

export function createGraphemeSegments(text: string): readonly GraphemeSegment[] {
  const segmenter = createSegmenter();
  if (segmenter !== null) {
    return Array.from(segmenter.segment(text), (part) => ({
      segment: part.segment,
      from: part.index,
      to: part.index + part.segment.length,
    }));
  }

  return Array.from(text, (segment, index) => ({
    segment,
    from: index,
    to: index + segment.length,
  }));
}

export function snapOffsetToGraphemeBoundary(
  text: string,
  offset: number,
  affinity: "backward" | "forward" = "forward",
): number {
  const bounded = Math.min(Math.max(offset, 0), text.length);
  for (const segment of createGraphemeSegments(text)) {
    if (bounded === segment.from || bounded === segment.to) {
      return bounded;
    }
    if (bounded > segment.from && bounded < segment.to) {
      return affinity === "backward" ? segment.from : segment.to;
    }
  }
  return bounded;
}

export function graphemeDeleteBackwardRange(text: string, offset: number): SourceRange {
  const bounded = snapOffsetToGraphemeBoundary(text, offset, "backward");
  let previous = 0;
  for (const segment of createGraphemeSegments(text)) {
    if (segment.to >= bounded) {
      return {
        from: previous,
        to: bounded,
      };
    }
    previous = segment.to;
  }
  return {
    from: previous,
    to: bounded,
  };
}

export function graphemeDeleteForwardRange(text: string, offset: number): SourceRange {
  const bounded = snapOffsetToGraphemeBoundary(text, offset, "forward");
  for (const segment of createGraphemeSegments(text)) {
    if (segment.from >= bounded) {
      return {
        from: bounded,
        to: segment.to,
      };
    }
  }
  return {
    from: bounded,
    to: bounded,
  };
}

function createSegmenter(): Intl.Segmenter | null {
  if (typeof Intl.Segmenter !== "function") {
    return null;
  }
  return new Intl.Segmenter(undefined, { granularity: "grapheme" });
}
