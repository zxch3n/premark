import type {
  BlockLayout,
  CodeBlockContent,
  DocumentLayout,
  ImageBlockContent,
  InlineFragment,
  LayoutLine,
  OpaqueLine,
  TableCell,
  TableContent,
  TextLine,
} from "@pretext-md/layout";

const baseCss = `.pmd-doc{position:relative;width:100%;max-width:100%;overflow:hidden}.pmd-surface{position:relative}.pmd-block{position:absolute;box-sizing:border-box}.pmd-block--blockquote{padding-left:14px}.pmd-block--blockquote::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:rgba(125,125,140,.35);border-radius:999px}.pmd-line{position:absolute;white-space:pre}.pmd-fragment{position:absolute;top:0;box-sizing:border-box;white-space:pre}.pmd-fragment--inline_code{padding-inline:6px;border-radius:6px;background:rgba(125,125,140,.14)}.pmd-fragment--link{color:inherit;text-decoration:underline;text-decoration-color:rgba(11,98,255,.35)}.pmd-rule{position:absolute;inset:50% 0 auto;border-top:1px solid rgba(125,125,140,.35)}.pmd-image{display:block;width:100%;height:100%;object-fit:contain;border-radius:16px;background:radial-gradient(circle at 20% 20%,rgba(255,210,180,.3),transparent 45%),linear-gradient(135deg,rgba(246,239,228,.92),rgba(234,240,246,.92))}.pmd-html{width:100%;height:100%;overflow:hidden}.pmd-table{width:100%;border-collapse:collapse;table-layout:fixed;font:inherit}.pmd-table th,.pmd-table td{border:1px solid rgba(125,125,140,.24);vertical-align:top;padding:10px 12px}.pmd-cell-line{position:relative;white-space:pre-wrap}.pmd-cell-fragment{display:inline;white-space:pre-wrap}`;
const codeCss = `.pmd-code{width:100%;height:100%;margin:0;box-sizing:border-box;overflow:hidden;border-radius:14px;background:linear-gradient(180deg,rgba(16,20,26,.94),rgba(28,34,42,.94)),linear-gradient(135deg,rgba(86,114,255,.2),transparent 48%);color:#e8ecf3}.pmd-code>code{display:block;white-space:pre-wrap;word-break:break-word}`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function style(entries: Record<string, string | number | undefined>): string {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

function renderFragment(fragment: InlineFragment): string {
  const className = `pmd-fragment pmd-fragment--${fragment.type}`;
  const inlineStyle = style({
    left: `${fragment.x}px`,
    width: `${fragment.width}px`,
    font: fragment.font,
  });
  if (fragment.meta?.type === "link") {
    return `<a class="${className}" style="${inlineStyle}" href="${escapeHtml(fragment.meta.href)}">${escapeHtml(fragment.text)}</a>`;
  }
  return `<span class="${className}" style="${inlineStyle}">${escapeHtml(fragment.text)}</span>`;
}

function renderTextLine(line: TextLine, block: BlockLayout): string {
  return `<div class="pmd-line" style="${style({
    top: `${line.y - block.y}px`,
    left: `${line.x - block.contentBox.x}px`,
    height: `${line.height}px`,
    width: `${line.width}px`,
  })}">${line.fragments.map(renderFragment).join("")}</div>`;
}

function renderCellFragment(fragment: InlineFragment): string {
  const className = `pmd-cell-fragment pmd-cell-fragment--${fragment.type}`;
  if (fragment.meta?.type === "link") {
    return `<a class="${className}" href="${escapeHtml(fragment.meta.href)}">${escapeHtml(fragment.text)}</a>`;
  }
  return `<span class="${className}">${escapeHtml(fragment.text)}</span>`;
}

function renderTableCell(cell: TableCell): string {
  if (cell.lines === undefined || cell.lines.length === 0) {
    return "<div></div>";
  }

  return cell.lines
    .map(
      (line) =>
        `<div class="pmd-cell-line" style="${style({
          minHeight: `${line.height}px`,
        })}">${line.fragments.map(renderCellFragment).join("")}</div>`,
    )
    .join("");
}

function renderCodeBlock(content: CodeBlockContent): string {
  const codeMarkup = content.html ?? escapeHtml(content.code);
  return `<pre class="pmd-code" style="${style({
    padding: `${content.padding.top}px ${content.padding.right}px ${content.padding.bottom}px ${content.padding.left}px`,
    font: content.font,
    lineHeight: `${content.lineHeight}px`,
  })}"><code class="language-${escapeHtml(content.lang || "plain")}">${codeMarkup}</code></pre>`;
}

function renderTable(content: TableContent): string {
  const colGroup = content.columnWidths
    .map((width) => `<col style="${style({ width: `${width}px` })}">`)
    .join("");
  const header = `<thead><tr>${content.header
    .map(
      (cell, index) =>
        `<th align="${content.alignments[index] ?? "left"}">${renderTableCell(cell)}</th>`,
    )
    .join("")}</tr></thead>`;
  const rows = `<tbody>${content.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td align="${content.alignments[index] ?? "left"}">${renderTableCell(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;
  return `<table class="pmd-table"><colgroup>${colGroup}</colgroup>${header}${rows}</table>`;
}

function renderImage(content: ImageBlockContent): string {
  return `<img class="pmd-image" src="${escapeHtml(content.src)}" alt="${escapeHtml(content.alt)}" width="${content.displayWidth}" height="${content.displayHeight}">`;
}

function renderOpaqueBlock(line: OpaqueLine): string {
  switch (line.content.type) {
    case "code_block":
      return renderCodeBlock(line.content);
    case "table":
      return renderTable(line.content);
    case "html_block":
      return `<div class="pmd-html">${line.content.html}</div>`;
    case "image":
      return renderImage(line.content);
  }
}

function renderBlock(block: BlockLayout, lines: LayoutLine[]): string {
  const classNames = [
    "pmd-block",
    `pmd-block--${block.type}`,
    block.context.quoteDepth > 0 ? "pmd-block--blockquote" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body =
    block.type === "thematic_break"
      ? '<div class="pmd-rule"></div>'
      : lines[0]?.kind === "opaque"
        ? renderOpaqueBlock(lines[0] as OpaqueLine)
        : (lines as TextLine[]).map((line) => renderTextLine(line, block)).join("");

  return `<section class="${classNames}" style="${style({
    top: `${block.y}px`,
    left: `${block.contentBox.x}px`,
    width: `${block.contentBox.width}px`,
    height: `${block.height}px`,
  })}">${body}</section>`;
}

export interface RenderToHtmlOptions {
  className?: string;
  codeThemeCss?: string;
}

export function renderToHtml(
  layout: DocumentLayout,
  options: RenderToHtmlOptions = {},
): {
  html: string;
  css: string;
} {
  const html = `<article class="pmd-doc ${options.className ?? ""}" style="${style({
    height: `${layout.totalHeight}px`,
  })}"><div class="pmd-surface" style="${style({
    height: `${layout.totalHeight}px`,
    width: `${layout.containerWidth}px`,
  })}">${layout.blocks
    .map((block) =>
      renderBlock(
        block,
        layout.lines.slice(block.firstLineIndex, block.firstLineIndex + block.lineCount),
      ),
    )
    .join("")}</div></article>`;

  return {
    html,
    css: [baseCss, codeCss, options.codeThemeCss].filter(Boolean).join("\n"),
  };
}

export { baseCss, codeCss };
