import { createHighlighter } from "../packages/highlight/src/index.ts";
import { createPremarkHtmlRenderHost, renderToHtml } from "../packages/html-renderer/src/index.ts";
import {
  createInMemoryEditorDocumentState,
  createPremarkBrowserInputHost,
  createPremarkEditorController,
  createSelectionGeometry,
  LocalUndoManager,
  type EditableLayoutIndex,
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

    let currentEditableIndex: EditableLayoutIndex = editor.editableIndex;
    let inputHost: ReturnType<typeof createPremarkBrowserInputHost>;

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
    const htmlHost = createPremarkHtmlRenderHost(surface);

    function render(options: { readonly syncBridgeValue?: boolean } = {}) {
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
      htmlHost.render(rendered);
      overlay.innerHTML = renderSelectionOverlay(currentEditableIndex, view.compositionRects);
      debugSelection.textContent = JSON.stringify(
        createSelectionGeometry(editor, currentEditableIndex),
        null,
        2,
      );
      debugSource.textContent = controller.markdown();
      syncTextareaBridge({ writeValue: options.syncBridgeValue !== false });
    }

    function syncTextareaBridge(options: { readonly writeValue?: boolean } = {}) {
      const compositionCaret = compositionCaretRect();
      const geometry = createSelectionGeometry(editor, currentEditableIndex);
      const fallbackCaret = geometry.caret ?? geometry.headCaret;
      const caretRect = compositionCaret ?? fallbackCaret.rect;
      inputHost.syncBridge(caretRect, { writeValue: options.writeValue });
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

      const geometry = createSelectionGeometry(editor, editableIndex);
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

    inputHost = createPremarkBrowserInputHost({
      editor,
      undoManager,
      surface,
      textarea,
      editableIndex: () => currentEditableIndex,
      pointFromEvent,
      render,
      positionBridge(caretRect) {
        textarea.style.left = `${28 + Math.max(0, caretRect.x)}px`;
        textarea.style.top = `${28 + Math.max(0, caretRect.y)}px`;
        textarea.style.height = `${Math.max(16, caretRect.height)}px`;
      },
    });
    inputHost.install();

    (
      window as typeof window & {
        __premarkNativeEditor?: {
          markdown(): string;
          insertRemote(offset: number, text: string): void;
          resize(width: number): void;
          pointForSourceRange(from: number, to: number): { x: number; y: number };
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
      pointForSourceRange(from, to) {
        const fromCaret = currentEditableIndex.sourceOffsetToCaretRect(from);
        const toCaret = currentEditableIndex.sourceOffsetToCaretRect(to, "before");
        return {
          x: (fromCaret.rect.x + toCaret.rect.x) / 2,
          y: (fromCaret.rect.y + toCaret.rect.y) / 2 + fromCaret.rect.height / 2,
        };
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
