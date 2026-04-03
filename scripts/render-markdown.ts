import type { Dirent } from "fs";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { basename, dirname, extname, join, resolve } from "path";
import process from "process";

import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

import { createHighlighter } from "../packages/highlight/src/index.ts";
import {
  createLayoutEngine,
  type BlockLayout,
  type CodeBlockContent,
  type DocumentLayout,
  type HtmlBlockContent,
  type ImageBlockContent,
  type InlineFragment,
  type OpaqueLine,
  type TableCell,
  type TableContent,
  type TextLine,
} from "../packages/layout/src/index.ts";
import { installNodeCanvas } from "../packages/layout/src/node-canvas.ts";

installNodeCanvas();

type ThemeName = "light" | "dark";

interface CliOptions {
  inputPaths: string[];
  outputDir: string;
  width: number;
  scale: number;
  theme: ThemeName;
}

interface RenderResult {
  input: string;
  output: string;
  width: number;
  height: number;
}

interface ResolvedCliFonts {
  sansFamily: string;
  monoFamily: string;
}

interface ThemePalette {
  pageStart: string;
  pageEnd: string;
  card: string;
  cardStroke: string;
  cardShadow: string;
  text: string;
  muted: string;
  accent: string;
  inlineCode: string;
  inlineCodeText: string;
  quoteBar: string;
  rule: string;
  tableBg: string;
  tableHeaderBg: string;
  tableAltRowBg: string;
  tableStroke: string;
  codeBg: string;
  codeStroke: string;
  codeText: string;
  htmlBg: string;
  htmlStroke: string;
  htmlLabel: string;
  imageBg: string;
}

const palettes: Record<ThemeName, ThemePalette> = {
  light: {
    pageStart: "#f2e4d5",
    pageEnd: "#dbe9f5",
    card: "#fffaf2",
    cardStroke: "#dccab8",
    cardShadow: "rgba(94, 58, 28, 0.14)",
    text: "#1f1913",
    muted: "#74685c",
    accent: "#0d63f3",
    inlineCode: "#eee2d3",
    inlineCodeText: "#5f2414",
    quoteBar: "#d96c42",
    rule: "#d4c3b4",
    tableBg: "#fffaf2",
    tableHeaderBg: "#f2e5d6",
    tableAltRowBg: "rgba(233, 221, 205, 0.22)",
    tableStroke: "#d5c3b2",
    codeBg: "#10151d",
    codeStroke: "#2c3948",
    codeText: "#edf2f7",
    htmlBg: "#f3eadf",
    htmlStroke: "#d8c8b7",
    htmlLabel: "#805a33",
    imageBg: "#efe4d5",
  },
  dark: {
    pageStart: "#1b2028",
    pageEnd: "#11151b",
    card: "#1f2630",
    cardStroke: "#36404d",
    cardShadow: "rgba(0, 0, 0, 0.32)",
    text: "#e7ecf3",
    muted: "#9aa6b3",
    accent: "#7cb7ff",
    inlineCode: "#2d3642",
    inlineCodeText: "#ffc7aa",
    quoteBar: "#ff8b61",
    rule: "#43505f",
    tableBg: "#202934",
    tableHeaderBg: "#2b3542",
    tableAltRowBg: "rgba(255, 255, 255, 0.04)",
    tableStroke: "#415060",
    codeBg: "#0e1319",
    codeStroke: "#2a3440",
    codeText: "#edf2f7",
    htmlBg: "#232c36",
    htmlStroke: "#3a4756",
    htmlLabel: "#f2b27a",
    imageBg: "#262f39",
  },
};

const pagePadding = 36;
const cardPadding = 28;
const inlineCodePaddingX = 6;
const inlineCodePaddingY = 4;
const quoteBarWidth = 4;
const quoteBarGap = 12;
type Canvas2D = SKRSContext2D;
let resolvedCliFonts: ResolvedCliFonts | null = null;

const fontCandidates = {
  sans: [
    {
      path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      family: "DejaVu Sans",
      alias: "Pretext Sans",
    },
    {
      path: "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
      family: "Liberation Sans",
      alias: "Pretext Sans Alt",
    },
  ],
  mono: [
    {
      path: "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
      family: "DejaVu Sans Mono",
      alias: "Pretext Mono",
    },
  ],
  cjk: [
    {
      path: "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
      family: "WenQuanYi Zen Hei",
      alias: "Pretext CJK",
    },
  ],
  emoji: [
    {
      path: "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
      family: "Noto Color Emoji",
      alias: "Pretext Emoji",
    },
  ],
} as const;

function printHelp(): void {
  console.log(`Usage: jiti scripts/render-markdown.ts <file-or-dir> [...more] [--output dir] [--width px] [--scale n] [--theme light|dark]

Examples:
  jiti scripts/render-markdown.ts examples/markdown --output examples/rendered
  jiti scripts/render-markdown.ts README.md --width 800 --scale 2
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPaths: [],
    outputDir: "examples/rendered",
    width: 920,
    scale: 2,
    theme: "light",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    switch (value) {
      case "--output":
      case "-o":
        options.outputDir = argv[index + 1] ?? options.outputDir;
        index += 1;
        break;
      case "--width":
      case "-w":
        options.width = Number(argv[index + 1] ?? options.width);
        index += 1;
        break;
      case "--scale":
      case "-s":
        options.scale = Number(argv[index + 1] ?? options.scale);
        index += 1;
        break;
      case "--theme":
      case "-t":
        options.theme = (argv[index + 1] as ThemeName | undefined) === "dark" ? "dark" : "light";
        index += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        options.inputPaths.push(value);
        break;
    }
  }

  if (options.inputPaths.length === 0) {
    options.inputPaths.push("examples/markdown");
  }

  if (!Number.isFinite(options.width) || options.width < 320) {
    throw new Error(`Invalid width: ${options.width}`);
  }

  if (!Number.isFinite(options.scale) || options.scale <= 0) {
    throw new Error(`Invalid scale: ${options.scale}`);
  }

  return options;
}

async function collectMarkdownFiles(entryPath: string): Promise<string[]> {
  const absolutePath = resolve(entryPath);
  const entry = await stat(absolutePath);

  if (entry.isFile()) {
    return extname(absolutePath).toLowerCase() === ".md" ? [absolutePath] : [];
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((item: Dirent) => !item.name.startsWith("."))
      .map((item: Dirent) => collectMarkdownFiles(join(absolutePath, item.name))),
  );
  return nested.flat().sort();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function registerFontByPath(
  path: string,
  alias: string,
  fallbackFamily: string,
): Promise<string | null> {
  if (!(await pathExists(path))) {
    return null;
  }

  try {
    GlobalFonts.registerFromPath(path, alias);
    return alias;
  } catch {
    return fallbackFamily;
  }
}

async function resolveCliFonts(): Promise<ResolvedCliFonts> {
  if (resolvedCliFonts !== null) {
    return resolvedCliFonts;
  }

  const [sansBase, monoBase, cjk, emoji] = await Promise.all([
    registerFontByPath(
      fontCandidates.sans[0].path,
      fontCandidates.sans[0].alias,
      fontCandidates.sans[0].family,
    ),
    registerFontByPath(
      fontCandidates.mono[0].path,
      fontCandidates.mono[0].alias,
      fontCandidates.mono[0].family,
    ),
    registerFontByPath(
      fontCandidates.cjk[0].path,
      fontCandidates.cjk[0].alias,
      fontCandidates.cjk[0].family,
    ),
    registerFontByPath(
      fontCandidates.emoji[0].path,
      fontCandidates.emoji[0].alias,
      fontCandidates.emoji[0].family,
    ),
  ]);

  const quoteFamily = (family: string): string =>
    family === "sans-serif" || family === "monospace" ? family : `"${family}"`;
  const isFontFamily = (family: string | null): family is string => family !== null;
  const sansStack = [sansBase, cjk, emoji, "sans-serif"].filter(isFontFamily).map(quoteFamily);
  const monoStack = [monoBase, cjk, emoji, "monospace"].filter(isFontFamily).map(quoteFamily);

  resolvedCliFonts = {
    sansFamily: sansStack.join(", "),
    monoFamily: monoStack.join(", "),
  };

  return resolvedCliFonts;
}

function roundedRect(
  ctx: Canvas2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function fontSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  return match === null ? 16 : Number(match[1]);
}

function drawText(
  ctx: Canvas2D,
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

  const metrics = ctx.measureText(text.length > 0 ? text : "M");
  const ascent = metrics.actualBoundingBoxAscent || fontSize(font) * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize(font) * 0.2;
  const baseline = top + (lineHeight - (ascent + descent)) / 2 + ascent;

  ctx.fillText(text, x, baseline);
}

function fragmentColor(fragment: InlineFragment, palette: ThemePalette): string {
  switch (fragment.type) {
    case "link":
      return palette.accent;
    case "inline_code":
      return palette.inlineCodeText;
    default:
      return palette.text;
  }
}

function tokenColor(tokenType: string, palette: ThemePalette): string {
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
    case "operator":
    case "entity":
    case "url":
    case "plain":
      return palette.codeText;
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

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapPlainText(ctx: Canvas2D, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth || current.length === 0) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function drawFragment(
  ctx: Canvas2D,
  fragment: InlineFragment,
  x: number,
  top: number,
  lineHeight: number,
  palette: ThemePalette,
): void {
  if (fragment.type === "inline_code") {
    roundedRect(
      ctx,
      x,
      top + (lineHeight - (fontSize(fragment.font) + inlineCodePaddingY * 2)) / 2,
      fragment.width,
      fontSize(fragment.font) + inlineCodePaddingY * 2,
      7,
    );
    ctx.fillStyle = palette.inlineCode;
    ctx.fill();
  }

  const textX = fragment.type === "inline_code" ? x + inlineCodePaddingX : x;
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
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x, top + lineHeight - 3);
    ctx.lineTo(x + fragment.width, top + lineHeight - 3);
    ctx.stroke();
  }

  if (fragment.type === "strikethrough") {
    ctx.strokeStyle = fragmentColor(fragment, palette);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, top + lineHeight * 0.52);
    ctx.lineTo(x + fragment.width, top + lineHeight * 0.52);
    ctx.stroke();
  }
}

function drawTextLine(
  ctx: Canvas2D,
  line: TextLine,
  originX: number,
  originY: number,
  palette: ThemePalette,
): void {
  for (const fragment of line.fragments) {
    drawFragment(
      ctx,
      fragment,
      originX + line.x + fragment.x,
      originY + line.y,
      line.height,
      palette,
    );
  }
}

type TokenRun = { text: string; tokenType: string };

function appendRun(target: TokenRun[], text: string, tokenType: string): void {
  if (text.length === 0) {
    return;
  }
  const previous = target.at(-1);
  if (previous?.tokenType === tokenType) {
    previous.text += text;
    return;
  }
  target.push({ text, tokenType });
}

function wrapCodeTokens(
  ctx: Canvas2D,
  tokenLines: TokenRun[][],
  font: string,
  maxWidth: number,
): TokenRun[][] {
  ctx.font = font;
  const wrapped: TokenRun[][] = [];

  for (const sourceLine of tokenLines) {
    if (sourceLine.length === 0) {
      wrapped.push([]);
      continue;
    }

    let current: TokenRun[] = [];
    let currentWidth = 0;

    const flush = () => {
      wrapped.push(current);
      current = [];
      currentWidth = 0;
    };

    for (const token of sourceLine) {
      const normalized = token.text.replaceAll("\t", "  ");
      for (const char of normalized) {
        const width = ctx.measureText(char).width;
        if (currentWidth + width > maxWidth && current.length > 0) {
          flush();
        }
        appendRun(current, char, token.tokenType);
        currentWidth += width;
      }
    }

    wrapped.push(current);
  }

  return wrapped.length === 0 ? [[]] : wrapped;
}

function drawCodeBlock(
  ctx: Canvas2D,
  line: OpaqueLine,
  content: CodeBlockContent,
  originX: number,
  originY: number,
  palette: ThemePalette,
): void {
  const x = originX + line.x;
  const y = originY + line.y;
  roundedRect(ctx, x, y, line.width, line.height, 18);
  ctx.fillStyle = palette.codeBg;
  ctx.fill();
  ctx.strokeStyle = palette.codeStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const innerX = x + content.padding.left;
  const innerY = y + content.padding.top;
  const maxWidth = Math.max(40, line.width - content.padding.left - content.padding.right);
  const tokenLines =
    content.tokens?.map((row) =>
      row.map((token) => ({
        text: token.content,
        tokenType: token.tokenType,
      })),
    ) ?? content.code.split("\n").map((entry) => [{ text: entry, tokenType: "plain" }]);
  const visualLines = wrapCodeTokens(ctx, tokenLines, content.font, maxWidth);

  visualLines.forEach((runs, index) => {
    let cursorX = innerX;
    const top = innerY + index * content.lineHeight;
    runs.forEach((run) => {
      drawText(
        ctx,
        run.text,
        cursorX,
        top,
        content.lineHeight,
        content.font,
        tokenColor(run.tokenType, palette),
      );
      cursorX += ctx.measureText(run.text).width;
    });
  });
}

function cellLineWidth(line: NonNullable<TableCell["lines"]>[number]): number {
  return line.fragments.reduce((total, fragment) => total + fragment.width, 0);
}

function cellContentHeight(cell: TableCell): number {
  return cell.lines?.reduce((total, line) => total + line.height, 0) ?? 0;
}

function drawTableCellContent(
  ctx: Canvas2D,
  cell: TableCell,
  x: number,
  y: number,
  width: number,
  height: number,
  align: "left" | "center" | "right" | null,
  palette: ThemePalette,
): void {
  if (cell.lines === undefined) {
    return;
  }

  const paddingX = 14;
  const paddingY = 10;
  const contentWidth = Math.max(0, width - paddingX * 2);
  const totalHeight = cellContentHeight(cell);
  let cursorY = y + Math.max(paddingY, (height - totalHeight) / 2);

  for (const line of cell.lines) {
    const lineWidth = cellLineWidth(line);
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

function drawTable(
  ctx: Canvas2D,
  line: OpaqueLine,
  content: TableContent,
  originX: number,
  originY: number,
  palette: ThemePalette,
): void {
  const x = originX + line.x;
  const y = originY + line.y;
  const radius = 16;
  const rowCount = content.rows.length + 1;
  const tableWidth = content.columnWidths.reduce((sum, width) => sum + width, 0);
  const tableHeight =
    content.rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(0, rowCount - 1);

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

  let stripeY = y + headerHeight + 1;
  for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
    const rowHeight = content.rowHeights[rowIndex] ?? 0;
    if (rowIndex % 2 === 0) {
      ctx.fillStyle = palette.tableAltRowBg;
      ctx.fillRect(x, stripeY, tableWidth, rowHeight);
    }
    stripeY += rowHeight + 1;
  }

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
      drawTableCellContent(
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

async function drawImageBlock(
  ctx: Canvas2D,
  line: OpaqueLine,
  content: ImageBlockContent,
  originX: number,
  originY: number,
  sourceDir: string,
  palette: ThemePalette,
): Promise<void> {
  const x = originX + line.x;
  const y = originY + line.y;
  roundedRect(ctx, x, y, line.width, line.height, 18);
  ctx.fillStyle = palette.imageBg;
  ctx.fill();
  ctx.strokeStyle = palette.cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  try {
    const source = content.src.startsWith("data:")
      ? content.src
      : content.src.startsWith("http://") ||
          content.src.startsWith("https://") ||
          content.src.startsWith("/")
        ? content.src
        : resolve(sourceDir, content.src);

    const image = await loadImage(source);
    const ratio = Math.min(line.width / image.width, line.height / image.height);
    const width = image.width * ratio;
    const height = image.height * ratio;
    const drawX = x + (line.width - width) / 2;
    const drawY = y + (line.height - height) / 2;
    roundedRect(ctx, x, y, line.width, line.height, 18);
    ctx.save();
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, width, height);
    ctx.restore();
  } catch {
    const fallbackFont = '600 16px "DejaVu Sans", sans-serif';
    const lines = wrapPlainText(
      ctx,
      content.alt || "Image failed to load",
      line.width - 24,
      fallbackFont,
    );
    lines.slice(0, 3).forEach((entry, index) => {
      drawText(ctx, entry, x + 12, y + 16 + index * 22, 22, fallbackFont, palette.muted);
    });
  }
}

function drawHtmlBlock(
  ctx: Canvas2D,
  line: OpaqueLine,
  content: HtmlBlockContent,
  originX: number,
  originY: number,
  palette: ThemePalette,
): void {
  const x = originX + line.x;
  const y = originY + line.y;
  roundedRect(ctx, x, y, line.width, line.height, 18);
  ctx.fillStyle = palette.htmlBg;
  ctx.fill();
  ctx.strokeStyle = palette.htmlStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const labelFont = '700 13px "DejaVu Sans", sans-serif';
  drawText(ctx, "HTML BLOCK", x + 16, y + 14, 18, labelFont, palette.htmlLabel);

  const bodyFont = `400 14px ${resolvedCliFonts?.sansFamily ?? '"DejaVu Sans", sans-serif'}`;
  const bodyLines = wrapPlainText(ctx, stripHtmlTags(content.html), line.width - 32, bodyFont);
  const bodyTop = y + 26;
  const bodyLineHeight = 18;
  const bodyMaxLines = Math.max(1, Math.floor((line.height - 34) / bodyLineHeight));

  ctx.save();
  roundedRect(ctx, x, y, line.width, line.height, 18);
  ctx.clip();
  bodyLines.slice(0, bodyMaxLines).forEach((entry, index) => {
    drawText(
      ctx,
      entry,
      x + 16,
      bodyTop + index * bodyLineHeight,
      bodyLineHeight,
      bodyFont,
      palette.text,
    );
  });
  ctx.restore();
}

async function drawOpaqueLine(
  ctx: Canvas2D,
  line: OpaqueLine,
  originX: number,
  originY: number,
  sourceDir: string,
  palette: ThemePalette,
): Promise<void> {
  switch (line.content.type) {
    case "code_block":
      drawCodeBlock(ctx, line, line.content, originX, originY, palette);
      break;
    case "table":
      drawTable(ctx, line, line.content, originX, originY, palette);
      break;
    case "html_block":
      drawHtmlBlock(ctx, line, line.content, originX, originY, palette);
      break;
    case "image":
      await drawImageBlock(ctx, line, line.content, originX, originY, sourceDir, palette);
      break;
  }
}

async function drawBlock(
  ctx: Canvas2D,
  block: BlockLayout,
  lines: Array<TextLine | OpaqueLine>,
  originX: number,
  originY: number,
  sourceDir: string,
  palette: ThemePalette,
): Promise<void> {
  if (block.context.quoteDepth > 0) {
    const barX = Math.max(originX + 6, originX + block.contentBox.x - quoteBarGap - quoteBarWidth);
    roundedRect(ctx, barX, originY + block.y + 2, quoteBarWidth, block.height - 4, 999);
    ctx.fillStyle = palette.quoteBar;
    ctx.fill();
  }

  if (block.type === "thematic_break") {
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX + block.contentBox.x, originY + block.y + block.height / 2);
    ctx.lineTo(
      originX + block.contentBox.x + block.contentBox.width,
      originY + block.y + block.height / 2,
    );
    ctx.stroke();
    return;
  }

  if (lines[0]?.kind === "opaque") {
    await drawOpaqueLine(ctx, lines[0] as OpaqueLine, originX, originY, sourceDir, palette);
    return;
  }

  for (const line of lines as TextLine[]) {
    drawTextLine(ctx, line, originX, originY, palette);
  }
}

async function renderLayoutToPng(
  layout: DocumentLayout,
  outputPath: string,
  sourceDir: string,
  themeName: ThemeName,
  scale: number,
): Promise<void> {
  const palette = palettes[themeName];
  const canvasWidth = layout.containerWidth + (pagePadding + cardPadding) * 2;
  const canvasHeight = layout.totalHeight + (pagePadding + cardPadding) * 2;
  const canvas = createCanvas(Math.ceil(canvasWidth * scale), Math.ceil(canvasHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const pageGradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  pageGradient.addColorStop(0, palette.pageStart);
  pageGradient.addColorStop(1, palette.pageEnd);
  ctx.fillStyle = pageGradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const cardX = pagePadding;
  const cardY = pagePadding;
  const cardWidth = layout.containerWidth + cardPadding * 2;
  const cardHeight = layout.totalHeight + cardPadding * 2;
  ctx.shadowColor = palette.cardShadow;
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 28);
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = palette.cardStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const originX = cardX + cardPadding;
  const originY = cardY + cardPadding;

  for (const block of layout.blocks) {
    const blockLines = layout.lines.slice(
      block.firstLineIndex,
      block.firstLineIndex + block.lineCount,
    );
    await drawBlock(
      ctx,
      block,
      blockLines as Array<TextLine | OpaqueLine>,
      originX,
      originY,
      sourceDir,
      palette,
    );
  }

  await writeFile(outputPath, canvas.toBuffer("image/png"));
}

function stem(filePath: string): string {
  return basename(filePath, extname(filePath));
}

async function renderMarkdownFile(
  filePath: string,
  outputDir: string,
  width: number,
  theme: ThemeName,
  scale: number,
): Promise<RenderResult> {
  const markdown = await readFile(filePath, "utf8");
  const fonts = await resolveCliFonts();
  const engine = createLayoutEngine({
    fontTheme: {
      sansFamily: fonts.sansFamily,
      monoFamily: fonts.monoFamily,
      baseFontSize: 16,
    },
    highlighter: createHighlighter({ theme }),
  });
  const layout = engine.layout(markdown, width);
  const output = resolve(outputDir, `${stem(filePath)}.png`);
  await renderLayoutToPng(layout, output, dirname(filePath), theme, scale);
  engine.dispose();

  return {
    input: filePath,
    output,
    width,
    height: layout.totalHeight,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const files = (
    await Promise.all(options.inputPaths.map((entry) => collectMarkdownFiles(entry)))
  ).flat();

  if (files.length === 0) {
    throw new Error("No markdown files found.");
  }

  await mkdir(resolve(options.outputDir), { recursive: true });
  const results: RenderResult[] = [];

  for (const file of files) {
    const result = await renderMarkdownFile(
      file,
      options.outputDir,
      options.width,
      options.theme,
      options.scale,
    );
    results.push(result);
    console.log(`Rendered ${result.input} -> ${result.output}`);
  }

  const manifestPath = resolve(options.outputDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wrote manifest -> ${manifestPath}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
