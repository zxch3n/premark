import type { BlockDiffResult } from "./types.ts";

function defaultKey<T>(value: T): string {
  return JSON.stringify(value);
}

export function diffBlocks<T>(
  previousBlocks: readonly T[],
  nextBlocks: readonly T[],
  getKey: (block: T) => string = defaultKey,
): BlockDiffResult<T> {
  const maxLength = Math.max(previousBlocks.length, nextBlocks.length);
  let dirtyFromBlock = maxLength;

  for (let index = 0; index < maxLength; index += 1) {
    const previous = previousBlocks[index];
    const next = nextBlocks[index];
    if (previous === undefined || next === undefined || getKey(previous) !== getKey(next)) {
      dirtyFromBlock = index;
      break;
    }
  }

  if (dirtyFromBlock === maxLength) {
    return {
      dirtyFromBlock: nextBlocks.length,
      appendedBlocks: [],
      modifiedBlocks: [],
      removedCount: 0,
    };
  }

  const modifiedBlocks = new Array<{
    index: number;
    previous?: T;
    next?: T;
  }>();

  const overlapping = Math.min(previousBlocks.length, nextBlocks.length);
  for (let index = dirtyFromBlock; index < overlapping; index += 1) {
    const previous = previousBlocks[index];
    const next = nextBlocks[index];
    if (getKey(previous) !== getKey(next)) {
      modifiedBlocks.push({
        index,
        previous,
        next,
      });
    }
  }

  return {
    dirtyFromBlock,
    appendedBlocks: nextBlocks.slice(overlapping),
    modifiedBlocks,
    removedCount: Math.max(0, previousBlocks.length - nextBlocks.length),
  };
}
