import Prism from "prismjs";

import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-typescript.js";

export interface HighlightToken {
  content: string;
  tokenType: string;
}

export interface PrismHighlighterLike {
  highlight(code: string, lang: string): string;
  tokenize(code: string, lang: string): HighlightToken[][];
}

const lightThemeCss = `.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#6e7781;font-style:italic}.token.punctuation{color:#57606a}.token.property,.token.tag,.token.boolean,.token.number,.token.constant,.token.symbol,.token.deleted{color:#0550ae}.token.selector,.token.attr-name,.token.string,.token.char,.token.builtin,.token.inserted{color:#0a3069}.token.operator,.token.entity,.token.url,.language-css .token.string,.style .token.string{color:#24292f}.token.atrule,.token.attr-value,.token.keyword{color:#cf222e}.token.function,.token.class-name{color:#8250df}`;
const darkThemeCss = `.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#8b949e;font-style:italic}.token.punctuation{color:#c9d1d9}.token.property,.token.tag,.token.boolean,.token.number,.token.constant,.token.symbol,.token.deleted{color:#79c0ff}.token.selector,.token.attr-name,.token.string,.token.char,.token.builtin,.token.inserted{color:#a5d6ff}.token.operator,.token.entity,.token.url,.language-css .token.string,.style .token.string{color:#e6edf3}.token.atrule,.token.attr-value,.token.keyword{color:#ff7b72}.token.function,.token.class-name{color:#d2a8ff}`;

type PrismNode = Prism.TokenStream;

function resolveLanguage(lang: string): Prism.Grammar {
  const normalized = lang.toLowerCase();
  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    shell: "bash",
    sh: "bash",
    md: "markdown",
    yml: "yaml",
  };
  const language = aliases[normalized] ?? normalized;
  return Prism.languages[language] ?? Prism.languages.plain ?? Prism.languages.text;
}

function flattenTokens(
  input: PrismNode,
  tokenType = "plain",
  output: HighlightToken[] = [],
): HighlightToken[] {
  if (typeof input === "string") {
    output.push({
      content: input,
      tokenType,
    });
    return output;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      flattenTokens(item, tokenType, output);
    }
    return output;
  }

  const nextType = input.type ?? tokenType;
  flattenTokens(input.content, nextType, output);
  return output;
}

function splitLines(tokens: HighlightToken[]): HighlightToken[][] {
  const lines: HighlightToken[][] = [[]];

  for (const token of tokens) {
    const parts = token.content.split("\n");
    parts.forEach((part, index) => {
      if (part.length > 0) {
        lines.at(-1)!.push({
          content: part,
          tokenType: token.tokenType,
        });
      }
      if (index < parts.length - 1) {
        lines.push([]);
      }
    });
  }

  return lines;
}

export interface CreateHighlighterOptions {
  theme?: "light" | "dark";
}

export interface PretextHighlighter extends PrismHighlighterLike {
  getThemeCss(theme?: string): string;
}

export function createHighlighter(_options: CreateHighlighterOptions = {}): PretextHighlighter {
  return {
    highlight(code: string, lang: string): string {
      return Prism.highlight(code, resolveLanguage(lang), lang || "plain");
    },
    tokenize(code: string, lang: string): HighlightToken[][] {
      return splitLines(flattenTokens(Prism.tokenize(code, resolveLanguage(lang))));
    },
    getThemeCss(theme = "light"): string {
      return theme === "dark" ? darkThemeCss : lightThemeCss;
    },
  };
}

export { darkThemeCss, lightThemeCss };
