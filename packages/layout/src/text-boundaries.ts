import { prepareWithSegments, type PrepareOptions } from "@chenglou/pretext";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function measureGraphemeBoundaryXs(
  text: string,
  font: string,
  options?: PrepareOptions,
): readonly number[] {
  const boundaries = Array.from({ length: text.length + 1 }, () => 0);
  if (text.length === 0) {
    return boundaries;
  }

  const prepared = prepareWithSegments(text, font, options);
  let textOffset = 0;
  let x = 0;

  prepared.segments.forEach((segment, segmentIndex) => {
    const segmentWidth = prepared.widths[segmentIndex] ?? 0;
    const relativeBoundaries = segmentBoundaryXs(
      segment,
      font,
      options,
      segmentWidth,
      prepared.breakableWidths[segmentIndex],
      prepared.breakablePrefixWidths[segmentIndex],
    );

    for (let offset = 0; offset < segment.length; offset += 1) {
      boundaries[textOffset + offset] = x + (relativeBoundaries[offset] ?? 0);
    }
    boundaries[textOffset + segment.length] = x + segmentWidth;
    textOffset += segment.length;
    x += segmentWidth;
  });

  for (let offset = textOffset; offset <= text.length; offset += 1) {
    boundaries[offset] = x;
  }

  return boundaries;
}

function segmentBoundaryXs(
  segment: string,
  font: string,
  options: PrepareOptions | undefined,
  segmentWidth: number,
  graphemeWidths: readonly number[] | null,
  graphemePrefixWidths: readonly number[] | null,
): readonly number[] {
  const boundaries = Array.from({ length: segment.length + 1 }, () => 0);
  let previousX = 0;
  let graphemeIndex = 0;

  for (const part of graphemeSegmenter.segment(segment)) {
    const nextX =
      graphemePrefixWidths?.[graphemeIndex] ??
      previousX +
        (graphemeWidths?.[graphemeIndex] ?? measurePreparedTextWidth(part.segment, font, options));

    boundaries[part.index] = previousX;
    for (let offset = part.index + 1; offset < part.index + part.segment.length; offset += 1) {
      boundaries[offset] = previousX;
    }
    boundaries[part.index + part.segment.length] = nextX;

    previousX = nextX;
    graphemeIndex += 1;
  }

  const scale = previousX > 0 ? segmentWidth / previousX : 1;
  if (scale !== 1) {
    for (let offset = 0; offset < boundaries.length; offset += 1) {
      boundaries[offset] *= scale;
    }
  }
  boundaries[segment.length] = segmentWidth;
  return boundaries;
}

function measurePreparedTextWidth(
  text: string,
  font: string,
  options: PrepareOptions | undefined,
): number {
  const prepared = prepareWithSegments(text, font, options);
  return prepared.widths.reduce((sum, width) => sum + width, 0);
}
