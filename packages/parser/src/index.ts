export { diffBlocks } from "./block-differ.ts";
export { simpleDiff, shouldFullReparse } from "./diff-text.ts";
export {
  createIncrementalParseState,
  incrementalParse,
  parseMarkdownStream,
} from "./incremental-parser.ts";
export { parseMarkdown } from "./lezer-adapter.ts";
export { StreamParser } from "./stream-parser.ts";
export type * from "./types.ts";
