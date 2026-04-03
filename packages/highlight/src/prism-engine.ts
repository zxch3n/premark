import Prism from 'prismjs'

// Eagerly load common languages
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'

/** Language aliases */
const langAliases: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  rs: 'rust',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  kt: 'kotlin',
  md: 'markdown',
  tf: 'hcl',
  dockerfile: 'docker',
}

function resolveLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim()
  return langAliases[lower] ?? lower
}

export interface PrismHighlighter {
  highlight(code: string, lang: string): string | undefined
  tokenize(
    code: string,
    lang: string,
  ): { content: string; tokenType: string }[][] | undefined
  loadLanguage(lang: string): void
  isLanguageLoaded(lang: string): boolean
}

export function createHighlighter(): PrismHighlighter {
  return {
    highlight(code: string, lang: string): string | undefined {
      const resolved = resolveLanguage(lang)
      const grammar = Prism.languages[resolved]
      if (!grammar) return undefined
      return Prism.highlight(code, grammar, resolved)
    },

    tokenize(
      code: string,
      lang: string,
    ): { content: string; tokenType: string }[][] | undefined {
      const resolved = resolveLanguage(lang)
      const grammar = Prism.languages[resolved]
      if (!grammar) return undefined

      const lines = code.split('\n')
      return lines.map((line) => {
        const tokens = Prism.tokenize(line, grammar)
        return flattenTokens(tokens)
      })
    },

    loadLanguage(lang: string): void {
      // In a bundled environment, languages are loaded via imports.
      // This is a no-op for pre-loaded languages.
      // For dynamic loading, you'd use import() here.
      const resolved = resolveLanguage(lang)
      if (!Prism.languages[resolved]) {
        try {
          // Dynamic import would go here in a real implementation
          // For now, we rely on the pre-loaded languages above
        } catch {
          // Language not available
        }
      }
    },

    isLanguageLoaded(lang: string): boolean {
      const resolved = resolveLanguage(lang)
      return !!Prism.languages[resolved]
    },
  }
}

/**
 * Flatten Prism token tree into a flat array of { content, tokenType }.
 */
function flattenTokens(
  tokens: (string | Prism.Token)[],
): { content: string; tokenType: string }[] {
  const result: { content: string; tokenType: string }[] = []

  for (const token of tokens) {
    if (typeof token === 'string') {
      if (token.length > 0) {
        result.push({ content: token, tokenType: 'plain' })
      }
    } else {
      // Prism.Token
      if (typeof token.content === 'string') {
        result.push({ content: token.content, tokenType: token.type })
      } else if (Array.isArray(token.content)) {
        const sub = flattenTokens(token.content as (string | Prism.Token)[])
        for (const s of sub) {
          result.push({ content: s.content, tokenType: token.type + '.' + s.tokenType })
        }
      }
    }
  }

  return result
}
