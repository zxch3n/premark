import type {
  RangeOptions,
  ResolvedRange,
  SelectionDirection,
  SourceRange,
  StableRangeBias,
  StableRangeKind,
} from "./types.ts";

export interface MutableStableRangeRecord {
  id: string;
  anchor: number;
  head: number;
  options: Required<RangeOptions>;
}

export interface ReplacementChange {
  readonly from: number;
  readonly to: number;
  readonly insertLength: number;
}

export function defaultRangeOptions(options: RangeOptions = {}): Required<RangeOptions> {
  return {
    bias: options.bias ?? "expand",
    kind: options.kind ?? "generic",
  };
}

export function normalizeRange(range: SourceRange): SourceRange {
  return range.from <= range.to
    ? range
    : {
        from: range.to,
        to: range.from,
      };
}

export function selectionDirection(anchor: number, head: number): SelectionDirection {
  if (anchor === head) return "collapsed";
  return anchor < head ? "forward" : "backward";
}

export function createResolvedRange(record: MutableStableRangeRecord, text: string): ResolvedRange {
  const direction = selectionDirection(record.anchor, record.head);
  const from = Math.min(record.anchor, record.head);
  const to = Math.max(record.anchor, record.head);
  return {
    id: record.id,
    anchor: record.anchor,
    head: record.head,
    from,
    to,
    direction,
    text: text.slice(from, to),
    isCollapsed: from === to,
    options: record.options,
  };
}

export function transformStableRangeRecord(
  record: MutableStableRangeRecord,
  change: ReplacementChange,
): void {
  const direction = selectionDirection(record.anchor, record.head);
  const from = Math.min(record.anchor, record.head);
  const to = Math.max(record.anchor, record.head);
  const [nextFrom, nextTo] = transformRange(from, to, change, record.options.bias);

  if (direction === "backward") {
    record.anchor = nextTo;
    record.head = nextFrom;
  } else {
    record.anchor = nextFrom;
    record.head = nextTo;
  }
}

export function rangeKind(options: Required<RangeOptions>): StableRangeKind {
  return options.kind;
}

function transformRange(
  from: number,
  to: number,
  change: ReplacementChange,
  bias: StableRangeBias,
): [number, number] {
  if (bias === "collapse-on-edit" && rangesTouch(from, to, change.from, change.to)) {
    const collapsed = change.from + change.insertLength;
    return [collapsed, collapsed];
  }

  if (from === to) {
    const affinity = bias === "stick-start" ? "before" : "after";
    const point = transformPoint(from, change, affinity);
    return [point, point];
  }

  if (bias === "stick-start") {
    return [transformPoint(from, change, "before"), transformPoint(to, change, "before")];
  }

  if (bias === "stick-end") {
    return [transformPoint(from, change, "after"), transformPoint(to, change, "after")];
  }

  return transformExpandedRange(from, to, change);
}

function transformExpandedRange(
  start: number,
  end: number,
  change: ReplacementChange,
): [number, number] {
  const oldLength = change.to - change.from;
  const delta = change.insertLength - oldLength;

  if (oldLength === 0) {
    const nextStart = change.from < start ? start + change.insertLength : start;
    const nextEnd = change.from <= end ? end + change.insertLength : end;
    return [nextStart, Math.max(nextStart, nextEnd)];
  }

  const nextStart = change.to <= start ? start + delta : change.from < start ? change.from : start;

  let nextEnd: number;
  if (change.from > end) {
    nextEnd = end;
  } else if (change.to <= end) {
    nextEnd = end + delta;
  } else if (change.from <= end) {
    nextEnd = change.from + change.insertLength;
  } else {
    nextEnd = end;
  }

  return [nextStart, Math.max(nextStart, nextEnd)];
}

function transformPoint(
  position: number,
  change: ReplacementChange,
  affinity: "before" | "after",
): number {
  const oldLength = change.to - change.from;
  const delta = change.insertLength - oldLength;

  if (oldLength === 0) {
    if (position < change.from) return position;
    if (position > change.from) return position + change.insertLength;
    return affinity === "after" ? position + change.insertLength : position;
  }

  if (position < change.from) return position;
  if (position > change.to) return position + delta;
  return affinity === "after" ? change.from + change.insertLength : change.from;
}

function rangesTouch(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  if (aFrom === aTo) return bFrom <= aFrom && aFrom <= bTo;
  if (bFrom === bTo) return aFrom <= bFrom && bFrom <= aTo;
  return aFrom < bTo && bFrom < aTo;
}
