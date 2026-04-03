import { MarkdownParser, type BlockNode } from 'markdown-parser'

/**
 * StreamParser wraps markdown-parser's streaming mode.
 * It accumulates markdown text and provides incremental block parsing.
 */
export class StreamParser {
  private parser = new MarkdownParser()
  private accumulated = ''
  private finalizedBlocks: BlockNode[] = []

  /**
   * Feed a chunk of markdown text. Returns newly finalized blocks.
   */
  push(chunk: string): BlockNode[] {
    this.accumulated += chunk
    const newFinalized = this.parser.parse(this.accumulated, { stream: true })
    this.finalizedBlocks.push(...newFinalized)
    return newFinalized
  }

  /**
   * Get all blocks including partial/unfinalized ones (for optimistic rendering).
   */
  getPartialBlocks(): BlockNode[] {
    return this.parser.experimental_partialNodes
  }

  /**
   * Signal end of input. Returns any remaining blocks.
   */
  finish(): BlockNode[] {
    const remaining = this.parser.parse('', { stream: false })
    this.finalizedBlocks.push(...remaining)
    return remaining
  }

  /**
   * Get all finalized blocks so far.
   */
  getFinalizedBlocks(): BlockNode[] {
    return this.finalizedBlocks
  }

  /**
   * Get the full accumulated text.
   */
  getText(): string {
    return this.accumulated
  }

  /**
   * Reset the parser state.
   */
  reset(): void {
    this.parser = new MarkdownParser()
    this.accumulated = ''
    this.finalizedBlocks = []
  }
}
