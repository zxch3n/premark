let cachedContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

export function getMeasurementContext():
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D {
  if (cachedContext !== null) {
    return cachedContext;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    cachedContext = new OffscreenCanvas(1, 1).getContext("2d");
  } else if (typeof document !== "undefined") {
    cachedContext = document.createElement("canvas").getContext("2d");
  } else {
    throw new Error(
      "No canvas measurement context is available. In Node.js call `installNodeCanvas()` before laying out.",
    );
  }

  if (cachedContext === null) {
    throw new Error("Unable to acquire a 2D measurement context.");
  }

  return cachedContext;
}

export function measureTextWidth(text: string, font: string): number {
  const context = getMeasurementContext();
  context.font = font;
  return context.measureText(text).width;
}

export function splitGraphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
    (segment) => segment.segment,
  );
}
