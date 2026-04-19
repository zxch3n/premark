import { createHighlighter } from "@pretext-md/highlight";
import { renderToHtml } from "@pretext-md/html-renderer";
import {
  createAnimationFrameStreamBatcher,
  createWorkspaceEngine,
  type WorkspaceDocument,
} from "@pretext-md/workspace";
import type { BlockLayout } from "@pretext-md/layout";
import type { ViewUpdate } from "@codemirror/view";

import { createCodeMirrorOverlay } from "../visual-parity/codemirror-overlay.ts";

import "./canvas-editor.css";

interface ActiveOverlay {
  readonly host: EditableOverlayHost;
  readonly originalMarkdown: string;
  sourceFrom: number;
  sourceTo: number;
  blockIndex: number;
  composing: boolean;
}

interface CanvasEditorImeEvent {
  readonly type: string;
  readonly data: string | null;
  readonly inputType: string | null;
  readonly key: string | null;
  readonly isComposing: boolean;
  readonly text: string;
}

interface CanvasEditorApi {
  commit: () => void;
  cancel: () => void;
  activeBlockIndex: () => number | null;
  activeOverlayHostId: () => string | null;
  activeText: () => string | null;
  clearImeEvents: () => void;
  imeEvents: () => CanvasEditorImeEvent[];
  markdown: () => string;
  rerender: () => void;
  streamOtherDocument: () => void;
  streamSameDocument: () => void;
}

declare global {
  interface Window {
    __premarkCanvasEditor?: CanvasEditorApi;
  }
}

const docId = "demo";
const otherDocId = "assistant-stream";
const highlighter = createHighlighter();
const workspace = createWorkspaceEngine({
  containerWidth: 640,
  snippetContextBlocks: 1,
});
const streamBatcher = createAnimationFrameStreamBatcher(workspace);

let activeOverlay: ActiveOverlay | null = null;
let streamingBlockId: string | null = null;
let nextOverlayId = 1;
const imeEvents: CanvasEditorImeEvent[] = [];
let markdown = `# Rendered Canvas Editing

Workspace search can return rendered Markdown snippets instead of raw source lines.

Click a rendered block to edit it in-place. CodeMirror owns input, selection, undo, paste and IME while Premark keeps the rendered canvas state.

> The active editor is an overlay anchored to the rendered block.

- Search rendered text
- Keep canvas panning cheap
- Stream AI into other blocks

\`\`\`ts
export const mode = "overlay"
\`\`\`
`;

export function mountCanvasEditorApp(root: HTMLElement): void {
  root.className = "canvas-editor-root";
  root.innerHTML = `
    <aside class="canvas-editor-sidebar">
      <div>
        <p class="canvas-editor-eyebrow">rendered canvas</p>
        <h1>Markdown Workspace</h1>
        <p class="canvas-editor-copy">Click any rendered block and edit it in place.</p>
      </div>
      <label class="canvas-editor-field">
        <span>Width</span>
        <input data-width type="range" min="360" max="880" step="1" value="640" />
        <output data-width-value>640px</output>
      </label>
      <label class="canvas-editor-field">
        <span>Zoom</span>
        <input data-zoom type="range" min="0.75" max="1.6" step="0.05" value="1" />
        <output data-zoom-value>1.00x</output>
      </label>
      <label class="canvas-editor-field">
        <span>Rendered search</span>
        <input data-search type="search" value="canvas" />
      </label>
      <div class="canvas-editor-stats">
        <div><span>Blocks</span><strong data-blocks>0</strong></div>
        <div><span>Height</span><strong data-height>0px</strong></div>
        <div><span>Results</span><strong data-results>0</strong></div>
      </div>
      <div class="canvas-editor-actions">
        <button data-commit-overlay type="button" disabled>Commit</button>
        <button data-cancel-overlay type="button" disabled>Cancel</button>
        <button data-stream-ai type="button">Stream</button>
        <button data-stream-other type="button">Other Doc</button>
      </div>
    </aside>
    <main class="canvas-editor-stage">
      <div class="canvas-editor-viewport" data-canvas-viewport>
        <div class="canvas-editor-layer" data-canvas-layer>
          <div class="canvas-editor-surface" data-canvas-surface></div>
          <div class="canvas-editor-overlay-layer" data-overlay-layer></div>
        </div>
      </div>
      <section class="canvas-editor-other-doc">
        <header>Other document stream</header>
        <div data-other-doc-surface></div>
      </section>
      <aside class="canvas-editor-results" data-search-results></aside>
    </main>
  `;

  const widthInput = root.querySelector<HTMLInputElement>("[data-width]")!;
  const zoomInput = root.querySelector<HTMLInputElement>("[data-zoom]")!;
  const searchInput = root.querySelector<HTMLInputElement>("[data-search]")!;
  const commitButton = root.querySelector<HTMLButtonElement>("[data-commit-overlay]")!;
  const cancelButton = root.querySelector<HTMLButtonElement>("[data-cancel-overlay]")!;
  const streamButton = root.querySelector<HTMLButtonElement>("[data-stream-ai]")!;
  const streamOtherButton = root.querySelector<HTMLButtonElement>("[data-stream-other]")!;

  workspace.loadDocuments([
    {
      id: docId,
      title: "Demo",
      markdown,
    },
    {
      id: otherDocId,
      title: "Assistant Stream",
      markdown: "# Assistant Stream\n\nAI output target.",
    },
  ]);

  widthInput.addEventListener("input", () => {
    workspace.resize(Number(widthInput.value));
    render(root);
  });
  zoomInput.addEventListener("input", () => render(root));
  searchInput.addEventListener("input", () => renderSearch(root));
  commitButton.addEventListener("click", () => commitOverlay(root));
  cancelButton.addEventListener("click", () => cancelOverlay(root));
  streamButton.addEventListener("click", () => streamAiChunk(root));
  streamOtherButton.addEventListener("click", () => streamOtherDocumentChunk(root));

  window.__premarkCanvasEditor = {
    commit: () => commitOverlay(root),
    cancel: () => cancelOverlay(root),
    activeBlockIndex: () => activeOverlay?.blockIndex ?? null,
    activeOverlayHostId: () => activeOverlay?.host.id() ?? null,
    activeText: () => activeOverlay?.host.text() ?? null,
    clearImeEvents: () => {
      imeEvents.length = 0;
    },
    imeEvents: () => [...imeEvents],
    markdown: () => markdown,
    rerender: () => render(root),
    streamOtherDocument: () => streamOtherDocumentChunk(root),
    streamSameDocument: () => streamAiChunk(root),
  };

  render(root);
  root.setAttribute("data-canvas-editor-ready", "true");
}

function render(root: HTMLElement): void {
  const widthInput = root.querySelector<HTMLInputElement>("[data-width]")!;
  const zoomInput = root.querySelector<HTMLInputElement>("[data-zoom]")!;
  const widthValue = root.querySelector<HTMLOutputElement>("[data-width-value]")!;
  const zoomValue = root.querySelector<HTMLOutputElement>("[data-zoom-value]")!;
  const blocksValue = root.querySelector<HTMLElement>("[data-blocks]")!;
  const heightValue = root.querySelector<HTMLElement>("[data-height]")!;
  const layer = root.querySelector<HTMLElement>("[data-canvas-layer]")!;
  const surface = root.querySelector<HTMLElement>("[data-canvas-surface]")!;
  const document = requireDocument();
  const rendered = renderToHtml(document.layout, {
    codeThemeCss: highlighter.getThemeCss("dark"),
  });
  const width = Number(widthInput.value);
  const zoom = Number(zoomInput.value);

  widthValue.value = `${width}px`;
  zoomValue.value = `${zoom.toFixed(2)}x`;
  blocksValue.textContent = String(document.records.length);
  heightValue.textContent = `${Math.round(document.layout.totalHeight)}px`;

  layer.style.width = `${width}px`;
  layer.style.height = `${document.layout.totalHeight}px`;
  layer.style.transform = `scale(${zoom})`;
  surface.style.width = `${width}px`;
  surface.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
  attachBlockMetadata(surface, document);
  bindBlockOpen(root, surface);
  updateOverlayPosition(root);
  updateActionState(root);
  renderOtherDocument(root);
  renderSearch(root);
}

function renderSearch(root: HTMLElement): void {
  const searchInput = root.querySelector<HTMLInputElement>("[data-search]")!;
  const resultsValue = root.querySelector<HTMLElement>("[data-results]")!;
  const resultsEl = root.querySelector<HTMLElement>("[data-search-results]")!;
  const results = workspace.search(searchInput.value, {
    limit: 8,
  });

  resultsValue.textContent = String(results.length);
  resultsEl.innerHTML = results
    .map((result) => {
      const snippet = workspace.renderSearchResultSnippet(result, {
        width: 420,
      });
      const rendered = renderToHtml(snippet.layout, {
        codeThemeCss: highlighter.getThemeCss("dark"),
      });
      return `<article class="canvas-editor-result">
        <strong>${escapeHtml(result.headingPath.at(-1) ?? result.docId)}</strong>
        <div>${escapeHtml(result.matchType)}</div>
        <section>${`<style>${rendered.css}</style>${rendered.html}`}</section>
      </article>`;
    })
    .join("");
}

function renderOtherDocument(root: HTMLElement): void {
  const surface = root.querySelector<HTMLElement>("[data-other-doc-surface]")!;
  const document = workspace.getDocument(otherDocId);
  if (document === null) {
    surface.textContent = "";
    return;
  }
  const rendered = renderToHtml(document.layout, {
    codeThemeCss: highlighter.getThemeCss("dark"),
  });
  surface.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
}

function attachBlockMetadata(surface: HTMLElement, document: WorkspaceDocument): void {
  surface.querySelectorAll<HTMLElement>(".pmd-block").forEach((block, index) => {
    const record = document.records[index];
    block.dataset.blockIndex = String(index);
    if (record !== undefined) {
      block.dataset.blockId = record.id;
    }
    block.toggleAttribute("data-active-block", activeOverlay?.blockIndex === index);
    block.toggleAttribute("data-streaming-block", streamingBlockId === record?.id);
  });
}

function bindBlockOpen(root: HTMLElement, surface: HTMLElement): void {
  surface.querySelectorAll<HTMLElement>(".pmd-block").forEach((block) => {
    block.addEventListener("click", (event) => {
      const index = Number((event.currentTarget as HTMLElement).dataset.blockIndex);
      openOverlay(root, index);
    });
  });
}

function openOverlay(root: HTMLElement, blockIndex: number): void {
  if (activeOverlay?.composing === true) {
    return;
  }

  destroyOverlay();
  const document = requireDocument();
  const record = document.records[blockIndex];
  const blockLayout = document.layout.blocks[blockIndex];
  const overlayLayer = root.querySelector<HTMLElement>("[data-overlay-layer]")!;
  if (record === undefined || blockLayout === undefined) {
    return;
  }

  const host = new EditableOverlayHost(overlayLayer);
  const source = markdown.slice(record.source.from, record.source.to);
  activeOverlay = {
    host,
    originalMarkdown: markdown,
    sourceFrom: record.source.from,
    sourceTo: record.source.to,
    blockIndex,
    composing: false,
  };

  host.mount(source, getOverlayRect(blockLayout), {
    onChange: (_doc, update) => applyOverlayChange(root, update),
    onImeEvent: (event) => recordImeEvent(event),
    onCompositionStart: () => {
      if (activeOverlay !== null) {
        activeOverlay.composing = true;
      }
    },
    onCompositionEnd: () => {
      if (activeOverlay !== null) {
        activeOverlay.composing = false;
        render(root);
      }
    },
  });
  updateActionState(root);
  render(root);
}

function applyOverlayChange(root: HTMLElement, update: ViewUpdate): void {
  if (activeOverlay === null) {
    return;
  }

  const changes: Array<{
    from: number;
    to: number;
    text: string;
  }> = [];
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changes.push({
      from: activeOverlay!.sourceFrom + fromA,
      to: activeOverlay!.sourceFrom + toA,
      text: inserted.toString(),
    });
  });

  let nextMarkdown = markdown;
  let delta = 0;
  for (const change of [...changes].reverse()) {
    nextMarkdown = `${nextMarkdown.slice(0, change.from)}${change.text}${nextMarkdown.slice(change.to)}`;
    delta += change.text.length - (change.to - change.from);
  }

  activeOverlay.sourceTo += delta;
  markdown = nextMarkdown;
  workspace.upsertDocument({
    id: docId,
    title: "Demo",
    markdown,
  });
  syncActiveBlockIndex();

  if (!activeOverlay.composing) {
    render(root);
  }
}

function syncActiveBlockIndex(): void {
  if (activeOverlay === null) {
    return;
  }

  const document = requireDocument();
  const index = document.records.findIndex(
    (record) =>
      activeOverlay !== null &&
      record.source.from <= activeOverlay.sourceFrom &&
      activeOverlay.sourceFrom <= record.source.to,
  );
  activeOverlay.blockIndex = Math.max(0, index);
}

function updateOverlayPosition(root: HTMLElement): void {
  if (activeOverlay === null) {
    return;
  }

  const document = requireDocument();
  const blockLayout = document.layout.blocks[activeOverlay.blockIndex];
  if (blockLayout === undefined) {
    return;
  }

  activeOverlay.host.setRect(getOverlayRect(blockLayout));
  root
    .querySelectorAll<HTMLElement>(".pmd-block")
    .forEach((block, index) =>
      block.toggleAttribute("data-active-block", index === activeOverlay?.blockIndex),
    );
}

function commitOverlay(root: HTMLElement): void {
  destroyOverlay();
  render(root);
}

function cancelOverlay(root: HTMLElement): void {
  if (activeOverlay !== null) {
    markdown = activeOverlay.originalMarkdown;
    workspace.upsertDocument({
      id: docId,
      title: "Demo",
      markdown,
    });
  }
  destroyOverlay();
  render(root);
}

function streamAiChunk(root: HTMLElement): void {
  const document = requireDocument();
  const target =
    document.records.find(
      (record, index) => record.type === "code-block" && index !== activeOverlay?.blockIndex,
    ) ??
    document.records.find((_record, index) => index !== activeOverlay?.blockIndex) ??
    document.records.at(-1);
  if (target === undefined) {
    return;
  }

  const targetOffset = target.source.from;
  streamingBlockId = target.id;
  streamBatcher.enqueue({
    docId,
    targetBlockId: target.id,
    chunk: target.type === "code-block" ? "\n// streamed chunk" : " streamed chunk",
  });
  requestAnimationFrame(() => {
    const updatedDocument = requireDocument();
    markdown = updatedDocument.markdown;
    streamingBlockId =
      updatedDocument.records.find(
        (record) => record.source.from <= targetOffset && targetOffset <= record.source.to,
      )?.id ?? target.id;
    render(root);
    window.setTimeout(() => {
      streamingBlockId = null;
      render(root);
    }, 420);
  });
}

function streamOtherDocumentChunk(root: HTMLElement): void {
  const otherDocument = workspace.getDocument(otherDocId);
  const target = otherDocument?.records.find((record) => record.type === "paragraph");
  if (otherDocument === null || target === undefined) {
    return;
  }

  streamBatcher.enqueue({
    docId: otherDocId,
    targetBlockId: target.id,
    chunk: " cross document chunk",
  });
  requestAnimationFrame(() => {
    renderOtherDocument(root);
    renderSearch(root);
  });
}

function destroyOverlay(): void {
  activeOverlay?.host.destroy();
  activeOverlay = null;
}

function updateActionState(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>("[data-commit-overlay]")!.disabled = activeOverlay === null;
  root.querySelector<HTMLButtonElement>("[data-cancel-overlay]")!.disabled = activeOverlay === null;
}

function getOverlayRect(block: BlockLayout): DOMRectReadOnly {
  return {
    x: block.contentBox.x,
    y: block.y,
    width: block.contentBox.width,
    height: Math.max(block.height, 52),
    top: block.y,
    left: block.contentBox.x,
    right: block.contentBox.x + block.contentBox.width,
    bottom: block.y + Math.max(block.height, 52),
    toJSON: () => ({}),
  };
}

function requireDocument(): WorkspaceDocument {
  const document = workspace.getDocument(docId);
  if (document === null) {
    throw new Error("Canvas editor document is not loaded");
  }
  return document;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function recordImeEvent(event: Event): void {
  const data =
    "data" in event && typeof event.data === "string"
      ? event.data
      : "data" in event && event.data === null
        ? null
        : null;
  const inputType =
    "inputType" in event && typeof event.inputType === "string" ? event.inputType : null;
  const key = "key" in event && typeof event.key === "string" ? event.key : null;
  const isComposing =
    "isComposing" in event && typeof event.isComposing === "boolean"
      ? event.isComposing
      : activeOverlay?.composing === true;

  imeEvents.push({
    type: event.type,
    data,
    inputType,
    key,
    isComposing,
    text: activeOverlay?.host.text() ?? "",
  });
  if (imeEvents.length > 200) {
    imeEvents.splice(0, imeEvents.length - 200);
  }
}

class EditableOverlayHost {
  private element: HTMLElement | null = null;

  private editor: ReturnType<typeof createCodeMirrorOverlay> | null = null;

  constructor(private readonly parent: HTMLElement) {}

  mount(
    doc: string,
    rect: DOMRectReadOnly,
    callbacks: {
      readonly onChange: (doc: string, update: ViewUpdate) => void;
      readonly onImeEvent: (event: Event) => void;
      readonly onCompositionStart: () => void;
      readonly onCompositionEnd: () => void;
    },
  ): void {
    this.destroy();
    const element = document.createElement("div");
    element.className = "editable-overlay-host";
    element.dataset.overlayId = String(nextOverlayId);
    nextOverlayId += 1;
    this.parent.append(element);
    this.element = element;
    this.setRect(rect);

    this.editor = createCodeMirrorOverlay(element, doc, {
      onChange: callbacks.onChange,
    });
    this.editor.contentDOM.addEventListener("beforeinput", callbacks.onImeEvent);
    this.editor.contentDOM.addEventListener("input", callbacks.onImeEvent);
    this.editor.contentDOM.addEventListener("compositionupdate", callbacks.onImeEvent);
    this.editor.contentDOM.addEventListener("keydown", callbacks.onImeEvent);
    this.editor.contentDOM.addEventListener("keyup", callbacks.onImeEvent);
    this.editor.contentDOM.addEventListener("compositionstart", (event) => {
      callbacks.onImeEvent(event);
      callbacks.onCompositionStart();
    });
    this.editor.contentDOM.addEventListener("compositionend", (event) => {
      callbacks.onImeEvent(event);
      callbacks.onCompositionEnd();
    });
    this.editor.focus();
  }

  id(): string | null {
    return this.element?.dataset.overlayId ?? null;
  }

  text(): string | null {
    return this.editor?.state.doc.toString() ?? null;
  }

  setRect(rect: DOMRectReadOnly): void {
    if (this.element === null) {
      return;
    }

    this.element.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    this.element.style.width = `${rect.width}px`;
    this.element.style.minHeight = `${rect.height}px`;
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = null;
    this.element?.remove();
    this.element = null;
  }
}
