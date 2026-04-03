import { describe, it, expect } from 'vitest'
import { createHighlighter } from '../src/index.js'

describe('createHighlighter', () => {
  const hl = createHighlighter()

  it('highlights TypeScript code', () => {
    const html = hl.highlight('const x = 1', 'typescript')
    expect(html).toBeDefined()
    expect(html).toContain('token')
    expect(html).toContain('keyword')
  })

  it('highlights JavaScript code', () => {
    const html = hl.highlight('function foo() {}', 'javascript')
    expect(html).toBeDefined()
    expect(html).toContain('token')
  })

  it('highlights Python code', () => {
    const html = hl.highlight('def foo():\n  pass', 'python')
    expect(html).toBeDefined()
    expect(html).toContain('token')
  })

  it('resolves language aliases', () => {
    const html = hl.highlight('const x = 1', 'ts')
    expect(html).toBeDefined()
    expect(html).toContain('token')
  })

  it('returns undefined for unknown languages', () => {
    const html = hl.highlight('hello', 'nonexistent-lang')
    expect(html).toBeUndefined()
  })

  it('tokenizes code into line arrays', () => {
    const tokens = hl.tokenize('const x = 1\nlet y = 2', 'typescript')
    expect(tokens).toBeDefined()
    expect(tokens!).toHaveLength(2) // 2 lines
    expect(tokens![0].length).toBeGreaterThan(0)
    expect(tokens![0][0]).toHaveProperty('content')
    expect(tokens![0][0]).toHaveProperty('tokenType')
  })

  it('tokenize returns undefined for unknown languages', () => {
    const tokens = hl.tokenize('hello', 'nonexistent-lang')
    expect(tokens).toBeUndefined()
  })

  it('checks language availability', () => {
    expect(hl.isLanguageLoaded('typescript')).toBe(true)
    expect(hl.isLanguageLoaded('ts')).toBe(true)
    expect(hl.isLanguageLoaded('python')).toBe(true)
    expect(hl.isLanguageLoaded('nonexistent')).toBe(false)
  })

  it('handles empty code', () => {
    const html = hl.highlight('', 'typescript')
    expect(html).toBeDefined()
  })

  it('handles code with special characters', () => {
    const html = hl.highlight('const s = "<div>test</div>"', 'typescript')
    expect(html).toBeDefined()
  })

  it('handles multi-line code blocks', () => {
    const code = `function hello() {
  console.log("Hello, world!")
  return 42
}`
    const html = hl.highlight(code, 'javascript')
    expect(html).toBeDefined()
    expect(html).toContain('function')
  })

  it('handles bash/shell aliases', () => {
    expect(hl.isLanguageLoaded('sh')).toBe(true)
    expect(hl.isLanguageLoaded('shell')).toBe(true)
    expect(hl.isLanguageLoaded('zsh')).toBe(true)

    const html = hl.highlight('echo "hello"', 'sh')
    expect(html).toBeDefined()
  })
})
