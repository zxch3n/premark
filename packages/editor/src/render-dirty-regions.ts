import type { DocumentLayout } from "@pretext-md/layout";

import type { Rect } from "./editable-layout.ts";

export interface EditorRenderViewport {
  readonly containerWidth: number;
  readonly scrollTop: number;
  readonly height: number | null;
  readonly overscanY: number;
}

export function createLayoutDirtyRects(
  layout: DocumentLayout,
  viewport: EditorRenderViewport,
): readonly Rect[] {
  const update = layout.update;
  if (update === undefined) {
    return [];
  }

  const dirtyRange = dirtyYRangeForLayout(layout);
  if (dirtyRange === null) {
    return [];
  }

  const viewportTop = viewport.height === null ? 0 : viewport.scrollTop;
  const viewportBottom =
    viewport.height === null ? layout.totalHeight : viewportTop + viewport.height;
  const top = Math.max(dirtyRange.top, viewportTop);
  const bottom = Math.min(dirtyRange.bottom, viewportBottom);
  if (bottom <= top) {
    return [];
  }

  return [
    {
      x: 0,
      y: top,
      width: layout.containerWidth,
      height: bottom - top,
    },
  ];
}

function dirtyYRangeForLayout(
  layout: DocumentLayout,
): { readonly top: number; readonly bottom: number } | null {
  const update = layout.update;
  if (update === undefined) {
    return null;
  }

  if (update.mode === "full") {
    return {
      top: 0,
      bottom: layout.totalHeight,
    };
  }

  const dirtyBlocks = layout.blocks.slice(update.dirtyFromBlock, update.dirtyToBlock);
  const firstDirtyBlock =
    dirtyBlocks[0] ?? layout.blocks[update.dirtyFromBlock] ?? layout.blocks.at(-1);
  if (firstDirtyBlock === undefined) {
    return null;
  }

  const dirtyTop = firstDirtyBlock.y;
  const dirtyBottom =
    update.suffixYOffset === 0 && dirtyBlocks.length > 0
      ? Math.max(...dirtyBlocks.map((block) => block.y + block.height))
      : layout.totalHeight;

  return {
    top: dirtyTop,
    bottom: dirtyBottom,
  };
}
