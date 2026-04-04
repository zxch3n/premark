import {
  appendIncrementalParse,
  createIncrementalParseState,
  finalizeIncrementalParseState,
} from "./incremental-parser.ts";
import { freezeMarkdownBlockArray } from "./immutable.ts";

import type {
  IncrementalParseResult,
  IncrementalParseState,
  StreamParseResult,
  StreamParseSnapshot,
} from "./types.ts";

export class StreamParser {
  private state: IncrementalParseState = createIncrementalParseState();

  private lastResult: IncrementalParseResult | null = null;

  push(chunk: string): StreamParseResult {
    const previousClosedCount = this.state.closedBlocks.length;
    const result = appendIncrementalParse(this.state, chunk);
    this.state = result.state;
    this.lastResult = result;
    const emittedBlocks = freezeMarkdownBlockArray(
      this.state.closedBlocks.slice(previousClosedCount),
    );

    return {
      ...result,
      emittedBlocks,
      ...this.snapshot(),
    };
  }

  finish(): StreamParseResult {
    const previousClosedCount = this.state.closedBlocks.length;
    this.state = finalizeIncrementalParseState(this.state);
    this.lastResult = null;
    const emittedBlocks = freezeMarkdownBlockArray(
      this.state.closedBlocks.slice(previousClosedCount),
    );

    return {
      emittedBlocks,
      ...this.snapshot(),
    };
  }

  snapshot(): StreamParseSnapshot {
    return {
      allBlocks: this.state.blocks,
      closedBlocks: this.state.closedBlocks,
      partialBlocks: this.state.partialBlocks,
      sourceLength: this.state.sourceLength,
    };
  }

  getState(): IncrementalParseState {
    return this.state;
  }

  getLastResult(): IncrementalParseResult | null {
    return this.lastResult;
  }
}
