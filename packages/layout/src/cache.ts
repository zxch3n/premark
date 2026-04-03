import type { BlockLayout, LayoutLine } from "./types.ts";

export interface BlockCache {
  contentHash: number;
  prepared: unknown;
  lines: LayoutLine[];
  layoutWidth: number;
  block: BlockLayout;
}

export function hashContent(value: unknown): number {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
