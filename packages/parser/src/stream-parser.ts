import { MarkdownParser } from "markdown-parser";

import type { MarkdownBlock, StreamParseResult, StreamParseSnapshot } from "./types.ts";

export class StreamParser {
  private readonly parser = new MarkdownParser();

  private readonly closedBlocks: MarkdownBlock[] = [];

  private partialBlocks: MarkdownBlock[] = [];

  private sourceLength = 0;

  push(chunk: string): StreamParseResult {
    const emittedBlocks = this.parser.parse(chunk, { stream: true });
    this.sourceLength += chunk.length;
    this.closedBlocks.push(...emittedBlocks);
    this.partialBlocks = [...this.parser.experimental_partialNodes];

    return {
      emittedBlocks,
      ...this.snapshot(),
    };
  }

  finish(): StreamParseResult {
    const emittedBlocks = this.parser.parse("", { stream: false });
    this.closedBlocks.push(...emittedBlocks);
    this.partialBlocks = [];

    return {
      emittedBlocks,
      ...this.snapshot(),
    };
  }

  snapshot(): StreamParseSnapshot {
    return {
      allBlocks: [...this.closedBlocks, ...this.partialBlocks],
      closedBlocks: [...this.closedBlocks],
      partialBlocks: [...this.partialBlocks],
      sourceLength: this.sourceLength,
    };
  }
}
