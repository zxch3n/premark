import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

export interface PremarkLivePreviewOptions {
  previewAll?: boolean;
  onChange?: (doc: string, update: ViewUpdate) => void;
}

interface DecorationEntry {
  from: number;
  to: number;
  decoration: Decoration;
}

const headingPattern = /^(#{1,6})[ \t]+/u;
const unorderedListPattern = /^([ \t]*)([-+*])[ \t]+/u;
const orderedListPattern = /^([ \t]*)(\d+[.)])[ \t]+/u;
const blockquotePattern = /^([ \t]*>[ \t]?)+/u;
const fencedCodePattern = /^[ \t]*(```|~~~)/u;
const tableLikePattern = /^\s*\|/u;
const blankBlockquotePattern = /^\s*(?:>[ \t]*)+$/u;
const blankLinePattern = /^\s*$/u;

export function createCodeMirrorOverlay(
  parent: HTMLElement,
  doc: string,
  options: PremarkLivePreviewOptions = {},
): EditorView {
  const editorDoc = options.previewAll === true ? normalizePreviewDocument(doc) : doc;
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: editorDoc,
      extensions: [
        history(),
        keymap.of([
          { key: "Mod-y", run: redo },
          { key: "Mod-Shift-z", run: redo },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        markdown(),
        EditorView.lineWrapping,
        premarkCodeMirrorTheme,
        premarkLivePreview(options),
        options.onChange === undefined
          ? []
          : EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                options.onChange?.(update.state.doc.toString(), update);
              }
            }),
      ],
    }),
  });
}

export function premarkLivePreview(options: PremarkLivePreviewOptions = {}): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, options);
      }

      update(update: ViewUpdate): void {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          update.geometryChanged
        ) {
          this.decorations = buildDecorations(update.view, options);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}

function normalizePreviewDocument(doc: string): string {
  const output: string[] = [];
  const lines = doc.split("\n");
  let index = 0;
  let inFence = false;

  while (index < lines.length) {
    const line = lines[index]!;

    if (fencedCodePattern.exec(line) !== null) {
      output.push(line);
      inFence = !inFence;
      index += 1;
      continue;
    }

    if (inFence) {
      output.push(line);
      index += 1;
      continue;
    }

    if (blankBlockquotePattern.test(line)) {
      index += 1;
      continue;
    }

    const blockquote = readPlainBlockquoteLine(line);
    if (blockquote !== null) {
      const quoteLines = [blockquote.content];
      index += 1;
      while (index < lines.length) {
        const next = readPlainBlockquoteLine(lines[index]!);
        if (next === null || next.depth !== blockquote.depth) {
          break;
        }
        quoteLines.push(next.content);
        index += 1;
      }
      output.push(`${"> ".repeat(blockquote.depth)}${quoteLines.join(" ").replace(/\s+/gu, " ")}`);
      continue;
    }

    if (!isPlainParagraphLine(line)) {
      output.push(line);
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && isPlainParagraphLine(lines[index]!)) {
      paragraphLines.push(lines[index]!);
      index += 1;
    }
    output.push(
      paragraphLines
        .map((entry) => entry.replace(/\\$/u, ""))
        .join(" ")
        .replace(/\s+/gu, " "),
    );
  }

  return output.join("\n");
}

function isPlainParagraphLine(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 &&
    headingPattern.exec(text) === null &&
    unorderedListPattern.exec(text) === null &&
    orderedListPattern.exec(text) === null &&
    blockquotePattern.exec(text) === null &&
    fencedCodePattern.exec(text) === null &&
    tableLikePattern.exec(text) === null
  );
}

function readPlainBlockquoteLine(line: string): { depth: number; content: string } | null {
  const match = /^([ \t]*(?:>[ \t]?)+)(.*)$/u.exec(line);
  if (match === null) {
    return null;
  }

  const depth = match[1].split(">").length - 1;
  const content = match[2].trim();
  if (content.length === 0 || !isPlainParagraphLine(content)) {
    return null;
  }

  return {
    depth,
    content,
  };
}

function buildDecorations(view: EditorView, options: PremarkLivePreviewOptions): DecorationSet {
  const entries: DecorationEntry[] = [];
  const activeLine = view.state.doc.lineAt(view.state.selection.main.head).number;
  let inFence = false;
  let pendingFirstCodeLine = false;
  let previousCodeLineFrom: number | undefined;
  let previousLineWasBlank = false;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const text = line.text;
    const previewLine = options.previewAll === true || lineNumber !== activeLine;
    const fenceMatch = fencedCodePattern.exec(text);

    if (fenceMatch !== null) {
      entries.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ class: "pm-cm-code-line pm-cm-code-fence-line" }),
      });
      if (previewLine) {
        entries.push({
          from: line.from,
          to: line.to,
          decoration: Decoration.replace({}),
        });
      }
      if (inFence && previousCodeLineFrom !== undefined) {
        entries.push({
          from: previousCodeLineFrom,
          to: previousCodeLineFrom,
          decoration: Decoration.line({ class: "pm-cm-code-last-line" }),
        });
      }
      inFence = !inFence;
      pendingFirstCodeLine = inFence;
      previousCodeLineFrom = undefined;
      continue;
    }

    if (inFence) {
      entries.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({
          class: pendingFirstCodeLine ? "pm-cm-code-line pm-cm-code-first-line" : "pm-cm-code-line",
        }),
      });
      pendingFirstCodeLine = false;
      previousCodeLineFrom = line.from;
      continue;
    }

    if (blankLinePattern.test(text)) {
      entries.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ class: "pm-cm-blank-line" }),
      });
      previousLineWasBlank = true;
      continue;
    }

    if (previousLineWasBlank) {
      entries.push({
        from: line.from,
        to: line.from,
        decoration: Decoration.line({ class: "pm-cm-after-blank" }),
      });
      previousLineWasBlank = false;
    }

    decorateBlockLine(entries, line.from, text, previewLine);
    if (previewLine) {
      decorateInline(entries, line.from, text);
    }
  }

  return buildDecorationSet(entries);
}

function decorateBlockLine(
  entries: DecorationEntry[],
  lineFrom: number,
  text: string,
  previewLine: boolean,
): void {
  const heading = headingPattern.exec(text);
  if (heading !== null) {
    const level = heading[1].length;
    entries.push({
      from: lineFrom,
      to: lineFrom,
      decoration: Decoration.line({ class: `pm-cm-heading pm-cm-heading-${level}` }),
    });
    if (previewLine) {
      entries.push({
        from: lineFrom,
        to: lineFrom + heading[0].length,
        decoration: Decoration.replace({}),
      });
    }
    return;
  }

  const blockquote = blockquotePattern.exec(text);
  if (blockquote !== null) {
    const depth = blockquote[0].split(">").length - 1;
    entries.push({
      from: lineFrom,
      to: lineFrom,
      decoration: Decoration.line({
        attributes: {
          class: "pm-cm-blockquote",
          style: `--pm-cm-quote-depth:${depth}`,
        },
      }),
    });
    if (previewLine) {
      entries.push({
        from: lineFrom,
        to: lineFrom + blockquote[0].length,
        decoration: Decoration.replace({}),
      });
    }
    return;
  }

  const unordered = unorderedListPattern.exec(text);
  const ordered = orderedListPattern.exec(text);
  const list = unordered ?? ordered;
  if (list !== null) {
    const leading = list[1] ?? "";
    const marker = list[2] ?? "";
    const depth = Math.max(1, Math.floor(leading.replaceAll("\t", "  ").length / 2) + 1);
    entries.push({
      from: lineFrom,
      to: lineFrom,
      decoration: Decoration.line({
        attributes: {
          class: "pm-cm-list-line",
          style: `--pm-cm-list-depth:${depth}`,
        },
      }),
    });
    if (previewLine) {
      entries.push({
        from: lineFrom,
        to: lineFrom + list[0].length,
        decoration: Decoration.replace({
          widget: new ListMarkerWidget(marker),
        }),
      });
    }
  }
}

class ListMarkerWidget extends WidgetType {
  constructor(private readonly marker: string) {
    super();
  }

  eq(other: ListMarkerWidget): boolean {
    return other.marker === this.marker;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "pm-cm-list-marker";
    element.textContent = this.marker;
    return element;
  }
}

function decorateInline(entries: DecorationEntry[], lineFrom: number, text: string): void {
  decorateRegex(entries, lineFrom, text, /`([^`\n]+)`/gu, "pm-cm-inline-code", [
    [0, 1],
    [-1, 0],
  ]);
  decorateRegex(entries, lineFrom, text, /\*\*\*([^*\n]+)\*\*\*/gu, "pm-cm-strong-emphasis", [
    [0, 3],
    [-3, 0],
  ]);
  decorateRegex(entries, lineFrom, text, /\*\*([^*\n]+)\*\*/gu, "pm-cm-strong", [
    [0, 2],
    [-2, 0],
  ]);
  decorateRegex(entries, lineFrom, text, /(^|[^*])\*([^*\n]+)\*(?!\*)/gu, "pm-cm-emphasis", [
    [1, 2],
    [-1, 0],
  ]);
  decorateRegex(entries, lineFrom, text, /_([^_\n]+)_/gu, "pm-cm-emphasis", [
    [0, 1],
    [-1, 0],
  ]);
  decorateRegex(entries, lineFrom, text, /~~([^~\n]+)~~/gu, "pm-cm-strikethrough", [
    [0, 2],
    [-2, 0],
  ]);
  decorateLinks(entries, lineFrom, text);
}

function decorateRegex(
  entries: DecorationEntry[],
  lineFrom: number,
  text: string,
  pattern: RegExp,
  className: string,
  hiddenRanges: Array<[number, number]>,
): void {
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) {
      continue;
    }

    const matchFrom = lineFrom + match.index;
    const matchTo = matchFrom + match[0].length;
    for (const [startOffset, endOffset] of hiddenRanges) {
      const from = startOffset < 0 ? matchTo + startOffset : matchFrom + startOffset;
      const to = endOffset <= 0 ? matchTo + endOffset : matchFrom + endOffset;
      if (from < to) {
        entries.push({
          from,
          to,
          decoration: Decoration.replace({}),
        });
      }
    }

    const firstHiddenEnd = hiddenRanges[0]?.[1] ?? 0;
    const lastHiddenStart = hiddenRanges.at(-1)?.[0] ?? 0;
    entries.push({
      from: matchFrom + firstHiddenEnd,
      to: lastHiddenStart < 0 ? matchTo + lastHiddenStart : matchTo,
      decoration: Decoration.mark({ class: className }),
    });
  }
}

function decorateLinks(entries: DecorationEntry[], lineFrom: number, text: string): void {
  const pattern = /\[([^\]\n]+)\]\(([^)\n]+)\)/gu;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) {
      continue;
    }

    const matchFrom = lineFrom + match.index;
    const labelLength = match[1].length;
    const labelFrom = matchFrom + 1;
    const labelTo = labelFrom + labelLength;
    const matchTo = matchFrom + match[0].length;
    entries.push({
      from: matchFrom,
      to: labelFrom,
      decoration: Decoration.replace({}),
    });
    entries.push({
      from: labelTo,
      to: matchTo,
      decoration: Decoration.replace({}),
    });
    entries.push({
      from: labelFrom,
      to: labelTo,
      decoration: Decoration.mark({ class: "pm-cm-link" }),
    });
  }
}

function buildDecorationSet(entries: DecorationEntry[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  entries
    .filter((entry) => entry.from <= entry.to)
    .sort((left, right) => left.from - right.from || left.to - right.to)
    .forEach((entry) => {
      builder.add(entry.from, entry.to, entry.decoration);
    });
  return builder.finish();
}

export const premarkCodeMirrorTheme = EditorView.theme({
  "&": {
    color: "#24292f",
    backgroundColor: "transparent",
    fontFamily: '"Segoe UI", Helvetica, Arial, sans-serif',
    fontSize: "16px",
    lineHeight: "25.6px",
  },
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "inherit",
    lineHeight: "25.6px",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "#0969da",
    fontFamily: "inherit",
  },
  ".cm-line": {
    padding: "8px 0",
    lineHeight: "25.6px",
  },
  ".pm-cm-blank-line": {
    display: "none",
  },
  ".pm-cm-after-blank": {
    paddingTop: "0",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(9, 105, 218, 0.18)",
  },
  ".pm-cm-heading": {
    paddingTop: "24px",
    paddingBottom: "12px",
    fontWeight: "750",
  },
  ".pm-cm-after-blank.pm-cm-heading": {
    paddingTop: "12px",
  },
  ".pm-cm-heading-1": {
    fontSize: "34px",
    lineHeight: "40.12px",
  },
  ".pm-cm-heading-2": {
    fontSize: "28px",
    lineHeight: "33.6px",
  },
  ".pm-cm-heading-3": {
    fontSize: "24px",
    lineHeight: "29.28px",
  },
  ".pm-cm-heading-4": {
    fontSize: "20px",
    lineHeight: "25px",
  },
  ".pm-cm-heading-5": {
    fontSize: "18px",
    lineHeight: "23.4px",
  },
  ".pm-cm-heading-6": {
    fontSize: "16px",
    lineHeight: "21.6px",
  },
  ".pm-cm-strong": {
    fontWeight: "700",
  },
  ".pm-cm-emphasis": {
    fontStyle: "italic",
  },
  ".pm-cm-strong-emphasis": {
    fontWeight: "700",
    fontStyle: "italic",
  },
  ".pm-cm-strikethrough": {
    textDecoration: "line-through",
  },
  ".pm-cm-inline-code": {
    padding: "0 6px",
    borderRadius: "6px",
    backgroundColor: "rgba(125, 125, 140, 0.14)",
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: "14px",
    fontWeight: "500",
  },
  ".pm-cm-link": {
    color: "inherit",
    textDecoration: "underline",
    textDecorationColor: "rgba(11, 98, 255, 0.35)",
  },
  ".pm-cm-list-line": {
    paddingLeft: "calc(var(--pm-cm-list-depth) * 28px)",
    paddingBottom: "0",
  },
  ".pm-cm-list-marker": {
    display: "inline-block",
    marginRight: "10px",
    fontWeight: "700",
  },
  ".pm-cm-blockquote": {
    marginLeft: "0",
    paddingLeft: "calc(var(--pm-cm-quote-depth) * 21px - 3px)",
    paddingBottom: "0",
    borderLeft: "3px solid rgba(125, 125, 140, 0.35)",
  },
  ".pm-cm-code-line": {
    paddingTop: "0",
    paddingBottom: "0",
    paddingLeft: "16px",
    paddingRight: "16px",
    backgroundColor: "rgba(28, 34, 42, 0.94)",
    color: "#e8ecf3",
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: "14px",
    lineHeight: "19.6px",
  },
  ".pm-cm-code-fence-line": {
    display: "none",
  },
  ".pm-cm-code-first-line": {
    marginTop: "12px",
    paddingTop: "12px",
  },
  ".pm-cm-code-last-line": {
    paddingBottom: "12px",
  },
});
