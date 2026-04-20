const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00A0",
  quot: '"',
};

export function decodeMarkdownEntity(entity: string): string {
  const hex = /^&#x([0-9a-f]+);$/iu.exec(entity);
  if (hex !== null) {
    return codePointToString(Number.parseInt(hex[1]!, 16), entity);
  }

  const decimal = /^&#([0-9]+);$/u.exec(entity);
  if (decimal !== null) {
    return codePointToString(Number.parseInt(decimal[1]!, 10), entity);
  }

  const named = /^&([a-z][a-z0-9]+);$/iu.exec(entity);
  if (named !== null) {
    return NAMED_ENTITIES[named[1]!.toLowerCase()] ?? entity;
  }

  return entity;
}

function codePointToString(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
    return fallback;
  }
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}
