import { measureGraphemeBoundaryXs, type DocumentLayout } from "@pretext-md/layout";
import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import { darkTilePalette, drawTile } from "../src/index.ts";

installNodeCanvas();

interface FillTextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

function createRecordingContext(): CanvasRenderingContext2D & { calls: FillTextCall[] } {
  const calls: FillTextCall[] = [];
  const gradient = { addColorStop() {} };
  return {
    calls,
    save() {},
    restore() {},
    clearRect() {},
    createLinearGradient: () => gradient,
    beginPath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    clip() {},
    fillRect() {},
    arc() {},
    fillText: (text: string, x: number, y: number) => calls.push({ text, x, y }),
    measureText: (text: string) => new OffscreenCanvas(1, 1).getContext("2d")!.measureText(text),
    set fillStyle(_value: unknown) {},
    set strokeStyle(_value: unknown) {},
    set lineWidth(_value: number) {},
    set globalAlpha(_value: number) {},
    set font(_value: string) {},
    set textBaseline(_value: CanvasTextBaseline) {},
  } as unknown as CanvasRenderingContext2D & { calls: FillTextCall[] };
}

describe("drawTile", () => {
  it("draws emoji runs at layout grapheme boundaries instead of canvas advances", () => {
    const emoji = "👨‍👩‍👧‍👦";
    const text = emoji.repeat(7);
    const font = 'normal 400 16px "Segoe UI", Helvetica, Arial, sans-serif';
    const boundaries = measureGraphemeBoundaryXs(text, font);
    const layout: DocumentLayout = {
      containerWidth: 240,
      totalHeight: 24,
      version: 0,
      blocks: [
        {
          index: 0,
          type: "paragraph",
          firstLineIndex: 0,
          lineCount: 1,
          y: 0,
          height: 24,
          contentBox: { x: 0, y: 0, width: 240, height: 24 },
          meta: { type: "paragraph" },
          context: { quoteDepth: 0, listDepth: 0 },
        },
      ],
      lines: [
        {
          kind: "text",
          index: 0,
          blockIndex: 0,
          lineIndexInBlock: 0,
          x: 0,
          y: 0,
          height: 24,
          width: boundaries.at(-1)!,
          fragments: [
            {
              text,
              x: 0,
              width: boundaries.at(-1)!,
              font,
              type: "text",
            },
          ],
        },
      ],
    };
    const ctx = createRecordingContext();

    drawTile(ctx, layout, 240, 80, {
      cardRadius: 0,
      contentPadding: 0,
      palette: darkTilePalette,
    });

    const emojiCalls = ctx.calls.filter((call) => call.text === emoji);
    expect(emojiCalls).toHaveLength(7);
    expect(emojiCalls.map((call) => call.x)).toEqual(
      Array.from({ length: 7 }, (_, index) => boundaries[emoji.length * index]),
    );
  });
});
