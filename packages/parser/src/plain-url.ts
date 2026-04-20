export interface PlainUrlMatch {
  readonly from: number;
  readonly to: number;
  readonly text: string;
}

const PLAIN_URL_RE = /https?:\/\/[^\s<>\\]+/giu;
const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", "'", '"']);
const CLOSING_DELIMITERS: ReadonlyArray<readonly [closing: string, opening: string]> = [
  [")", "("],
  ["]", "["],
  ["}", "{"],
];

export function findPlainUrlMatches(text: string): PlainUrlMatch[] {
  const matches: PlainUrlMatch[] = [];
  for (const match of text.matchAll(PLAIN_URL_RE)) {
    const raw = match[0];
    const from = match.index;
    if (from === undefined || !hasPlainUrlBoundary(text, from)) {
      continue;
    }

    const to = trimPlainUrlEnd(text, from, from + raw.length);
    if (to <= from || text[to] === "\\") {
      continue;
    }

    const url = text.slice(from, to);
    if (!hasPlainUrlHost(url)) {
      continue;
    }

    matches.push({
      from,
      to,
      text: url,
    });
  }
  return matches;
}

export function findPlainUrlMatchAt(text: string, from: number): PlainUrlMatch | null {
  for (const match of findPlainUrlMatches(text)) {
    if (match.from === from) {
      return match;
    }
    if (match.from > from) {
      return null;
    }
  }
  return null;
}

function hasPlainUrlBoundary(text: string, from: number): boolean {
  if (from === 0) {
    return true;
  }
  const previous = text[from - 1] ?? "";
  return !/[A-Za-z0-9]/u.test(previous);
}

function hasPlainUrlHost(url: string): boolean {
  const withoutScheme = url.replace(/^https?:\/\//iu, "");
  return withoutScheme.length > 0 && !withoutScheme.startsWith("/");
}

function trimPlainUrlEnd(text: string, from: number, initialTo: number): number {
  let to = initialTo;
  let previousTo = -1;

  while (to !== previousTo) {
    previousTo = to;
    while (to > from && TRAILING_PUNCTUATION.has(text[to - 1] ?? "")) {
      to -= 1;
    }

    for (const [closing, opening] of CLOSING_DELIMITERS) {
      while (
        to > from &&
        text[to - 1] === closing &&
        countCharacter(text, from, to, closing) > countCharacter(text, from, to, opening)
      ) {
        to -= 1;
      }
    }
  }

  return to;
}

function countCharacter(text: string, from: number, to: number, char: string): number {
  let count = 0;
  for (let index = from; index < to; index += 1) {
    if (text[index] === char) {
      count += 1;
    }
  }
  return count;
}
