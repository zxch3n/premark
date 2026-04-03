import type { MarkdownInline } from "@pretext-md/parser";

import type {
  FragmentMeta,
  FragmentType,
  InlineFragment,
  ResolvedFonts,
  TextLine,
} from "../types.ts";

import { measureTextWidth, splitGraphemes } from "../measurement-context.ts";

import type { ListPrefix } from "./list.ts";

interface StyleState {
  strong: boolean;
  emphasis: boolean;
  strikethrough: boolean;
  link?: {
    href: string;
    title?: string;
  };
}

interface PreparedToken {
  text: string;
  font: string;
  type: FragmentType;
  meta?: FragmentMeta;
  width: number;
  whitespace: boolean;
  forceBreak: boolean;
  paddingX: number;
}

export interface PreparedRichText {
  lineHeight: number;
  tokens: PreparedToken[];
  prefix?: ListPrefix;
  hangingIndent: number;
}

export interface PrepareRichTextOptions {
  nodes: MarkdownInline[];
  fonts: ResolvedFonts;
  baseFont: string;
  lineHeight: number;
  prefix?: ListPrefix;
}

function getFontForStyle(
  style: StyleState,
  fonts: ResolvedFonts,
  baseFont: string,
): {
  font: string;
  type: FragmentType;
  meta?: FragmentMeta;
} {
  if (style.link !== undefined) {
    return {
      font:
        style.strong && style.emphasis
          ? fonts.bodyBoldItalic
          : style.strong
            ? fonts.bodyBold
            : style.emphasis
              ? fonts.bodyItalic
              : baseFont,
      type: "link",
      meta: {
        type: "link",
        href: style.link.href,
        title: style.link.title,
      },
    };
  }

  if (style.strikethrough) {
    return {
      font:
        style.strong && style.emphasis
          ? fonts.bodyBoldItalic
          : style.strong
            ? fonts.bodyBold
            : style.emphasis
              ? fonts.bodyItalic
              : baseFont,
      type: "strikethrough",
    };
  }

  if (style.strong && style.emphasis) {
    return {
      font: fonts.bodyBoldItalic,
      type: "strong_emphasis",
    };
  }

  if (style.strong) {
    return {
      font: fonts.bodyBold,
      type: "strong",
    };
  }

  if (style.emphasis) {
    return {
      font: fonts.bodyItalic,
      type: "emphasis",
    };
  }

  return {
    font: baseFont,
    type: "text",
  };
}

function tokenizeText(text: string): string[] {
  const parts = text.split(/(\s+)/u);
  return parts.filter((part) => part.length > 0);
}

function pushPreparedText(
  target: PreparedToken[],
  text: string,
  font: string,
  type: FragmentType,
  meta: FragmentMeta,
  paddingX = 0,
): void {
  const tokens = tokenizeText(text);
  for (const token of tokens) {
    target.push({
      text: token,
      font,
      type,
      meta,
      width: measureTextWidth(token, font) + paddingX * 2,
      whitespace: /^\s+$/u.test(token),
      forceBreak: false,
      paddingX,
    });
  }
}

function flattenInlineNodes(
  target: PreparedToken[],
  nodes: MarkdownInline[],
  fonts: ResolvedFonts,
  baseFont: string,
  state: StyleState,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushPreparedText(target, node.text, style.font, style.type, style.meta);
        break;
      }
      case "code-span":
        target.push({
          text: node.text,
          font: fonts.inlineCode,
          type: "inline_code",
          width: measureTextWidth(node.text, fonts.inlineCode) + 12,
          whitespace: false,
          forceBreak: false,
          paddingX: 6,
        });
        break;
      case "softbreak": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushPreparedText(target, " ", style.font, style.type, style.meta);
        break;
      }
      case "hardbreak":
        target.push({
          text: "",
          font: baseFont,
          type: "text",
          width: 0,
          whitespace: false,
          forceBreak: true,
          paddingX: 0,
        });
        break;
      case "strong":
        flattenInlineNodes(target, node.children, fonts, baseFont, {
          ...state,
          strong: true,
        });
        break;
      case "emphasis":
        flattenInlineNodes(target, node.children, fonts, baseFont, {
          ...state,
          emphasis: true,
        });
        break;
      case "strikethrough":
        flattenInlineNodes(target, node.children, fonts, baseFont, {
          ...state,
          strikethrough: true,
        });
        break;
      case "link":
        flattenInlineNodes(target, node.children, fonts, baseFont, {
          ...state,
          link: {
            href: node.href,
            title: node.title,
          },
        });
        break;
      case "image": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushPreparedText(target, `[${node.href}]`, style.font, style.type, style.meta);
        break;
      }
      case "html": {
        const style = getFontForStyle(state, fonts, baseFont);
        pushPreparedText(target, node.content, style.font, style.type, style.meta);
        break;
      }
    }
  }
}

function cloneToken(token: PreparedToken, text: string, width: number): PreparedToken {
  return {
    ...token,
    text,
    width,
  };
}

function splitTokenToFit(
  token: PreparedToken,
  availableWidth: number,
): [PreparedToken, PreparedToken | undefined] {
  const graphemes = splitGraphemes(token.text);
  let width = token.paddingX * 2;
  let splitIndex = 0;

  for (let index = 0; index < graphemes.length; index += 1) {
    const nextWidth = width + measureTextWidth(graphemes[index], token.font);
    if (nextWidth > availableWidth && index > 0) {
      splitIndex = index;
      break;
    }
    width = nextWidth;
    splitIndex = index + 1;
    if (nextWidth > availableWidth) {
      break;
    }
  }

  if (splitIndex <= 0) {
    splitIndex = 1;
    width = measureTextWidth(graphemes[0], token.font) + token.paddingX * 2;
  }

  const headText = graphemes.slice(0, splitIndex).join("");
  const tailText = graphemes.slice(splitIndex).join("");

  return [
    cloneToken(token, headText, width),
    tailText.length > 0
      ? cloneToken(token, tailText, measureTextWidth(tailText, token.font) + token.paddingX * 2)
      : undefined,
  ];
}

function canMergeFragments(previous: InlineFragment | undefined, next: InlineFragment): boolean {
  if (previous === undefined) {
    return false;
  }

  return (
    previous.type === next.type &&
    previous.font === next.font &&
    JSON.stringify(previous.meta) === JSON.stringify(next.meta) &&
    previous.x + previous.width === next.x
  );
}

export function prepareRichText(options: PrepareRichTextOptions): PreparedRichText {
  const tokens: PreparedToken[] = [];
  flattenInlineNodes(tokens, options.nodes, options.fonts, options.baseFont, {
    strong: false,
    emphasis: false,
    strikethrough: false,
  });

  return {
    lineHeight: options.lineHeight,
    tokens,
    prefix: options.prefix,
    hangingIndent: options.prefix ? options.prefix.width + options.prefix.gap : 0,
  };
}

export function layoutRichText(
  prepared: PreparedRichText,
  options: {
    blockIndex: number;
    startLineIndex: number;
    x: number;
    y: number;
    maxWidth: number;
  },
): {
  lines: TextLine[];
  height: number;
  width: number;
} {
  const lines: TextLine[] = [];
  let currentFragments: InlineFragment[] = [];
  let lineWidth = 0;
  let contentFragmentCount = 0;
  let lineIndex = 0;
  let maxRight = 0;

  function lineX(): number {
    return options.x + (lineIndex === 0 ? 0 : prepared.hangingIndent);
  }

  function lineLimit(): number {
    return Math.max(1, options.maxWidth - (lineIndex === 0 ? 0 : prepared.hangingIndent));
  }

  function seedLinePrefix(): void {
    if (lineIndex === 0 && prepared.prefix !== undefined) {
      currentFragments.push({
        text: prepared.prefix.text,
        x: 0,
        width: prepared.prefix.width,
        font: prepared.prefix.font,
        type: "strong",
      });
      lineWidth = prepared.prefix.width + prepared.prefix.gap;
    }
  }

  function commitLine(forceEmpty = false): void {
    if (!forceEmpty && currentFragments.length === 0) {
      return;
    }

    const renderedWidth =
      currentFragments.length === 0
        ? 0
        : Math.max(...currentFragments.map((fragment) => fragment.x + fragment.width));

    lines.push({
      kind: "text",
      index: options.startLineIndex + lines.length,
      blockIndex: options.blockIndex,
      lineIndexInBlock: lines.length,
      x: lineX(),
      y: options.y + lines.length * prepared.lineHeight,
      height: prepared.lineHeight,
      width: renderedWidth,
      fragments: currentFragments,
    });

    maxRight = Math.max(maxRight, lineX() - options.x + renderedWidth);
    lineIndex += 1;
    currentFragments = [];
    lineWidth = 0;
    contentFragmentCount = 0;
  }

  function addFragment(token: PreparedToken): void {
    const fragment: InlineFragment = {
      text: token.text,
      x: lineWidth,
      width: token.width,
      font: token.font,
      type: token.type,
      meta: token.meta,
    };
    const previous = currentFragments.at(-1);
    if (canMergeFragments(previous, fragment)) {
      if (previous !== undefined) {
        previous.text += fragment.text;
        previous.width += fragment.width;
      }
    } else {
      currentFragments.push(fragment);
    }
    lineWidth += token.width;
    if (!token.whitespace) {
      contentFragmentCount += 1;
    }
  }

  function pushToken(token: PreparedToken): void {
    if (token.forceBreak) {
      commitLine(true);
      seedLinePrefix();
      return;
    }

    if (token.whitespace && contentFragmentCount === 0) {
      return;
    }

    const availableWidth = lineLimit();
    if (lineWidth + token.width <= availableWidth) {
      addFragment(token);
      return;
    }

    if (token.whitespace) {
      commitLine(false);
      seedLinePrefix();
      return;
    }

    if (contentFragmentCount === 0) {
      let remainder: PreparedToken | undefined = token;
      while (remainder !== undefined) {
        const currentLimit = Math.max(1, lineLimit() - lineWidth);
        const [head, tail] = splitTokenToFit(remainder, currentLimit);
        addFragment(head);
        remainder = tail;
        if (remainder !== undefined) {
          commitLine(false);
          seedLinePrefix();
        }
      }
      return;
    }

    commitLine(false);
    seedLinePrefix();
    pushToken(token);
  }

  seedLinePrefix();

  for (const token of prepared.tokens) {
    pushToken(token);
  }

  if (currentFragments.length > 0 || lines.length === 0) {
    commitLine(lines.length === 0);
  }

  return {
    lines,
    height: lines.length * prepared.lineHeight,
    width: maxRight,
  };
}
