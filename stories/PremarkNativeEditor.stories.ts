import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import {
  applyInputIntent,
  applyTextareaBridgeChange,
  beginPointerSelection,
  createInMemoryEditorDocumentState,
  createSelectionGeometry,
  createTextareaBridgeSnapshot,
  LocalUndoManager,
  normalizeInputTrace,
  updatePointerSelection,
  type PointerSelectionSession,
  type TextareaBridgeSnapshot,
} from "../packages/editor/src/index.ts";

export default {
  title: "Editing/Premark Native Editor",
};

const sampleMarkdown = `# Native rendered Markdown

Click text, drag across blocks, then type directly on the rendered surface.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Try **bold text**, \`inline code\`, 中文输入, and emoji 👨‍👩‍👧‍👦.`;

const highlighter = createHighlighter();

export const InteractiveNativePrototype = () => {
  const root = document.createElement("div");
  root.className = "pne-root";

  const editor = createInMemoryEditorDocumentState(sampleMarkdown, 720, {
    fontTheme: "modern",
    highlighter,
  });
  const undoManager = new LocalUndoManager();

  let bridgeSnapshot: TextareaBridgeSnapshot = createTextareaBridgeSnapshot(editor);
  let pointerSession: PointerSelectionSession | null = null;

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
    const rendered = renderToHtml(editor.layout, {
      codeThemeCss: highlighter.getThemeCss("dark"),
    });
    surface.style.width = `${editor.layout.containerWidth}px`;
    surface.style.height = `${editor.layout.totalHeight}px`;
    overlay.style.width = `${editor.layout.containerWidth}px`;
    overlay.style.height = `${editor.layout.totalHeight}px`;
    surface.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
    overlay.innerHTML = renderSelectionOverlay();
    debugSelection.textContent = JSON.stringify(createSelectionGeometry(editor), null, 2);
    debugSource.textContent = editor.markdown;
    syncTextareaBridge();
  }

  function syncTextareaBridge() {
    const geometry = createSelectionGeometry(editor);
    const caret = geometry.caret ?? geometry.headCaret;
    bridgeSnapshot = createTextareaBridgeSnapshot(editor);
    textarea.value = bridgeSnapshot.value;
    textarea.setSelectionRange(bridgeSnapshot.selectionStart, bridgeSnapshot.selectionEnd);
    textarea.style.left = `${28 + Math.max(0, caret.rect.x)}px`;
    textarea.style.top = `${28 + Math.max(0, caret.rect.y)}px`;
    textarea.style.height = `${Math.max(16, caret.rect.height)}px`;
  }

  function renderSelectionOverlay(): string {
    const geometry = createSelectionGeometry(editor);
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
    return `${selection}${caretHtml}`;
  }

  function pointFromEvent(event: PointerEvent): { x: number; y: number } {
    const rect = surface.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  surface.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const point = pointFromEvent(event);
    pointerSession = beginPointerSelection(editor, point.x, point.y);
    textarea.focus();
    render();
  });

  window.addEventListener("pointermove", (event) => {
    if (pointerSession === null) {
      return;
    }
    const point = pointFromEvent(event);
    updatePointerSelection(editor, pointerSession, point.x, point.y);
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
      },
    ])[0];
    if (intent?.type !== "keyboard-selection") {
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

  textarea.addEventListener("input", () => {
    const applied = applyTextareaBridgeChange(editor, bridgeSnapshot, textarea.value, {
      nextSelectionStart: textarea.selectionStart,
      nextSelectionEnd: textarea.selectionEnd,
    });
    if (applied !== null) {
      undoManager.recordApplied(editor.adapter, applied);
    }
    render();
  });

  render();
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

  .pne-input-bridge {
    position: absolute;
    z-index: 3;
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
`;
