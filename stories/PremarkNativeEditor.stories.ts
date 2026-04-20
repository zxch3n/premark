import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import {
  applyInputIntent,
  applyTextareaBridgeChange,
  beginPointerSelection,
  createInMemoryEditorDocumentState,
  createPremarkEditorController,
  createTextareaBridgeSnapshot,
  LocalUndoManager,
  normalizeInputTrace,
  selectPointerRange,
  updatePointerSelection,
  type EditableLayoutIndex,
  type PointerSelectionSession,
  type TextareaBridgeSnapshot,
} from "../packages/editor/src/index.ts";
import { waitForPremarkStoryFonts } from "./font-loading.ts";

export default {
  title: "Editing/Premark Native Editor",
};

const sampleMarkdown = `# Native rendered Markdown

Click text, drag across blocks, then type directly on the rendered surface.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Try **bold text**, \`inline code\`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.`;

const highlighter = createHighlighter();

export const InteractiveNativePrototype = () => {
  const root = document.createElement("div");
  const searchParams = new URL(window.location.href).searchParams;
  const screenshotMode = searchParams.get("screenshot") === "1";
  root.className = screenshotMode ? "pne-root pne-screenshot-mode" : "pne-root";
  root.dataset.fontsReady = "0";

  async function initialize() {
    await waitForPremarkStoryFonts();
    root.dataset.fontsReady = "1";
    const editor = createInMemoryEditorDocumentState(sampleMarkdown, 720, {
      fontTheme: "modern",
      highlighter,
    });
    const undoManager = new LocalUndoManager();
    const controller = createPremarkEditorController({ state: editor, undoManager });

    let bridgeSnapshot: TextareaBridgeSnapshot = createTextareaBridgeSnapshot(editor);
    let pointerSession: PointerSelectionSession | null = null;
    let composing = false;
    let currentEditableIndex: EditableLayoutIndex = editor.editableIndex;
    let pointerClickCount = 0;
    let lastPointerClick: {
      readonly time: number;
      readonly x: number;
      readonly y: number;
    } | null = null;
    let renderedStyleElement: HTMLStyleElement | null = null;
    let renderedDocumentElement: HTMLElement | null = null;
    let renderedSurfaceElement: HTMLElement | null = null;

    root.innerHTML = `
    <style>${storyCss}</style>
    <div class="pne-shell">
      <main class="pne-editor-wrap">
        <div class="pne-toolbar">
          <strong>Premark native editor</strong>
          <span>rendered surface</span>
        </div>
        <div class="pne-viewport">
          <div class="pne-surface" data-editor-surface></div>
          <div class="pne-overlay" data-editor-overlay></div>
          <textarea class="pne-input-bridge" data-input-bridge aria-label="Native editor input bridge"></textarea>
        </div>
      </main>
      <aside class="pne-debug">
        <section>
          <h2>Selection</h2>
          <pre data-debug-selection></pre>
        </section>
        <section>
          <h2>Markdown source</h2>
          <pre data-debug-source></pre>
        </section>
      </aside>
    </div>
  `;

    const surface = root.querySelector<HTMLDivElement>("[data-editor-surface]")!;
    const overlay = root.querySelector<HTMLDivElement>("[data-editor-overlay]")!;
    const textarea = root.querySelector<HTMLTextAreaElement>("[data-input-bridge]")!;
    const debugSelection = root.querySelector<HTMLPreElement>("[data-debug-selection]")!;
    const debugSource = root.querySelector<HTMLPreElement>("[data-debug-source]")!;

    function render() {
      const view = controller.renderSnapshot();
      const layout = view.layout;
      currentEditableIndex = view.editableIndex;
      const rendered = renderToHtml(layout, {
        codeThemeCss: highlighter.getThemeCss("dark"),
      });
      surface.style.width = `${layout.containerWidth}px`;
      surface.style.height = `${layout.totalHeight}px`;
      overlay.style.width = `${layout.containerWidth}px`;
      overlay.style.height = `${layout.totalHeight}px`;
      renderSurfaceHtml(rendered);
      overlay.innerHTML = renderSelectionOverlay(currentEditableIndex, view.compositionRects);
      debugSelection.textContent = JSON.stringify(
        createStorySelectionGeometry(currentEditableIndex),
        null,
        2,
      );
      debugSource.textContent = controller.markdown();
      syncTextareaBridge();
    }

    function renderSurfaceHtml(rendered: { html: string; css: string }) {
      if (!surfaceOwnsRenderedTree()) {
        surface.replaceChildren();
        renderedStyleElement = null;
        renderedDocumentElement = null;
        renderedSurfaceElement = null;
      }

      if (renderedStyleElement === null) {
        renderedStyleElement = document.createElement("style");
        renderedStyleElement.dataset.premarkRenderer = "style";
        surface.append(renderedStyleElement);
      }
      renderedStyleElement.textContent = rendered.css;

      const nextDocument = parseRenderedDocument(rendered.html);
      const nextSurface = nextDocument.querySelector<HTMLElement>(".pmd-surface");
      if (nextSurface === null) {
        throw new Error("Rendered Premark document is missing .pmd-surface");
      }

      if (renderedDocumentElement === null || renderedSurfaceElement === null) {
        renderedDocumentElement = nextDocument;
        renderedSurfaceElement = nextSurface;
        surface.append(renderedDocumentElement);
        return;
      }

      syncElementAttributes(renderedDocumentElement, nextDocument);
      syncElementAttributes(renderedSurfaceElement, nextSurface);
      renderedSurfaceElement.replaceChildren(...Array.from(nextSurface.childNodes));
    }

    function surfaceOwnsRenderedTree(): boolean {
      return (
        (renderedStyleElement === null || renderedStyleElement.parentElement === surface) &&
        (renderedDocumentElement === null ||
          (renderedDocumentElement.parentElement === surface &&
            renderedSurfaceElement !== null &&
            renderedDocumentElement.contains(renderedSurfaceElement)))
      );
    }

    function parseRenderedDocument(html: string): HTMLElement {
      const template = document.createElement("template");
      template.innerHTML = html;
      const documentElement = template.content.firstElementChild;
      if (!(documentElement instanceof HTMLElement)) {
        throw new Error("Rendered Premark document is empty");
      }
      return documentElement;
    }

    function syncElementAttributes(target: HTMLElement, source: HTMLElement) {
      for (const attribute of Array.from(target.attributes)) {
        target.removeAttribute(attribute.name);
      }
      for (const attribute of Array.from(source.attributes)) {
        target.setAttribute(attribute.name, attribute.value);
      }
    }

    function createStorySelectionGeometry(index: EditableLayoutIndex) {
      const resolved = editor.adapter.resolveRange(editor.selection.range);
      const range = {
        from: resolved.from,
        to: resolved.to,
      };
      const anchorCaret = index.sourceOffsetToCaretRect(resolved.anchor, "before");
      const headCaret = index.sourceOffsetToCaretRect(resolved.head, "after");
      return {
        range,
        anchorOffset: resolved.anchor,
        headOffset: resolved.head,
        direction: resolved.direction,
        isCollapsed: resolved.isCollapsed,
        selectionRects: resolved.isCollapsed ? [] : index.sourceRangeToSelectionRects(range),
        caret: resolved.isCollapsed ? headCaret : null,
        anchorCaret,
        headCaret,
      };
    }

    function syncTextareaBridge() {
      const compositionCaret = compositionCaretRect();
      const geometry = createStorySelectionGeometry(currentEditableIndex);
      const fallbackCaret = geometry.caret ?? geometry.headCaret;
      const caretRect = compositionCaret ?? fallbackCaret.rect;
      bridgeSnapshot = createTextareaBridgeSnapshot(editor);
      textarea.value = bridgeSnapshot.value;
      textarea.setSelectionRange(bridgeSnapshot.selectionStart, bridgeSnapshot.selectionEnd);
      textarea.style.left = `${28 + Math.max(0, caretRect.x)}px`;
      textarea.style.top = `${28 + Math.max(0, caretRect.y)}px`;
      textarea.style.height = `${Math.max(16, caretRect.height)}px`;
    }

    function renderSelectionOverlay(
      editableIndex: EditableLayoutIndex,
      compositionRects: readonly { x: number; y: number; width: number; height: number }[],
    ): string {
      const composition = renderCompositionOverlay(compositionRects);
      if (editor.compositionView !== null) {
        const caret = compositionCaretRect();
        const caretHtml =
          caret === null
            ? ""
            : `<div class="pne-caret" style="left:${caret.x}px;top:${caret.y}px;height:${caret.height}px"></div>`;
        return `${composition}${caretHtml}`;
      }

      const geometry = createStorySelectionGeometry(editableIndex);
      const selection = geometry.selectionRects
        .map(
          (rect) =>
            `<div class="pne-selection" style="left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px"></div>`,
        )
        .join("");
      const caret = geometry.caret;
      const caretHtml =
        caret === null
          ? ""
          : `<div class="pne-caret" style="left:${caret.rect.x}px;top:${caret.rect.y}px;height:${caret.rect.height}px"></div>`;
      return `${selection}${composition}${caretHtml}`;
    }

    function compositionCaretRect() {
      const view = editor.compositionView;
      if (view === null) {
        return null;
      }
      return currentEditableIndex.sourceOffsetToCaretRect(
        view.replacementRange.from + view.preeditText.length,
      ).rect;
    }

    function renderCompositionOverlay(
      compositionRects: readonly { x: number; y: number; width: number; height: number }[],
    ): string {
      const view = editor.compositionView;
      if (view === null || view.preeditText.length === 0) {
        return "";
      }

      return compositionRects
        .map(
          (rect) =>
            `<div class="pne-composition" style="left:${rect.x}px;top:${rect.y + rect.height - 3}px;width:${rect.width}px"></div>`,
        )
        .join("");
    }

    function pointFromEvent(event: MouseEvent): { x: number; y: number } {
      const rect = surface.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }

    function clickCountFromPointer(event: PointerEvent, point: { x: number; y: number }): number {
      if (
        lastPointerClick !== null &&
        event.timeStamp - lastPointerClick.time < 500 &&
        Math.hypot(point.x - lastPointerClick.x, point.y - lastPointerClick.y) < 6
      ) {
        pointerClickCount += 1;
      } else {
        pointerClickCount = 1;
      }
      lastPointerClick = {
        time: event.timeStamp,
        x: point.x,
        y: point.y,
      };
      return Math.max(event.detail, pointerClickCount);
    }

    surface.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = pointFromEvent(event);
      const clickCount = clickCountFromPointer(event, point);
      if (clickCount >= 3) {
        selectPointerRange(editor, point.x, point.y, "block", currentEditableIndex);
        pointerSession = null;
        textarea.focus();
        render();
        return;
      }
      if (clickCount === 2) {
        selectPointerRange(editor, point.x, point.y, "word", currentEditableIndex);
        pointerSession = null;
        textarea.focus();
        render();
        return;
      }
      pointerSession = beginPointerSelection(editor, point.x, point.y, currentEditableIndex);
      textarea.focus();
      render();
    });

    surface.addEventListener("click", (event) => {
      if (event.detail < 2) {
        return;
      }
      const point = pointFromEvent(event);
      selectPointerRange(
        editor,
        point.x,
        point.y,
        event.detail >= 3 ? "block" : "word",
        currentEditableIndex,
      );
      pointerSession = null;
      textarea.focus();
      render();
    });

    window.addEventListener("pointermove", (event) => {
      if (pointerSession === null) {
        return;
      }
      const point = pointFromEvent(event);
      updatePointerSelection(editor, pointerSession, point.x, point.y, currentEditableIndex);
      render();
    });

    window.addEventListener("pointerup", () => {
      pointerSession = null;
    });

    textarea.addEventListener("keydown", (event) => {
      const intent = normalizeInputTrace([
        {
          type: "keydown",
          key: event.key,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
        },
      ])[0];
      if (intent?.type !== "keyboard-selection" && intent?.type !== "select-all") {
        return;
      }

      event.preventDefault();
      applyInputIntent(editor, intent, { undoManager });
      render();
    });

    textarea.addEventListener("beforeinput", (event) => {
      const intent = normalizeInputTrace([
        {
          type: "beforeinput",
          inputType: event.inputType,
          data: event.data,
          isComposing: event.isComposing,
          cancelable: event.cancelable,
        },
      ])[0];

      if (
        intent?.type !== "insert-paragraph" &&
        intent?.type !== "delete" &&
        intent?.type !== "history"
      ) {
        return;
      }

      event.preventDefault();
      applyInputIntent(editor, intent, { undoManager });
      render();
    });

    textarea.addEventListener("compositionstart", (event) => {
      composing = true;
      applyInputIntent(editor, { type: "composition-start" }, { undoManager });
      render();
      event.preventDefault();
    });

    textarea.addEventListener("compositionupdate", (event) => {
      if (!composing) {
        return;
      }
      applyInputIntent(editor, { type: "composition-update", text: event.data }, { undoManager });
      render();
    });

    textarea.addEventListener("compositionend", (event) => {
      composing = false;
      applyInputIntent(editor, { type: "composition-commit", text: event.data }, { undoManager });
      render();
    });

    textarea.addEventListener("paste", (event) => {
      event.preventDefault();
      applyInputIntent(
        editor,
        {
          type: "clipboard",
          action: "paste",
          markdown: event.clipboardData?.getData("text/markdown") || undefined,
          plainText: event.clipboardData?.getData("text/plain") || undefined,
          html: event.clipboardData?.getData("text/html") || undefined,
        },
        { undoManager },
      );
      render();
    });

    textarea.addEventListener("cut", (event) => {
      event.preventDefault();
      applyInputIntent(editor, { type: "clipboard", action: "cut" }, { undoManager });
      render();
    });

    textarea.addEventListener("input", () => {
      if (composing) {
        return;
      }
      const applied = applyTextareaBridgeChange(editor, bridgeSnapshot, textarea.value, {
        nextSelectionStart: textarea.selectionStart,
        nextSelectionEnd: textarea.selectionEnd,
      });
      if (applied !== null) {
        undoManager.recordApplied(editor.adapter, applied);
      }
      render();
    });

    (
      window as typeof window & {
        __premarkNativeEditor?: {
          markdown(): string;
          insertRemote(offset: number, text: string): void;
          resize(width: number): void;
          setSelection(anchor: number, head: number): void;
          setCaret(offset: number): void;
        };
      }
    ).__premarkNativeEditor = {
      markdown: () => controller.markdown(),
      insertRemote(offset, text) {
        controller.applyEdit({ type: "insert", offset, text }, { recordUndo: false });
        render();
      },
      resize(width) {
        controller.resize(width);
        render();
      },
      setSelection(anchor, head) {
        controller.setSelection(anchor, head);
        render();
      },
      setCaret(offset) {
        controller.setCaret(offset);
        render();
      },
    };

    render();
  }

  void initialize();
  return root;
};

const storyCss = `
  .pne-root {
    min-height: 100vh;
    background: #f4f7f2;
    color: #141511;
    font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
  }

  .pne-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 20px;
    padding: 24px;
  }

  .pne-editor-wrap,
  .pne-debug {
    border: 1px solid #cbd4c2;
    border-radius: 8px;
    background: #fbfcf8;
  }

  .pne-toolbar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid #d8dfd1;
  }

  .pne-toolbar strong {
    font-size: 14px;
  }

  .pne-toolbar span {
    color: #69705f;
    font-size: 12px;
  }

  .pne-viewport {
    position: relative;
    overflow: auto;
    min-height: 520px;
    padding: 28px;
  }

  .pne-surface {
    position: relative;
    z-index: 1;
    cursor: text;
  }

  .pne-overlay {
    position: absolute;
    inset: 28px auto auto 28px;
    z-index: 2;
    pointer-events: none;
  }

  .pne-selection {
    position: absolute;
    border-radius: 3px;
    background: rgba(52, 139, 99, 0.28);
  }

  .pne-caret {
    position: absolute;
    width: 2px;
    border-radius: 1px;
    background: #0f8a5f;
  }

  .pne-composition {
    position: absolute;
    height: 2px;
    border-radius: 1px;
    background: #0f8a5f;
  }

  .pne-input-bridge {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    width: 2px;
    min-width: 2px;
    padding: 0;
    border: 0;
    outline: 0;
    resize: none;
    overflow: hidden;
    opacity: 0.02;
    background: transparent;
    color: transparent;
    caret-color: transparent;
  }

  .pne-debug {
    display: grid;
    align-content: start;
    gap: 0;
    overflow: hidden;
  }

  .pne-debug section + section {
    border-top: 1px solid #d8dfd1;
  }

  .pne-debug h2 {
    margin: 0;
    padding: 12px 14px;
    color: #4f5a47;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .pne-debug pre {
    margin: 0;
    max-height: 340px;
    overflow: auto;
    padding: 14px;
    background: #eef3e9;
    color: #22251d;
    font: 12px/1.45 "IBM Plex Mono", "SFMono-Regular", monospace;
    white-space: pre-wrap;
  }

  @media (max-width: 960px) {
    .pne-shell {
      grid-template-columns: 1fr;
    }
  }

  .pne-screenshot-mode {
    min-height: auto;
    background: #fbfcf8;
  }

  .pne-screenshot-mode .pne-shell {
    width: 780px;
    grid-template-columns: 1fr;
    gap: 0;
    padding: 0;
  }

  .pne-screenshot-mode .pne-editor-wrap {
    border-radius: 0;
  }

  .pne-screenshot-mode .pne-toolbar {
    display: none;
  }

  .pne-screenshot-mode .pne-viewport {
    min-height: 420px;
    max-height: 420px;
  }

  .pne-screenshot-mode .pne-debug {
    display: none;
  }
`;
