import { diffBlocks } from "./block-differ.ts";
import { parseMarkdown, parseMarkdownStream } from "./marked-adapter.ts";

import type { MarkdownBlock, StreamParseResult, StreamParseSnapshot } from "./types.ts";

export class StreamParser {
  private source = "";

  private closedBlocks: MarkdownBlock[] = [];

  private partialBlocks: MarkdownBlock[] = [];

  private allBlocks: MarkdownBlock[] = [];

  private sourceLength = 0;

  push(chunk: string): StreamParseResult {
    this.source += chunk;
    this.sourceLength = this.source.length;
    const previousClosedBlocks = this.closedBlocks;
    const snapshot = parseMarkdownStream(this.source);
    this.allBlocks = snapshot.allBlocks;
    this.closedBlocks = snapshot.closedBlocks;
    this.partialBlocks = snapshot.partialBlocks;
    const diff = diffBlocks(previousClosedBlocks, this.closedBlocks);
    const emittedBlocks = this.closedBlocks.slice(diff.dirtyFromBlock);

    return {
      emittedBlocks,
      ...this.snapshot(),
    };
  }

  finish(): StreamParseResult {
    const previousClosedBlocks = this.closedBlocks;
    this.allBlocks = parseMarkdown(this.source);
    this.closedBlocks = [...this.allBlocks];
    this.partialBlocks = [];
    const diff = diffBlocks(previousClosedBlocks, this.closedBlocks);
    const emittedBlocks = this.closedBlocks.slice(diff.dirtyFromBlock);

    return {
      emittedBlocks,
      ...this.snapshot(),
    };
  }

  snapshot(): StreamParseSnapshot {
    return {
      allBlocks: [...this.allBlocks],
      closedBlocks: [...this.closedBlocks],
      partialBlocks: [...this.partialBlocks],
      sourceLength: this.sourceLength,
    };
  }
}
