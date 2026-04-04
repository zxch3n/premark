import type { BlockLayout, LayoutLine } from "./types.ts";

export interface BlockCache {
  contentHash: number;
  contentKey: string;
  prepared: unknown;
  lines: LayoutLine[];
  layoutWidth: number;
  block: BlockLayout;
}

export interface ContentIdentity {
  text: string;
  hash: number;
}

function serializeContent(value: unknown): string {
  return JSON.stringify(value, (key, currentValue) =>
    key === "sourceBlockIndex" ? undefined : currentValue,
  );
}

function hashSerializedText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function identifyContent(value: unknown): ContentIdentity {
  const text = serializeContent(value);
  return {
    text,
    hash: hashSerializedText(text),
  };
}

export function hashContent(value: unknown): number {
  return hashSerializedText(serializeContent(value));
}
