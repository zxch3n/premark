import type { PrepareOptions } from "@chenglou/pretext";

import { getMeasurementContext } from "./measurement-context.ts";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function measureGraphemeBoundaryXs(
  text: string,
  font: string,
  _options?: PrepareOptions,
): readonly number[] {
  const boundaries = Array.from({ length: text.length + 1 }, () => 0);
  if (text.length === 0) {
    return boundaries;
  }

  const context = getMeasurementContext();
  context.font = font;
  for (const part of graphemeSegmenter.segment(text)) {
    const startX = context.measureText(text.slice(0, part.index)).width;
    const nextOffset = part.index + part.segment.length;
    boundaries[part.index] = startX;
    for (let offset = part.index + 1; offset < part.index + part.segment.length; offset += 1) {
      boundaries[offset] = startX;
    }
    boundaries[nextOffset] = context.measureText(text.slice(0, nextOffset)).width;
  }

  boundaries[text.length] = context.measureText(text).width;
  return boundaries;
}
