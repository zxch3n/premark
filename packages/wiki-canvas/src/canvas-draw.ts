import type {
  BlockLayout,
  CodeBlockContent,
  DocumentLayout,
  InlineFragment,
  OpaqueLine,
  TableCell,
  TableContent,
  TextLine,
} from "@pretext-md/layout";

export interface TilePalette {
  background: string;
  backgroundEnd: string;
  card: string;
  cardStroke: string;
  text: string;
  muted: string;
  accent: string;
  inlineCode: string;
  inlineCodeText: string;
  quoteBar: string;
  rule: string;
  tableBg: string;
  tableHeaderBg: string;
  tableStroke: string;
  codeBg: string;
  codeStroke: string;
  codeText: string;
  title: string;
  titleBg: string;
}

export const darkTilePalette: TilePalette = {
  background: "#0f1320",
  backgroundEnd: "#161d2e",
  card: "#161d2e",
  cardStroke: "rgba(129,140,248,.18)",
  text: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#93c5fd",
  inlineCode: "rgba(129,140,248,.15)",
  inlineCodeText: "#a5b4fc",
  quoteBar: "rgba(129,140,248,.55)",
  rule: "rgba(148,163,184,.25)",
  tableBg: "rgba(16,22,34,0.7)",
  tableHeaderBg: "rgba(129,140,248,.1)",
  tableStroke: "rgba(148,163,184,.18)",
  codeBg: "#0b1020",
  codeStroke: "rgba(129,140,248,.2)",
  codeText: "#e2e8f0",
  title: "#e2e8f0",
  titleBg: "rgba(129,140,248,.12)",
};

export interface TileDrawOptions {
  title?: string;
  palette?: TilePalette;
  contentPadding?: number;
  cardRadius?: number;
  titleBarHeight?: number;
}

const DEFAULTS = {
  contentPadding: 28,
  cardRadius: 20,
  titleBarHeight: 44,
} as const;

export function drawTile(
  ctx: CanvasRenderingContext2D,
  layout: DocumentLayout,
  width: number,
  height: number,
  options: TileDrawOptions = {},
): void {
  const palette = options.palette ?? darkTilePalette;
  const contentPadding = options.contentPadding ?? DEFAULTS.contentPadding;
  const cardRadius = options.cardRadius ?? DEFAULTS.cardRadius;
  const titleBarHeight = options.title ? (options.titleBarHeight ?? DEFAULTS.titleBarHeight) : 0;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, palette.background);
  bg.addColorStop(1, palette.backgroundEnd);

  roundedRect(ctx, 0.5, 0.5, width - 1, height - 1, cardRadius);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = palette.cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (titleBarHeight > 0 && options.title) {
    ctx.save();
    roundedRect(ctx, 0.5, 0.5, width - 1, titleBarHeight, cardRadius);
    ctx.clip();
    ctx.fillStyle = palette.titleBg;
    ctx.fillRect(0, 0, width, titleBarHeight);
    ctx.restore();

    const dotsY = titleBarHeight / 2;
    const dotColors = [palette.accent, palette.quoteBar, palette.muted];
    dotColors.forEach((color, index) => {
      ctx.beginPath();
      ctx.arc(18 + index * 14, dotsY, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = palette.title;
    ctx.font = `600 13px "Inter", -apple-system, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const maxTitleWidth = width - 96;
    const truncated = truncateText(ctx, options.title, maxTitleWidth);
    ctx.fillText(truncated, 72, dotsY + 1);
  }

  const bodyTop = titleBarHeight > 0 ? titleBarHeight : 0;
  const bodyHeight = height - bodyTop;

  ctx.save();
  roundedRect(ctx, 0.5, 0.5, width - 1, height - 1, cardRadius);
  ctx.clip();

  const originX = contentPadding;
  const originY = bodyTop + contentPadding;

  for (const block of layout.blocks) {
    const blockLines = layout.lines.slice(
      block.firstLineIndex,
      block.firstLineIndex + block.lineCount,
    );
    drawBlock(ctx, block, blockLines as Array<TextLine | OpaqueLine>, originX, originY, palette);
  }

  const fadeHeight = 72;
  if (layout.totalHeight + contentPadding * 2 + bodyTop > height) {
    const fade = ctx.createLinearGradient(0, height - fadeHeight, 0, height);
    fade.addColorStop(0, "rgba(15,19,32,0)");
    fade.addColorStop(1, palette.backgroundEnd);
    ctx.fillStyle = fade;
    ctx.fillRect(
      0,
      Math.max(bodyTop, height - fadeHeight),
      width,
      Math.min(fadeHeight, bodyHeight),
    );
  }

  ctx.restore();
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const candidate = text.slice(0, mid) + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

function fontSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match === null ? 16 : Number(match[1]);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  top: number,
  lineHeight: number,
  font: string,
  color: string,
): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  // Use font-size-derived metrics so every fragment on a line lands on the
  // same baseline regardless of which characters it carries. `actualBoundingBox`
  // shrinks for strings without descenders (e.g. "hello"), which otherwise
  // pushes the text up and makes inline code pills look vertically off.
  const size = fontSize(font);
  const ascent = size * 0.8;
  const descent = size * 0.2;
  const baseline = top + (lineHeight - (ascent + descent)) / 2 + ascent;
  ctx.fillText(text, x, baseline);
}

function fragmentColor(fragment: InlineFragment, palette: TilePalette): string {
  switch (fragment.type) {
    case "link":
      return palette.accent;
    case "inline_code":
      return palette.inlineCodeText;
    default:
      return palette.text;
  }
}

function drawFragment(
  ctx: CanvasRenderingContext2D,
  fragment: InlineFragment,
  x: number,
  top: number,
  lineHeight: number,
  palette: TilePalette,
): void {
  if (fragment.type === "inline_code") {
    const size = fontSize(fragment.font);
    const pillTop = top + (lineHeight - (size + 8)) / 2;
    roundedRect(ctx, x, pillTop, fragment.width, size + 8, 6);
    ctx.fillStyle = palette.inlineCode;
    ctx.fill();
  }
  // Layout reserves `chromeWidth: 12` for inline code pills (split 6/6), so
  // the text has to sit 6px in from the left — using 4px made every pill
  // visibly off-center to the right.
  const textX = fragment.type === "inline_code" ? x + 6 : x;
  drawText(
    ctx,
    fragment.text,
    textX,
    top,
    lineHeight,
    fragment.font,
    fragmentColor(fragment, palette),
  );

  if (fragment.type === "link") {
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top + lineHeight - 4);
    ctx.lineTo(x + fragment.width, top + lineHeight - 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (fragment.type === "strikethrough") {
    ctx.strokeStyle = fragmentColor(fragment, palette);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, top + lineHeight * 0.52);
    ctx.lineTo(x + fragment.width, top + lineHeight * 0.52);
    ctx.stroke();
  }
}

const TASK_PREFIX_RE = /^\[( |x|X)\] /;
const CHECKBOX_SIZE = 14;
const CHECKBOX_GAP = 8;

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  line: TextLine,
  originX: number,
  originY: number,
  palette: TilePalette,
  allowTaskPrefix = false,
): void {
  // Locate the fragment that carries the "[x] " / "[ ] " prefix, if any.
  // Everything before it (the list marker "-") is suppressed so the checkbox
  // replaces the bullet visually instead of sitting next to it.
  let taskIndex = -1;
  let taskMatch: RegExpExecArray | null = null;
  let taskShift = 0;
  if (allowTaskPrefix) {
    for (let i = 0; i < line.fragments.length; i += 1) {
      const candidate = TASK_PREFIX_RE.exec(line.fragments[i].text);
      if (candidate) {
        taskIndex = i;
        taskMatch = candidate;
        break;
      }
    }
    if (taskIndex >= 0 && taskMatch) {
      const taskFrag = line.fragments[taskIndex];
      ctx.save();
      ctx.font = taskFrag.font;
      const prefixWidth = ctx.measureText(taskMatch[0]).width;
      ctx.restore();
      // Move everything after the suppressed marker + literal prefix leftward
      // by `taskShift`, so the checkbox sits at the list marker's natural x
      // (line.x + fragments[0].x) rather than one marker-width in from it.
      taskShift = taskFrag.x - line.fragments[0].x + prefixWidth - (CHECKBOX_SIZE + CHECKBOX_GAP);
    }
  }

  for (let i = 0; i < line.fragments.length; i += 1) {
    const fragment = line.fragments[i];
    const baseX = originX + line.x + fragment.x;
    const baseY = originY + line.y;
    if (taskIndex >= 0) {
      if (i < taskIndex) continue;
      if (i === taskIndex && taskMatch) {
        const checked = taskMatch[1].toLowerCase() === "x";
        const checkboxX = originX + line.x + line.fragments[0].x;
        drawCheckbox(ctx, checkboxX, baseY, line.height, checked, palette);
        const rest = fragment.text.slice(taskMatch[0].length);
        if (rest.length > 0) {
          drawFragment(
            ctx,
            { ...fragment, text: rest },
            checkboxX + CHECKBOX_SIZE + CHECKBOX_GAP,
            baseY,
            line.height,
            palette,
          );
        }
        continue;
      }
      drawFragment(ctx, fragment, baseX - taskShift, baseY, line.height, palette);
      continue;
    }
    drawFragment(ctx, fragment, baseX, baseY, line.height, palette);
  }
}

function drawCheckbox(
  ctx: CanvasRenderingContext2D,
  x: number,
  lineTop: number,
  lineHeight: number,
  checked: boolean,
  palette: TilePalette,
): void {
  // Fixed-size glyph left-aligned at `x`, so every checkbox in a list lines
  // up vertically regardless of whether the literal prefix was "[x] " or
  // "[ ] " (which have slightly different measured widths).
  const boxSize = CHECKBOX_SIZE;
  const bx = x;
  const by = lineTop + (lineHeight - boxSize) / 2;

  ctx.save();
  roundedRect(ctx, bx, by, boxSize, boxSize, 3);
  if (checked) {
    ctx.fillStyle = palette.accent;
    ctx.fill();
  } else {
    ctx.fillStyle = palette.codeBg;
    ctx.fill();
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }

  if (checked) {
    ctx.strokeStyle = palette.card;
    ctx.lineWidth = Math.max(1.3, boxSize * 0.14);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(bx + boxSize * 0.22, by + boxSize * 0.54);
    ctx.lineTo(bx + boxSize * 0.44, by + boxSize * 0.74);
    ctx.lineTo(bx + boxSize * 0.8, by + boxSize * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

type TokenRun = { text: string; tokenType: string };

function tokenColor(tokenType: string, palette: TilePalette): string {
  switch (tokenType) {
    case "comment":
    case "prolog":
    case "doctype":
    case "cdata":
      return palette.muted;
    case "property":
    case "tag":
    case "boolean":
    case "number":
    case "constant":
    case "symbol":
    case "deleted":
      return "#79c0ff";
    case "selector":
    case "attr-name":
    case "string":
    case "char":
    case "builtin":
    case "inserted":
      return "#9dd3ff";
    case "atrule":
    case "attr-value":
    case "keyword":
      return "#ff8c69";
    case "function":
    case "class-name":
      return "#cab5ff";
    default:
      return palette.codeText;
  }
}

function drawCodeBlock(
  ctx: CanvasRenderingContext2D,
  line: OpaqueLine,
  content: CodeBlockContent,
  originX: number,
  originY: number,
  palette: TilePalette,
): void {
  const x = originX + line.x;
  const y = originY + line.y;
  roundedRect(ctx, x, y, line.width, line.height, 14);
  ctx.fillStyle = palette.codeBg;
  ctx.fill();
  ctx.strokeStyle = palette.codeStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const innerX = x + content.padding.left;
  const innerY = y + content.padding.top;
  const maxWidth = Math.max(40, line.width - content.padding.left - content.padding.right);
  const tokenLines: TokenRun[][] =
    content.tokens?.map((row) =>
      row.map((token) => ({ text: token.content, tokenType: token.tokenType })),
    ) ?? content.code.split("\n").map((entry) => [{ text: entry, tokenType: "plain" }]);

  ctx.save();
  roundedRect(ctx, x, y, line.width, line.height, 14);
  ctx.clip();

  tokenLines.forEach((runs, index) => {
    let cursorX = innerX;
    const top = innerY + index * content.lineHeight;
    for (const run of runs) {
      if (cursorX > innerX + maxWidth) break;
      drawText(
        ctx,
        run.text,
        cursorX,
        top,
        content.lineHeight,
        content.font,
        tokenColor(run.tokenType, palette),
      );
      ctx.font = content.font;
      cursorX += ctx.measureText(run.text).width;
    }
  });
  ctx.restore();
}

function drawTable(
  ctx: CanvasRenderingContext2D,
  line: OpaqueLine,
  content: TableContent,
  originX: number,
  originY: number,
  palette: TilePalette,
): void {
  const x = originX + line.x;
  const y = originY + line.y;
  const rowCount = content.rows.length + 1;
  const tableWidth = content.columnWidths.reduce((sum, width) => sum + width, 0);
  const tableHeight =
    content.rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rowCount - 1);

  const radius = 10;
  roundedRect(ctx, x, y, tableWidth, tableHeight, radius);
  ctx.fillStyle = palette.tableBg;
  ctx.fill();
  ctx.strokeStyle = palette.tableStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x, y, tableWidth, tableHeight, radius);
  ctx.clip();

  const headerHeight = content.rowHeights[0] ?? 0;
  ctx.fillStyle = palette.tableHeaderBg;
  ctx.fillRect(x, y, tableWidth, headerHeight);

  let gridX = x;
  for (let columnIndex = 0; columnIndex < content.columnWidths.length - 1; columnIndex += 1) {
    gridX += content.columnWidths[columnIndex];
    ctx.strokeStyle = palette.tableStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gridX, y);
    ctx.lineTo(gridX, y + tableHeight);
    ctx.stroke();
  }

  let gridY = y;
  for (let rowIndex = 0; rowIndex < rowCount - 1; rowIndex += 1) {
    gridY += content.rowHeights[rowIndex] ?? 0;
    ctx.strokeStyle = palette.tableStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, gridY);
    ctx.lineTo(x + tableWidth, gridY);
    ctx.stroke();
    gridY += 1;
  }

  ctx.restore();

  let cursorY = y;
  const rows = [content.header, ...content.rows];
  rows.forEach((row, rowIndex) => {
    let cursorX = x;
    const rowHeight = content.rowHeights[rowIndex] ?? 0;
    row.forEach((cell, columnIndex) => {
      drawTableCell(
        ctx,
        cell,
        cursorX,
        cursorY,
        content.columnWidths[columnIndex],
        rowHeight,
        content.alignments[columnIndex] ?? "left",
        palette,
      );
      cursorX += content.columnWidths[columnIndex];
    });
    cursorY += rowHeight + 1;
  });
}

function drawTableCell(
  ctx: CanvasRenderingContext2D,
  cell: TableCell,
  x: number,
  y: number,
  width: number,
  height: number,
  align: "left" | "center" | "right" | null,
  palette: TilePalette,
): void {
  if (cell.lines === undefined) return;
  const paddingX = 12;
  const paddingY = 8;
  const contentWidth = Math.max(0, width - paddingX * 2);
  const totalHeight = cell.lines.reduce((total, line) => total + line.height, 0);
  let cursorY = y + Math.max(paddingY, (height - totalHeight) / 2);

  for (const line of cell.lines) {
    const lineWidth = line.fragments.reduce((total, fragment) => total + fragment.width, 0);
    const startX =
      align === "right"
        ? x + width - paddingX - lineWidth
        : align === "center"
          ? x + paddingX + (contentWidth - lineWidth) / 2
          : x + paddingX;
    let cursorX = startX;
    for (const fragment of line.fragments) {
      drawFragment(ctx, fragment, cursorX, cursorY, line.height, palette);
      cursorX += fragment.width;
    }
    cursorY += line.height;
  }
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  block: BlockLayout,
  lines: Array<TextLine | OpaqueLine>,
  originX: number,
  originY: number,
  palette: TilePalette,
): void {
  if (block.context.quoteDepth > 0) {
    const barX = originX + Math.max(0, block.contentBox.x - 14);
    roundedRect(ctx, barX, originY + block.y + 2, 3, block.height - 4, 999);
    ctx.fillStyle = palette.quoteBar;
    ctx.fill();
  }

  if (block.type === "thematic_break") {
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(originX + block.contentBox.x, originY + block.y + block.height / 2);
    ctx.lineTo(
      originX + block.contentBox.x + block.contentBox.width,
      originY + block.y + block.height / 2,
    );
    ctx.stroke();
    return;
  }

  const first = lines[0];
  if (first?.kind === "opaque") {
    const opaque = first as OpaqueLine;
    if (opaque.content.type === "code_block") {
      drawCodeBlock(ctx, opaque, opaque.content, originX, originY, palette);
    } else if (opaque.content.type === "table") {
      drawTable(ctx, opaque, opaque.content, originX, originY, palette);
    }
    return;
  }

  const renderTaskPrefix = block.meta.type === "list_item";
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] as TextLine;
    // Task markers only appear at the very start of a list item's paragraph —
    // restricting to the first line prevents an accidental `[x] ` literal in
    // later wrapped lines from rendering as a checkbox.
    drawTextLine(ctx, line, originX, originY, palette, renderTaskPrefix && lineIndex === 0);
  }
}
