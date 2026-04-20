export interface WordSegment {
  readonly from: number;
  readonly to: number;
  readonly isWordLike: boolean;
}

export function createWordSegments(text: string): WordSegment[] {
  if ("Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text), (segment) => ({
      from: segment.index,
      to: segment.index + segment.segment.length,
      isWordLike: segment.isWordLike === true,
    }));
  }

  const segments: WordSegment[] = [];
  const pattern = /[\p{Letter}\p{Number}_]+/gu;
  for (const match of text.matchAll(pattern)) {
    const from = match.index;
    segments.push({
      from,
      to: from + match[0].length,
      isWordLike: true,
    });
  }
  return segments;
}
