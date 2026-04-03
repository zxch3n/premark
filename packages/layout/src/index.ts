export { createLayoutEngine } from './engine.js'
export type { StyleConfig, LayoutEngine } from './engine.js'
export { LayoutStream } from './stream.js'

// Types
export type {
  DocumentLayout,
  BlockLayout,
  BlockType,
  BlockMeta,
  LayoutLine,
  TextLine,
  OpaqueLine,
  LineBase,
  OpaqueContent,
  CodeBlockContent,
  TableContent,
  TableCell,
  InlineFragment,
  FragmentType,
  FragmentMeta,
  LayoutDelta,
  Highlighter,
} from './types.js'

// Font theme
export {
  resolveFonts,
  resolveFontTheme,
  presets as fontPresets,
  defaultSpacing,
} from './font-theme.js'
export type {
  FontTheme,
  ResolvedFonts,
  SpacingConfig,
} from './font-theme.js'

// Cache
export { BlockCache } from './cache.js'

// Measurement (advanced usage)
export {
  measureBlock,
  measureTextBlock,
  measureRichText,
  measureCodeBlock,
  measureTable,
  measureList,
  measureBlockquote,
  inlineNodesToPlainText,
} from './measure/index.js'
