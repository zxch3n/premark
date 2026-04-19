import { createHighlighter } from "@pretext-md/highlight";
import { renderToHtml } from "@pretext-md/html-renderer";
import { createLayoutEngine } from "@pretext-md/layout";
import type { DocumentLayout } from "@pretext-md/layout";

import { createCodeMirrorOverlay } from "./codemirror-overlay.ts";
import {
  getVisualParityFixture,
  visualParityFixtures,
  type VisualParityFixture,
} from "./fixtures.ts";

import "./visual-parity.css";

interface RectMetrics {
  index: number;
  text: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PaneMetrics {
  blocks: RectMetrics[];
  lines: RectMetrics[];
  height: number;
  width: number;
}

interface VisualParityMetrics {
  fixture: {
    id: string;
    name: string;
    width: number;
    zoom: number;
    theme: VisualParityTheme;
  };
  premark: PaneMetrics;
  overlay: PaneMetrics;
}

interface ActiveEditMetrics {
  mode: "caret" | "selection" | null;
  caret: RectMetrics | null;
  selection: RectMetrics[];
}

interface VisualParityApi {
  fixtures: Array<Pick<VisualParityFixture, "id" | "name" | "category">>;
  collect: () => VisualParityMetrics;
  collectActiveEdit: () => ActiveEditMetrics;
}

declare global {
  interface Window {
    __premarkVisualParity?: VisualParityApi;
  }
}

const DEFAULT_WIDTH = 520;
type VisualParityTheme = "light" | "dark";
const highlighter = createHighlighter();
const engine = createLayoutEngine({
  fontTheme: "github",
  highlighter,
});

let activeEditor: ReturnType<typeof createCodeMirrorOverlay> | undefined;
let activeFixture = getVisualParityFixture(
  new URLSearchParams(window.location.search).get("fixture"),
);
let activeLayout: DocumentLayout | undefined;

export function mountVisualParityApp(root: HTMLElement): void {
  root.className = "visual-parity-root";
  root.innerHTML = `
    <header class="visual-parity-header">
      <div>
        <p class="visual-parity-eyebrow">visual parity</p>
        <h1>Premark vs CodeMirror Overlay</h1>
      </div>
      <label class="visual-parity-select-label">
        <span>Fixture</span>
        <select data-fixture-select></select>
      </label>
    </header>
    <main class="visual-parity-stage">
      <section class="visual-parity-pane" data-pane="premark">
        <header>Premark rendered output</header>
        <div class="visual-parity-surface" data-premark-surface></div>
      </section>
      <section class="visual-parity-pane" data-pane="overlay">
        <header>CodeMirror overlay preview</header>
        <div class="visual-parity-surface visual-parity-cm-surface" data-overlay-surface></div>
      </section>
    </main>
    <aside class="visual-parity-info" data-info></aside>
  `;

  const select = root.querySelector<HTMLSelectElement>("[data-fixture-select]")!;
  for (const fixture of visualParityFixtures) {
    const option = document.createElement("option");
    option.value = fixture.id;
    option.textContent = `${fixture.category} / ${fixture.name}`;
    option.selected = fixture.id === activeFixture.id;
    select.append(option);
  }

  select.addEventListener("change", () => {
    activeFixture = getVisualParityFixture(select.value);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "visual-parity");
    url.searchParams.set("fixture", activeFixture.id);
    window.history.replaceState(null, "", url);
    renderFixture(root, activeFixture);
  });

  window.__premarkVisualParity = {
    fixtures: visualParityFixtures.map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      category: fixture.category,
    })),
    collect: () => collectMetrics(root, activeFixture),
    collectActiveEdit: () => collectActiveEditMetrics(root),
  };

  renderFixture(root, activeFixture);
  root.setAttribute("data-vp-ready", "true");
}

function renderFixture(root: HTMLElement, fixture: VisualParityFixture): void {
  const width = fixture.width ?? DEFAULT_WIDTH;
  const zoom = getActiveZoom();
  const theme = getActiveTheme();
  const editMode = getActiveEditMode();
  const premarkSurface = root.querySelector<HTMLElement>("[data-premark-surface]")!;
  const overlaySurface = root.querySelector<HTMLElement>("[data-overlay-surface]")!;
  const info = root.querySelector<HTMLElement>("[data-info]")!;

  activeEditor?.destroy();
  overlaySurface.textContent = "";
  root.dataset.theme = theme;

  activeLayout = engine.layout(fixture.markdown, width);
  const rendered = renderToHtml(activeLayout, {
    codeThemeCss: highlighter.getThemeCss(theme),
  });

  premarkSurface.style.width = `${width}px`;
  overlaySurface.style.width = `${width}px`;
  premarkSurface.style.transform = `scale(${zoom})`;
  premarkSurface.style.transformOrigin = "top left";
  overlaySurface.style.transform = `scale(${zoom})`;
  overlaySurface.style.transformOrigin = "top left";
  premarkSurface.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
  activeEditor = createCodeMirrorOverlay(overlaySurface, fixture.markdown, {
    previewAll: editMode === null,
  });
  applyActiveEditState(fixture);

  info.innerHTML = `
    <strong>${fixture.name}</strong>
    <span>${fixture.id}</span>
    <span>${width}px</span>
    <span>${zoom}x</span>
    <span>${theme}</span>
    <span>${activeLayout.blocks.length} blocks</span>
    <span>${activeLayout.lines.length} lines</span>
  `;
}

function collectMetrics(root: HTMLElement, fixture: VisualParityFixture): VisualParityMetrics {
  const width = fixture.width ?? DEFAULT_WIDTH;
  return {
    fixture: {
      id: fixture.id,
      name: fixture.name,
      width,
      zoom: getActiveZoom(),
      theme: getActiveTheme(),
    },
    premark: collectPaneMetrics(
      root,
      "[data-pane='premark']",
      ".pmd-block",
      ".pmd-line,.pmd-code,.pmd-table,.pmd-html,.pmd-image",
    ),
    overlay: collectPaneMetrics(
      root,
      "[data-pane='overlay']",
      ".cm-line,.pm-cm-preview-block",
      ".cm-line,.pm-cm-preview-block",
      {
        collectVisualLineRects: true,
      },
    ),
  };
}

function collectActiveEditMetrics(root: HTMLElement): ActiveEditMetrics {
  if (activeEditor === undefined) {
    return {
      mode: null,
      caret: null,
      selection: [],
    };
  }

  const pane = root.querySelector<HTMLElement>("[data-pane='overlay']")!;
  const paneRect = pane.getBoundingClientRect();
  const mode = getActiveEditMode();
  const head = activeEditor.state.selection.main.head;
  const caretRect = activeEditor.coordsAtPos(head);
  const selectionRects: RectMetrics[] = [];
  const selection = window.getSelection();

  if (selection !== null) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      selectionRects.push(
        ...Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .map((rect, rectIndex) => createRectMetrics(rectIndex, "", rect, paneRect)),
      );
    }
  }

  return {
    mode,
    caret: caretRect === null ? null : createRectMetrics(0, "", toRectLike(caretRect), paneRect),
    selection: selectionRects,
  };
}

function applyActiveEditState(fixture: VisualParityFixture): void {
  if (activeEditor === undefined) {
    return;
  }

  const mode = getActiveEditMode();
  if (mode === null) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const fallbackPosition = Math.min(
    fixture.markdown.length,
    Math.max(0, fixture.markdown.search(/\S/u)),
  );
  const anchor = readNumberParam(
    params,
    "anchor",
    readNumberParam(params, "pos", fallbackPosition),
  );
  const head = readNumberParam(
    params,
    "head",
    mode === "selection" ? Math.min(fixture.markdown.length, anchor + 8) : anchor,
  );

  activeEditor.dispatch({
    selection: {
      anchor: clamp(anchor, 0, fixture.markdown.length),
      head: clamp(head, 0, fixture.markdown.length),
    },
  });
  activeEditor.focus();
}

function getActiveEditMode(): "caret" | "selection" | null {
  const value = new URLSearchParams(window.location.search).get("edit");
  return value === "caret" || value === "selection" ? value : null;
}

function getActiveZoom(): number {
  const value = Number(new URLSearchParams(window.location.search).get("zoom") ?? "1");
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function getActiveTheme(): VisualParityTheme {
  return new URLSearchParams(window.location.search).get("theme") === "dark" ? "dark" : "light";
}

function readNumberParam(params: URLSearchParams, key: string, fallback: number): number {
  const value = Number(params.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function collectPaneMetrics(
  root: HTMLElement,
  paneSelector: string,
  blockSelector: string,
  lineSelector: string,
  options: {
    collectVisualLineRects?: boolean;
  } = {},
): PaneMetrics {
  const pane = root.querySelector<HTMLElement>(paneSelector)!;
  const paneRect = pane.getBoundingClientRect();
  const blocks = collectRects(pane, paneRect, blockSelector);
  const lines =
    options.collectVisualLineRects === true
      ? collectVisualLineRects(pane, paneRect, lineSelector)
      : collectRects(pane, paneRect, lineSelector);

  return {
    blocks,
    lines,
    height: round(paneRect.height),
    width: round(paneRect.width),
  };
}

function collectVisualLineRects(
  root: HTMLElement,
  paneRect: DOMRect,
  selector: string,
): RectMetrics[] {
  const output: RectMetrics[] = [];
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector));

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]!;
    if (getComputedStyle(element).display === "none") {
      continue;
    }
    if (element.classList.contains("pm-cm-code-fence-line")) {
      continue;
    }
    if (element.classList.contains("pm-cm-code-line")) {
      const codeRects: DOMRect[] = [];
      let cursor = index;
      while (
        cursor < elements.length &&
        (elements[cursor]!.classList.contains("pm-cm-code-line") ||
          elements[cursor]!.classList.contains("pm-cm-code-fence-line"))
      ) {
        if (elements[cursor]!.classList.contains("pm-cm-code-fence-line")) {
          cursor += 1;
          continue;
        }
        codeRects.push(elements[cursor]!.getBoundingClientRect());
        cursor += 1;
      }
      output.push(
        createRectMetrics(
          output.length,
          elements
            .slice(index, cursor)
            .map((entry) => entry.textContent ?? "")
            .join("\n"),
          unionRects(codeRects),
          paneRect,
        ),
      );
      index = cursor - 1;
      continue;
    }

    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight) || 0;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = groupLineRects(
      Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0),
      lineHeight,
    );
    range.detach();

    if (rects.length === 0) {
      const rect = element.getBoundingClientRect();
      output.push(createRectMetrics(output.length, element.textContent ?? "", rect, paneRect));
      continue;
    }

    for (const rect of rects) {
      output.push(createRectMetrics(output.length, element.textContent ?? "", rect, paneRect));
    }
  }

  return output;
}

function unionRects(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function groupLineRects(rects: DOMRect[], lineHeight: number): DOMRect[] {
  const groups: Array<{
    top: number;
    left: number;
    right: number;
    height: number;
  }> = [];

  for (const rect of rects) {
    const adjustedTop =
      lineHeight > rect.height ? rect.top - (lineHeight - rect.height) / 2 : rect.top;
    const group = groups.find((entry) => Math.abs(entry.top - adjustedTop) < 2);
    if (group === undefined) {
      groups.push({
        top: adjustedTop,
        left: rect.left,
        right: rect.right,
        height: Math.max(lineHeight, rect.height),
      });
      continue;
    }

    group.left = Math.min(group.left, rect.left);
    group.right = Math.max(group.right, rect.right);
    group.height = Math.max(group.height, lineHeight, rect.height);
  }

  return groups.map(
    (group) =>
      ({
        top: group.top,
        bottom: group.top + group.height,
        left: group.left,
        right: group.right,
        width: group.right - group.left,
        height: group.height,
        x: group.left,
        y: group.top,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

function collectRects(root: HTMLElement, paneRect: DOMRect, selector: string): RectMetrics[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((element) => getComputedStyle(element).display !== "none")
    .map((element, index) => {
      const rect = element.getBoundingClientRect();
      return createRectMetrics(index, element.textContent ?? "", rect, paneRect);
    });
}

function createRectMetrics(
  index: number,
  text: string,
  rect: RectLike,
  paneRect: RectLike,
): RectMetrics {
  return {
    index,
    text: normalizeText(text),
    top: round(rect.top - paneRect.top),
    left: round(rect.left - paneRect.left),
    width: round(rect.width),
    height: round(rect.height),
  };
}

function toRectLike(rect: { top: number; left: number; right: number; bottom: number }): RectLike {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
