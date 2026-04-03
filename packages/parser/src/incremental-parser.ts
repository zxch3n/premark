import { TreeFragment } from "@lezer/common";

import { simpleDiff, shouldFullReparse } from "./diff-text.ts";
import {
  extractTopLevelBlockEntries,
  getMarkdownParser,
  materializeBlocks,
  parseMarkdownDocument,
} from "./lezer-adapter.ts";

import type {
  BlockSpan,
  IncrementalParseOptions,
  IncrementalParseResult,
  IncrementalParseState,
  MarkdownBlock,
  StreamParseSnapshot,
} from "./types.ts";

export function createIncrementalParseState(markdown = ""): IncrementalParseState {
  const parsed = parseMarkdownDocument(markdown);
  return createState(markdown, parsed.tree, parsed.blocks, parsed.blockSpans, 1);
}

export function incrementalParse(
  previousState: IncrementalParseState,
  newText: string,
  options?: IncrementalParseOptions,
): IncrementalParseResult {
  const change = simpleDiff(previousState.text, newText);

  if (change === null) {
    return {
      state: previousState,
      mode: "incremental",
      change,
      dirtyFromBlock: previousState.blocks.length,
      dirtyToBlock: previousState.blocks.length,
      reusedPrefixCount: previousState.blocks.length,
      reusedSuffixCount: 0,
      removedCount: 0,
      allBlocks: [...previousState.blocks],
      closedBlocks: [...previousState.closedBlocks],
      partialBlocks: [...previousState.partialBlocks],
      sourceLength: previousState.sourceLength,
    };
  }

  if (shouldFullReparse(change, options)) {
    return fullParseResult(previousState, newText, change);
  }

  const fragments = TreeFragment.applyChanges(previousState.fragments, [change]);
  const tree = getMarkdownParser().parse(newText, fragments);
  const extracted = extractTopLevelBlockEntries(tree, newText);
  const nextSpans = extracted.entries.map((entry) => entry.span);
  const reusedPrefixCount = countReusablePrefix(
    previousState.blockSpans,
    nextSpans,
    change.fromA,
    change.fromB,
  );
  const reusedSuffixCount = countReusableSuffix(
    previousState.blockSpans,
    nextSpans,
    reusedPrefixCount,
    change.toA,
    change.toB,
  );
  const middleStart = reusedPrefixCount;
  const middleEnd = nextSpans.length - reusedSuffixCount;
  const nextBlocks = [
    ...previousState.blocks.slice(0, reusedPrefixCount),
    ...materializeBlocks(
      extracted.entries.slice(middleStart, middleEnd),
      newText,
      extracted.definitions,
    ),
    ...previousState.blocks.slice(previousState.blocks.length - reusedSuffixCount),
  ];
  const nextState = createState(newText, tree, nextBlocks, nextSpans, previousState.version + 1);

  return {
    state: nextState,
    mode: "incremental",
    change,
    dirtyFromBlock: middleStart,
    dirtyToBlock: middleEnd,
    reusedPrefixCount,
    reusedSuffixCount,
    removedCount: Math.max(0, previousState.blocks.length - nextBlocks.length),
    allBlocks: [...nextState.blocks],
    closedBlocks: [...nextState.closedBlocks],
    partialBlocks: [...nextState.partialBlocks],
    sourceLength: nextState.sourceLength,
  };
}

export function parseMarkdownStream(markdown: string): StreamParseSnapshot {
  const state = createIncrementalParseState(markdown);
  return {
    allBlocks: [...state.blocks],
    closedBlocks: [...state.closedBlocks],
    partialBlocks: [...state.partialBlocks],
    sourceLength: state.sourceLength,
  };
}

export function finalizeIncrementalParseState(state: IncrementalParseState): IncrementalParseState {
  return {
    ...state,
    fragments: TreeFragment.addTree(state.tree),
    closedBlocks: [...state.blocks],
    partialBlocks: [],
    version: state.version + 1,
  };
}

function fullParseResult(
  previousState: IncrementalParseState,
  newText: string,
  change: NonNullable<ReturnType<typeof simpleDiff>>,
): IncrementalParseResult {
  const parsed = parseMarkdownDocument(newText);
  const nextState = createState(
    newText,
    parsed.tree,
    parsed.blocks,
    parsed.blockSpans,
    previousState.version + 1,
  );

  return {
    state: nextState,
    mode: "full",
    change,
    dirtyFromBlock: 0,
    dirtyToBlock: nextState.blocks.length,
    reusedPrefixCount: 0,
    reusedSuffixCount: 0,
    removedCount: Math.max(0, previousState.blocks.length - nextState.blocks.length),
    allBlocks: [...nextState.blocks],
    closedBlocks: [...nextState.closedBlocks],
    partialBlocks: [...nextState.partialBlocks],
    sourceLength: nextState.sourceLength,
  };
}

function createState(
  text: string,
  tree: import("@lezer/common").Tree,
  blocks: MarkdownBlock[],
  blockSpans: BlockSpan[],
  version: number,
): IncrementalParseState {
  const split = splitClosedAndPartialBlocks(text, blocks, blockSpans);

  return {
    text,
    tree,
    fragments: TreeFragment.addTree(tree),
    blocks,
    blockSpans,
    closedBlocks: split.closedBlocks,
    partialBlocks: split.partialBlocks,
    sourceLength: text.length,
    version,
  };
}

function splitClosedAndPartialBlocks(
  text: string,
  blocks: MarkdownBlock[],
  blockSpans: BlockSpan[],
): {
  closedBlocks: MarkdownBlock[];
  partialBlocks: MarkdownBlock[];
} {
  if (blocks.length === 0) {
    return {
      closedBlocks: [],
      partialBlocks: [],
    };
  }

  if (text.length === 0 || /\n[ \t]*\n[ \t]*$/u.test(text)) {
    return {
      closedBlocks: [...blocks],
      partialBlocks: [],
    };
  }

  const lastBlock = blocks.at(-1)!;
  const lastSpan = blockSpans.at(-1)!;
  if (isDefinitelyClosed(lastBlock, text.slice(lastSpan.from, lastSpan.to))) {
    return {
      closedBlocks: [...blocks],
      partialBlocks: [],
    };
  }

  return {
    closedBlocks: blocks.slice(0, -1),
    partialBlocks: [lastBlock],
  };
}

function isDefinitelyClosed(block: MarkdownBlock, source: string): boolean {
  switch (block.type) {
    case "heading":
    case "thematic-break":
      return true;
    case "code-block":
      return isClosedFencedCode(source);
    default:
      return false;
  }
}

function isClosedFencedCode(source: string): boolean {
  const openingFence = source.match(/^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n/u);
  if (openingFence === null) {
    return false;
  }

  const fence = openingFence[1];
  const closingFence = source.trimEnd().match(/(?:^|\n)[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/u);

  return (
    closingFence !== null &&
    closingFence[1][0] === fence[0] &&
    closingFence[1].length >= fence.length
  );
}

function countReusablePrefix(
  previousSpans: readonly BlockSpan[],
  nextSpans: readonly BlockSpan[],
  changeFromA: number,
  changeFromB: number,
): number {
  let prefix = 0;

  while (prefix < previousSpans.length && prefix < nextSpans.length) {
    const previous = previousSpans[prefix];
    const next = nextSpans[prefix];
    if (
      previous.to > changeFromA ||
      next.to > changeFromB ||
      previous.signature !== next.signature
    ) {
      break;
    }
    prefix += 1;
  }

  return prefix;
}

function countReusableSuffix(
  previousSpans: readonly BlockSpan[],
  nextSpans: readonly BlockSpan[],
  prefixCount: number,
  changeToA: number,
  changeToB: number,
): number {
  let suffix = 0;

  while (suffix < previousSpans.length - prefixCount && suffix < nextSpans.length - prefixCount) {
    const previous = previousSpans[previousSpans.length - 1 - suffix];
    const next = nextSpans[nextSpans.length - 1 - suffix];

    if (
      previous.from < changeToA ||
      next.from < changeToB ||
      previous.signature !== next.signature
    ) {
      break;
    }

    suffix += 1;
  }

  return suffix;
}
