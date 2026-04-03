import { StreamParser } from "@pretext-md/parser";

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
    const previousLayout = this.layout;
    const snapshot = this.parser.push(chunk);
    this.blocks = snapshot.allBlocks;
    const parseResult = this.parser.getLastResult();
    const nextLayout =
      parseResult === null
        ? this.engine.layoutFromBlocks(this.blocks, this.containerWidth)
        : this.engine.applyParseResult(parseResult, this.containerWidth);
    this.layout = nextLayout;
    return createDelta(previousLayout, nextLayout, this.engine.getLastDirtyFromLayoutBlock());
  }

  finish(): LayoutDelta {
    const previousLayout = this.layout;
    const snapshot = this.parser.finish();
    this.blocks = snapshot.allBlocks;
    const nextLayout = previousLayout;
    this.layout = nextLayout;
    return createDelta(previousLayout, nextLayout, nextLayout.blocks.length);
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
