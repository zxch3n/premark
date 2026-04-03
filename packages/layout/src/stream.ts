import { diffBlocks, StreamParser } from "@pretext-md/parser";

import type { DocumentLayout, LayoutDelta, LayoutStream } from "./types.ts";

import { diffLines, LayoutEngineImpl } from "./engine.ts";

function createDelta(
  previousLayout: import("./types.ts").DocumentLayout,
  nextLayout: import("./types.ts").DocumentLayout,
  dirtyFromBlock: number,
): LayoutDelta {
  const lineDiff = diffLines(previousLayout, nextLayout, dirtyFromBlock);

  return {
    version: nextLayout.version,
    dirtyFromBlock,
    previousTotalHeight: previousLayout.totalHeight,
    totalHeight: nextLayout.totalHeight,
    heightDelta: nextLayout.totalHeight - previousLayout.totalHeight,
    appendedLines: lineDiff.appendedLines,
    modifiedLines: lineDiff.modifiedLines,
    removedLineCount: lineDiff.removedLineCount,
  };
}

class LayoutStreamImpl implements LayoutStream {
  private readonly parser = new StreamParser();

  private blocks: ReturnType<StreamParser["snapshot"]>["allBlocks"] = [];

  private layout: DocumentLayout;

  constructor(
    private readonly engine: LayoutEngineImpl,
    private containerWidth: number,
  ) {
    this.layout = {
      lines: [],
      blocks: [],
      totalHeight: 0,
      containerWidth,
      version: 0,
    };
  }

  push(chunk: string): LayoutDelta {
    const previousBlocks = this.blocks;
    const previousLayout = this.layout;
    const snapshot = this.parser.push(chunk);
    this.blocks = snapshot.allBlocks;
    const blockDiff = diffBlocks(previousBlocks, this.blocks);
    const nextLayout = this.engine.layoutFromBlocks(this.blocks, this.containerWidth);
    this.layout = nextLayout;
    return createDelta(previousLayout, nextLayout, blockDiff.dirtyFromBlock);
  }

  finish(): LayoutDelta {
    const previousBlocks = this.blocks;
    const previousLayout = this.layout;
    const snapshot = this.parser.finish();
    this.blocks = snapshot.allBlocks;
    const blockDiff = diffBlocks(previousBlocks, this.blocks);
    const nextLayout = this.engine.layoutFromBlocks(this.blocks, this.containerWidth);
    this.layout = nextLayout;
    return createDelta(previousLayout, nextLayout, blockDiff.dirtyFromBlock);
  }

  getLayout() {
    return this.layout;
  }

  resize(newWidth: number) {
    this.containerWidth = newWidth;
    this.layout = this.engine.layoutFromBlocks(this.blocks, newWidth);
    return this.layout;
  }
}

export function createStream(engine: LayoutEngineImpl, containerWidth: number): LayoutStream {
  return new LayoutStreamImpl(engine, containerWidth);
}
