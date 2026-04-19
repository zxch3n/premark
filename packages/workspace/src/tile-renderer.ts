import type { CanvasRenderMode, CanvasTile, Rect } from "./types.ts";

export type CanvasTileRenderCommand =
  | {
      readonly kind: "rect";
      readonly tileId: string;
      readonly mode: CanvasRenderMode;
      readonly rect: Rect;
    }
  | {
      readonly kind: "preview";
      readonly tileId: string;
      readonly mode: CanvasRenderMode;
      readonly rect: Rect;
      readonly previewKey: string;
    }
  | {
      readonly kind: "detail";
      readonly tileId: string;
      readonly mode: CanvasRenderMode;
      readonly rect: Rect;
      readonly blockIds: readonly string[];
      readonly previewKey: string;
    };

export function createCanvasTileRenderCommands(
  tiles: readonly CanvasTile[],
): CanvasTileRenderCommand[] {
  return tiles.map((tile) => {
    switch (tile.renderMode) {
      case "skeleton":
        return {
          kind: "rect",
          tileId: tile.id,
          mode: tile.renderMode,
          rect: tile.rect,
        };
      case "cached-preview":
        return {
          kind: "preview",
          tileId: tile.id,
          mode: tile.renderMode,
          rect: tile.rect,
          previewKey: tile.previewKey,
        };
      case "high-detail":
        return {
          kind: "detail",
          tileId: tile.id,
          mode: tile.renderMode,
          rect: tile.rect,
          blockIds: tile.blockIds,
          previewKey: tile.previewKey,
        };
    }
  });
}
