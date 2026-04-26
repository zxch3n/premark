import type { BlockSpan, MarkdownInlineSourceRecord, SourceRange } from "@pretext-md/parser";

export type RevealedMarkerType =
  | "strong"
  | "emphasis"
  | "strikethrough"
  | "code-span"
  | "link"
  | "heading"
  | "code-block"
  | "table"
  | "image";

export interface ActiveMarkdownControl {
  readonly type: RevealedMarkerType;
  readonly source: SourceRange;
  readonly kind: "inline" | "block";
}

export interface ActiveMarkerRevealSourceMapSegment {
  readonly revealedFrom: number;
  readonly revealedTo: number;
  readonly sourceFrom: number;
  readonly sourceTo: number;
}

export interface ActiveMarkerRevealEditableRun {
  readonly revealedFrom: number;
  readonly revealedTo: number;
  readonly revealedOffsets: readonly number[];
  readonly sourceOffsets: readonly number[];
  readonly kind: "source" | "control";
  readonly controlType?: RevealedMarkerType;
}

export interface ActiveMarkerRevealSourceMap {
  readonly markdown: string;
  readonly segments: readonly ActiveMarkerRevealSourceMapSegment[];
  readonly runs: readonly ActiveMarkerRevealEditableRun[];
}

export interface ActiveMarkerRevealMarkdown {
  readonly markdown: string;
  readonly activeToken: MarkdownInlineSourceRecord | null;
  readonly activeControls: readonly ActiveMarkdownControl[];
  readonly sourceMap: ActiveMarkerRevealSourceMap;
  readonly sourceTextBlockRanges: readonly SourceRange[];
  readonly markerState: "hidden" | "active";
}

export interface ActiveMarkerRevealMarkdownInput {
  readonly markdown: string;
  readonly inlineSources: readonly MarkdownInlineSourceRecord[];
  readonly blockSpans?: readonly BlockSpan[];
  readonly selectionRange: SourceRange;
}

const REVEALABLE_TYPES: ReadonlySet<MarkdownInlineSourceRecord["type"]> = new Set([
  "strong",
  "emphasis",
  "strikethrough",
  "code-span",
  "link",
]);

const ESCAPABLE_MARKDOWN_PUNCTUATION_RE = /[\\`*_[\]{}()#+\-.!<>|~]/gu;
const ESCAPABLE_MARKDOWN_PUNCTUATION = new Set([
  "\\",
  "`",
  "*",
  "_",
  "[",
  "]",
  "{",
  "}",
  "(",
  ")",
  "#",
  "+",
  "-",
  ".",
  "!",
  "<",
  ">",
  "|",
  "~",
]);
const MARKER_SEPARATOR = String.fromCharCode(0x2060);

export function createActiveMarkerRevealMarkdown(
  input: ActiveMarkerRevealMarkdownInput,
): ActiveMarkerRevealMarkdown {
  const activeSourceTextControls = findActiveSourceTextControls({
    blockSpans: input.blockSpans ?? [],
    inlineSources: input.inlineSources,
    selectionRange: input.selectionRange,
  });
  const inlineTokens = findActiveMarkerTokens(input.inlineSources, input.selectionRange).filter(
    (token) =>
      !activeSourceTextControls.some((control) => rangeContains(control.source, token.source)),
  );
  const activeBlockControls = findActiveBlockControls(
    input.markdown,
    input.blockSpans ?? [],
    input.selectionRange,
  ).filter(
    (control) =>
      !activeSourceTextControls.some((sourceControl) =>
        rangeContains(sourceControl.source, control.source),
      ),
  );
  const activeControls: ActiveMarkdownControl[] = [
    ...activeSourceTextControls.map((control) => ({
      type: control.type,
      source: control.source,
      kind: "block" as const,
    })),
    ...activeBlockControls.map((control) => ({
      type: control.type,
      source: control.source,
      kind: "block" as const,
    })),
    ...inlineTokens.map((token) => ({
      type: token.type as RevealedMarkerType,
      source: token.source,
      kind: "inline" as const,
    })),
  ];

  if (activeControls.length === 0) {
    return {
      markdown: input.markdown,
      activeToken: null,
      activeControls: [],
      sourceMap: createIdentitySourceMap(input.markdown),
      sourceTextBlockRanges: [],
      markerState: "hidden",
    };
  }

  const replacements = normalizeReplacements(
    [
      ...activeBlockControls.flatMap((control) =>
        blockControlReplacements(input.markdown, control),
      ),
      ...inlineTokens.map(inlineControlReplacement),
    ],
    input.markdown,
  );
  const applied = applyReplacements(input.markdown, replacements);
  const sourceMap = {
    markdown: applied.markdown,
    segments: applied.segments,
    runs: applied.runs,
  };

  return {
    markdown: applied.markdown,
    activeToken: inlineTokens[0] ?? null,
    activeControls,
    sourceMap,
    sourceTextBlockRanges: activeSourceTextControls
      .map((control) => mapSourceRangeToRevealedRange(sourceMap, control.source))
      .filter((range): range is SourceRange => range !== null),
    markerState: "active",
  };
}

export interface ActiveSourceTextControl {
  readonly type: Extract<RevealedMarkerType, "table" | "image">;
  readonly source: SourceRange;
}

export interface FindActiveSourceTextControlsInput {
  readonly blockSpans: readonly BlockSpan[];
  readonly inlineSources: readonly MarkdownInlineSourceRecord[];
  readonly selectionRange: SourceRange;
}

export function findActiveSourceTextControls(
  input: FindActiveSourceTextControlsInput,
): ActiveSourceTextControl[] {
  return dedupeSourceTextControls([
    ...findActiveTableSourceControls(input.blockSpans, input.selectionRange),
    ...findActiveImageSourceControls(input.blockSpans, input.inlineSources, input.selectionRange),
  ]);
}

export function findActiveMarkerToken(
  inlineSources: readonly MarkdownInlineSourceRecord[],
  selectionRange: SourceRange,
): MarkdownInlineSourceRecord | null {
  return findActiveMarkerTokens(inlineSources, selectionRange)[0] ?? null;
}

function findActiveMarkerTokens(
  inlineSources: readonly MarkdownInlineSourceRecord[],
  selectionRange: SourceRange,
): MarkdownInlineSourceRecord[] {
  const from = Math.min(selectionRange.from, selectionRange.to);
  const to = Math.max(selectionRange.from, selectionRange.to);
  return inlineSources
    .filter(
      (record) =>
        hasRevealableMarkdownControls(record) &&
        shouldRevealInlineControlRange(record.source, { from, to }),
    )
    .sort(
      (left, right) => left.source.to - left.source.from - (right.source.to - right.source.from),
    );
}

function hasRevealableMarkdownControls(record: MarkdownInlineSourceRecord): boolean {
  if (!REVEALABLE_TYPES.has(record.type)) {
    return false;
  }
  if (record.type !== "link") {
    return true;
  }
  return record.sourceText.startsWith("[") || record.sourceText.startsWith("<");
}

interface ActiveBlockControl {
  readonly type: Extract<RevealedMarkerType, "heading" | "code-block">;
  readonly source: SourceRange;
}

function findActiveBlockControls(
  markdown: string,
  blockSpans: readonly BlockSpan[],
  selectionRange: SourceRange,
): ActiveBlockControl[] {
  const from = Math.min(selectionRange.from, selectionRange.to);
  const to = Math.max(selectionRange.from, selectionRange.to);
  return blockSpans.flatMap((span): ActiveBlockControl[] => {
    if (span.type !== "heading" && span.type !== "code-block") {
      return [];
    }
    if (!shouldRevealBlockControlRange(span, { from, to })) {
      return [];
    }
    if (span.type === "heading" && headingMarkerRange(markdown, span) === null) {
      return [];
    }
    return [
      {
        type: span.type,
        source: {
          from: span.from,
          to: span.to,
        },
      },
    ];
  });
}

function findActiveTableSourceControls(
  blockSpans: readonly BlockSpan[],
  selectionRange: SourceRange,
): ActiveSourceTextControl[] {
  const from = Math.min(selectionRange.from, selectionRange.to);
  const to = Math.max(selectionRange.from, selectionRange.to);
  return blockSpans.flatMap((span): ActiveSourceTextControl[] => {
    if (span.type !== "table" || !shouldActivateSourceTextBlockRange(span, { from, to })) {
      return [];
    }
    return [
      {
        type: "table",
        source: {
          from: span.from,
          to: span.to,
        },
      },
    ];
  });
}

function findActiveImageSourceControls(
  blockSpans: readonly BlockSpan[],
  inlineSources: readonly MarkdownInlineSourceRecord[],
  selectionRange: SourceRange,
): ActiveSourceTextControl[] {
  const from = Math.min(selectionRange.from, selectionRange.to);
  const to = Math.max(selectionRange.from, selectionRange.to);
  return inlineSources.flatMap((record): ActiveSourceTextControl[] => {
    if (record.type !== "image" || !record.sourceText.startsWith("![")) {
      return [];
    }
    const span = findInlineBlockSpan(blockSpans, record);
    if (span === null || span.type === "table") {
      return [];
    }
    if (!shouldActivateSourceTextBlockRange(span, { from, to })) {
      return [];
    }
    return [
      {
        type: "image",
        source: {
          from: span.from,
          to: span.to,
        },
      },
    ];
  });
}

function findInlineBlockSpan(
  blockSpans: readonly BlockSpan[],
  record: MarkdownInlineSourceRecord,
): BlockSpan | null {
  return (
    blockSpans.find((span) => span.id === record.blockId) ??
    blockSpans.find((span) => record.source.from >= span.from && record.source.to <= span.to) ??
    null
  );
}

function dedupeSourceTextControls(
  controls: readonly ActiveSourceTextControl[],
): ActiveSourceTextControl[] {
  const seen = new Set<string>();
  return [...controls]
    .sort((left, right) => left.source.from - right.source.from || left.source.to - right.source.to)
    .filter((control) => {
      const key = `${control.source.from}:${control.source.to}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function shouldRevealInlineControlRange(control: SourceRange, selection: SourceRange): boolean {
  if (selection.from === selection.to) {
    return selection.from >= control.from && selection.from <= control.to;
  }

  if (selection.from <= control.from && selection.to >= control.to) {
    return false;
  }

  return selection.to > control.from && selection.from < control.to;
}

function shouldRevealBlockControlRange(control: SourceRange, selection: SourceRange): boolean {
  if (selection.from === selection.to) {
    return selection.from >= control.from && selection.from < control.to;
  }

  if (selection.from <= control.from && selection.to >= control.to) {
    return false;
  }

  return selection.to > control.from && selection.from < control.to;
}

function shouldActivateSourceTextBlockRange(control: SourceRange, selection: SourceRange): boolean {
  if (selection.from === selection.to) {
    return selection.from >= control.from && selection.from <= control.to;
  }

  return selection.to > control.from && selection.from < control.to;
}

function rangeContains(outer: SourceRange, inner: SourceRange): boolean {
  return inner.from >= outer.from && inner.to <= outer.to;
}

interface Replacement {
  readonly from: number;
  readonly to: number;
  readonly text: string;
  readonly segments?: readonly ReplacementSourceMapSegment[];
}

interface ReplacementSourceMapSegment {
  readonly from: number;
  readonly to: number;
  readonly sourceFrom: number;
  readonly sourceTo: number;
  readonly kind?: "source" | "control";
  readonly controlType?: RevealedMarkerType;
}

function blockControlReplacements(markdown: string, control: ActiveBlockControl): Replacement[] {
  if (control.type === "heading") {
    const markerRange = headingMarkerRange(markdown, control.source);
    if (markerRange === null) return [];
    const markerText = markdown.slice(markerRange.from, markerRange.to);
    const escapedMarker = escapeMarkdownAsVisibleText(markerText);
    return [
      {
        from: markerRange.from,
        to: markerRange.to,
        text: `${markerText} ${escapedMarker}`,
        segments: [
          {
            from: 0,
            to: markerText.length,
            sourceFrom: markerRange.from,
            sourceTo: markerRange.to,
            kind: "source",
          },
          ...escapedVisibleTextSourceMapSegments(
            markerText,
            markerRange.from,
            markerText.length + 1,
            "heading",
          ),
        ],
      },
    ];
  }

  const sourceText = markdown.slice(control.source.from, control.source.to);
  const fence = "`".repeat(longestBacktickRun(sourceText) + 1);
  return [
    {
      from: control.source.from,
      to: control.source.to,
      text: sourceText.endsWith("\n")
        ? `${fence}\n${sourceText}${fence}`
        : `${fence}\n${sourceText}\n${fence}`,
      segments: [
        {
          from: fence.length + 1,
          to: fence.length + 1 + sourceText.length,
          sourceFrom: control.source.from,
          sourceTo: control.source.to,
          kind: "source",
        },
      ],
    },
  ];
}

function inlineControlReplacement(token: MarkdownInlineSourceRecord): Replacement {
  const text = inlineControlMarkdown(token);
  return {
    from: token.source.from,
    to: token.source.to,
    text,
    segments: inlineControlSourceMap(token, text),
  };
}

function inlineControlMarkdown(token: MarkdownInlineSourceRecord): string {
  switch (token.type) {
    case "strong":
    case "emphasis":
    case "strikethrough": {
      const markers = wrappingInlineMarkers(token.sourceText, token.type);
      if (markers === null) {
        return escapeMarkdownAsVisibleText(token.sourceText);
      }
      return (
        escapeMarkdownAsVisibleText(markers.open) +
        token.sourceText +
        escapeMarkdownAsVisibleText(markers.close)
      );
    }
    case "code-span": {
      const markers = codeSpanMarkers(token.sourceText);
      if (markers === null) {
        return escapeMarkdownAsVisibleText(token.sourceText);
      }
      return (
        escapeMarkdownAsVisibleText(markers.open) +
        MARKER_SEPARATOR +
        token.sourceText +
        MARKER_SEPARATOR +
        escapeMarkdownAsVisibleText(markers.close)
      );
    }
    case "link":
      return linkControlMarkdown(token.sourceText);
    default:
      return escapeMarkdownAsVisibleText(token.sourceText);
  }
}

function inlineControlSourceMap(
  token: MarkdownInlineSourceRecord,
  text: string,
): ReplacementSourceMapSegment[] {
  switch (token.type) {
    case "strong":
    case "emphasis":
    case "strikethrough": {
      const markers = wrappingInlineMarkers(token.sourceText, token.type);
      if (markers === null) break;
      const escapedOpen = escapeMarkdownAsVisibleText(markers.open);
      const escapedClose = escapeMarkdownAsVisibleText(markers.close);
      return [
        ...escapedVisibleTextSourceMapSegments(markers.open, token.source.from, 0, token.type),
        {
          from: escapedOpen.length,
          to: escapedOpen.length + token.sourceText.length,
          sourceFrom: token.source.from,
          sourceTo: token.source.to,
          kind: "source",
        },
        ...escapedVisibleTextSourceMapSegments(
          markers.close,
          token.source.to - markers.close.length,
          text.length - escapedClose.length,
          token.type,
        ),
      ];
    }
    case "code-span": {
      const markers = codeSpanMarkers(token.sourceText);
      if (markers === null) break;
      const escapedOpen = escapeMarkdownAsVisibleText(markers.open);
      const escapedClose = escapeMarkdownAsVisibleText(markers.close);
      const sourceTextFrom = escapedOpen.length + MARKER_SEPARATOR.length;
      return [
        ...escapedVisibleTextSourceMapSegments(markers.open, token.source.from, 0, token.type),
        {
          from: sourceTextFrom,
          to: sourceTextFrom + token.sourceText.length,
          sourceFrom: token.source.from,
          sourceTo: token.source.to,
          kind: "source",
        },
        ...escapedVisibleTextSourceMapSegments(
          markers.close,
          token.source.to - markers.close.length,
          text.length - escapedClose.length,
          token.type,
        ),
      ];
    }
    case "link": {
      if (token.sourceText.startsWith("[")) {
        const closingBracket = token.sourceText.indexOf("]");
        const suffix = token.sourceText.slice(closingBracket);
        const escapedOpen = "\\[";
        const escapedSuffix = escapeMarkdownAsVisibleText(suffix);
        return [
          ...escapedVisibleTextSourceMapSegments("[", token.source.from, 0, token.type),
          {
            from: escapedOpen.length,
            to: escapedOpen.length + token.sourceText.length,
            sourceFrom: token.source.from,
            sourceTo: token.source.to,
            kind: "source",
          },
          ...escapedVisibleTextSourceMapSegments(
            suffix,
            token.source.from + closingBracket,
            text.length - escapedSuffix.length,
            token.type,
          ),
        ];
      }
      break;
    }
  }

  return [
    {
      from: 0,
      to: text.length,
      sourceFrom: token.source.from,
      sourceTo: token.source.to,
      kind: "source",
    },
  ];
}

function escapedVisibleTextSourceMapSegments(
  sourceText: string,
  sourceFrom: number,
  replacementFrom: number,
  controlType?: RevealedMarkerType,
): ReplacementSourceMapSegment[] {
  const segments: ReplacementSourceMapSegment[] = [];
  let replacementCursor = replacementFrom;
  for (let index = 0; index < sourceText.length; index += 1) {
    const char = sourceText[index]!;
    const replacementLength = ESCAPABLE_MARKDOWN_PUNCTUATION.has(char) ? 2 : 1;
    segments.push({
      from: replacementCursor,
      to: replacementCursor + replacementLength,
      sourceFrom: sourceFrom + index,
      sourceTo: sourceFrom + index + 1,
      kind: controlType === undefined ? "source" : "control",
      controlType,
    });
    replacementCursor += replacementLength;
  }
  return segments;
}

function wrappingInlineMarkers(
  sourceText: string,
  type: "strong" | "emphasis" | "strikethrough",
): { open: string; close: string } | null {
  const candidates = type === "strong" ? ["**", "__"] : type === "emphasis" ? ["*", "_"] : ["~~"];
  for (const marker of candidates) {
    if (sourceText.startsWith(marker) && sourceText.endsWith(marker)) {
      return {
        open: marker,
        close: marker,
      };
    }
  }
  return null;
}

function codeSpanMarkers(sourceText: string): { open: string; close: string } | null {
  const open = /^`+/u.exec(sourceText)?.[0];
  const close = /`+$/u.exec(sourceText)?.[0];
  if (open === undefined || close === undefined || sourceText.length <= open.length) {
    return null;
  }
  return { open, close };
}

function linkControlMarkdown(sourceText: string): string {
  if (sourceText.startsWith("<") && sourceText.endsWith(">")) {
    return `\\<${sourceText}\\>`;
  }

  if (!sourceText.startsWith("[")) {
    return escapeMarkdownAsVisibleText(sourceText);
  }

  const closingBracket = sourceText.indexOf("]");
  if (closingBracket < 0) {
    return escapeMarkdownAsVisibleText(sourceText);
  }

  const suffix = sourceText.slice(closingBracket);
  return `\\[${sourceText}${escapeMarkdownAsVisibleText(suffix)}`;
}

function headingMarkerRange(markdown: string, range: SourceRange): SourceRange | null {
  const sourceText = markdown.slice(range.from, range.to);
  const match = /^(#{1,6})(?=[\t ]|$)/u.exec(sourceText);
  if (match === null) return null;
  return {
    from: range.from,
    to: range.from + match[1]!.length,
  };
}

function longestBacktickRun(text: string): number {
  let longest = 3;
  for (const match of text.matchAll(/`+/gu)) {
    longest = Math.max(longest, match[0].length);
  }
  return longest;
}

function normalizeReplacements(
  replacements: readonly Replacement[],
  markdown: string,
): Replacement[] {
  const ordered = [...replacements].sort((left, right) =>
    left.from === right.from ? right.to - left.to : left.from - right.from,
  );
  const normalized: Replacement[] = [];
  for (const replacement of ordered) {
    const previous = normalized.at(-1);
    if (previous === undefined || replacement.from >= previous.to) {
      normalized.push(replacement);
      continue;
    }

    const merged = {
      from: Math.min(previous.from, replacement.from),
      to: Math.max(previous.to, replacement.to),
    };
    normalized[normalized.length - 1] = {
      ...merged,
      text: escapeMarkdownAsVisibleText(markdown.slice(merged.from, merged.to)),
      segments: [
        ...escapedVisibleTextSourceMapSegments(
          markdown.slice(merged.from, merged.to),
          merged.from,
          0,
        ),
      ],
    };
  }
  return normalized;
}

function applyReplacements(
  markdown: string,
  replacements: readonly Replacement[],
): {
  markdown: string;
  segments: ActiveMarkerRevealSourceMapSegment[];
  runs: ActiveMarkerRevealEditableRun[];
} {
  let result = "";
  const segments: ActiveMarkerRevealSourceMapSegment[] = [];
  const runs: ActiveMarkerRevealEditableRun[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    if (cursor < replacement.from) {
      const unchanged = markdown.slice(cursor, replacement.from);
      segments.push({
        revealedFrom: result.length,
        revealedTo: result.length + unchanged.length,
        sourceFrom: cursor,
        sourceTo: replacement.from,
      });
      runs.push(createLinearEditableRun(result.length, cursor, unchanged.length, "source"));
      result += unchanged;
    }

    const replacementStart = result.length;
    for (const segment of replacement.segments ?? []) {
      if (segment.sourceFrom === segment.sourceTo) continue;
      const revealedFrom = replacementStart + segment.from;
      const revealedTo = replacementStart + segment.to;
      segments.push({
        revealedFrom,
        revealedTo,
        sourceFrom: segment.sourceFrom,
        sourceTo: segment.sourceTo,
      });
      runs.push(
        createEditableRunFromSegment(
          revealedFrom,
          revealedTo,
          segment.sourceFrom,
          segment.sourceTo,
          segment.kind ?? "source",
          segment.controlType,
        ),
      );
    }
    result += replacement.text;
    cursor = replacement.to;
  }
  if (cursor < markdown.length) {
    const unchanged = markdown.slice(cursor);
    segments.push({
      revealedFrom: result.length,
      revealedTo: result.length + unchanged.length,
      sourceFrom: cursor,
      sourceTo: markdown.length,
    });
    runs.push(createLinearEditableRun(result.length, cursor, unchanged.length, "source"));
    result += unchanged;
  }

  return {
    markdown: result,
    segments,
    runs,
  };
}

function createEditableRunFromSegment(
  revealedFrom: number,
  revealedTo: number,
  sourceFrom: number,
  sourceTo: number,
  kind: "source" | "control",
  controlType?: RevealedMarkerType,
): ActiveMarkerRevealEditableRun {
  const revealedLength = revealedTo - revealedFrom;
  const sourceLength = sourceTo - sourceFrom;
  const canUseLinearOffsets = revealedLength === sourceLength;
  return {
    revealedFrom,
    revealedTo,
    revealedOffsets: canUseLinearOffsets
      ? createLinearOffsets(revealedFrom, revealedLength)
      : [revealedFrom, revealedTo],
    sourceOffsets: canUseLinearOffsets
      ? createLinearOffsets(sourceFrom, sourceLength)
      : [sourceFrom, sourceTo],
    kind,
    controlType,
  };
}

function createLinearEditableRun(
  revealedFrom: number,
  sourceFrom: number,
  length: number,
  kind: "source" | "control",
  controlType?: RevealedMarkerType,
): ActiveMarkerRevealEditableRun {
  return {
    revealedFrom,
    revealedTo: revealedFrom + length,
    revealedOffsets: createLinearOffsets(revealedFrom, length),
    sourceOffsets: createLinearOffsets(sourceFrom, length),
    kind,
    controlType,
  };
}

function createLinearOffsets(from: number, length: number): number[] {
  return Array.from({ length: length + 1 }, (_, index) => from + index);
}

function escapeMarkdownAsVisibleText(text: string): string {
  return text.replace(ESCAPABLE_MARKDOWN_PUNCTUATION_RE, "\\$&");
}

function mapSourceRangeToRevealedRange(
  sourceMap: ActiveMarkerRevealSourceMap,
  range: SourceRange,
): SourceRange | null {
  const from = mapSourceOffsetToRevealedOffset(sourceMap, range.from, "start");
  const to = mapSourceOffsetToRevealedOffset(sourceMap, range.to, "end");
  if (from === null || to === null || to < from) {
    return null;
  }
  return { from, to };
}

function mapSourceOffsetToRevealedOffset(
  sourceMap: ActiveMarkerRevealSourceMap,
  offset: number,
  bias: "start" | "end",
): number | null {
  for (const segment of sourceMap.segments) {
    const contains =
      bias === "start"
        ? offset >= segment.sourceFrom && offset < segment.sourceTo
        : offset > segment.sourceFrom && offset <= segment.sourceTo;
    if (!contains && offset !== segment.sourceFrom && offset !== segment.sourceTo) {
      continue;
    }
    if (segment.sourceTo === segment.sourceFrom) {
      return bias === "start" ? segment.revealedFrom : segment.revealedTo;
    }
    const ratio = (offset - segment.sourceFrom) / (segment.sourceTo - segment.sourceFrom);
    return Math.round(segment.revealedFrom + ratio * (segment.revealedTo - segment.revealedFrom));
  }
  return null;
}

function createIdentitySourceMap(markdown: string): ActiveMarkerRevealSourceMap {
  return {
    markdown,
    segments:
      markdown.length === 0
        ? []
        : [
            {
              revealedFrom: 0,
              revealedTo: markdown.length,
              sourceFrom: 0,
              sourceTo: markdown.length,
            },
          ],
    runs: markdown.length === 0 ? [] : [createLinearEditableRun(0, 0, markdown.length, "source")],
  };
}
