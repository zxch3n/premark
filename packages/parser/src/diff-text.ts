import type { IncrementalParseOptions, TextChange } from "./types.ts";

type IncrementalThresholdOptions = Required<
  Pick<IncrementalParseOptions, "maxChangedChars" | "maxChangedRatio" | "maxChangedLines">
>;

export const DEFAULT_INCREMENTAL_OPTIONS = {
  maxChangedChars: 4096,
  maxChangedRatio: 0.2,
  maxChangedLines: 120,
} satisfies IncrementalThresholdOptions;

export function simpleDiff(oldText: string, newText: string): TextChange | null {
  if (oldText === newText) {
    return null;
  }

  const maxPrefix = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix += 1;
  }

  let oldSuffix = oldText.length;
  let newSuffix = newText.length;
  while (
    oldSuffix > prefix &&
    newSuffix > prefix &&
    oldText.charCodeAt(oldSuffix - 1) === newText.charCodeAt(newSuffix - 1)
  ) {
    oldSuffix -= 1;
    newSuffix -= 1;
  }

  const changedChars = Math.max(oldSuffix - prefix, newSuffix - prefix);
  const baseline = Math.max(1, oldText.length, newText.length);
  const changedLines = Math.max(
    countLines(oldText.slice(prefix, oldSuffix)),
    countLines(newText.slice(prefix, newSuffix)),
  );

  return {
    fromA: prefix,
    toA: oldSuffix,
    fromB: prefix,
    toB: newSuffix,
    changedChars,
    changedRatio: changedChars / baseline,
    changedLines,
  };
}

export function shouldFullReparse(
  change: TextChange | null,
  options: IncrementalParseOptions = {},
): boolean {
  if (change === null) {
    return false;
  }

  const resolved = {
    ...DEFAULT_INCREMENTAL_OPTIONS,
    ...options,
  };

  return (
    change.changedChars > resolved.maxChangedChars ||
    change.changedRatio > resolved.maxChangedRatio ||
    change.changedLines > resolved.maxChangedLines
  );
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lines += 1;
    }
  }
  return lines;
}
