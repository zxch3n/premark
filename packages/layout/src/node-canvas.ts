import { createCanvas } from "@napi-rs/canvas";

class NodeOffscreenCanvas {
  width: number;
  height: number;

  private readonly canvas: {
    getContext(type: "2d"): CanvasRenderingContext2D;
  };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height) as unknown as {
      getContext(type: "2d"): CanvasRenderingContext2D;
    };
  }

  getContext(type: "2d"): CanvasRenderingContext2D {
    return this.canvas.getContext(type);
  }
}

export function installNodeCanvas(): void {
  if (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined") {
    return;
  }

  Object.assign(globalThis, {
    OffscreenCanvas: NodeOffscreenCanvas,
  });
}
