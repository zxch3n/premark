import { createHighlighter } from "../packages/highlight/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";
import {
  createIncrementalParseState,
  createMarkdownInlineSourceMap,
} from "../packages/parser/src/index.ts";
import {
  applyInputIntent,
  applyTextareaBridgeChange,
  beginPointerSelection,
  createActiveMarkerRevealMarkdown,
  createEditableLayoutIndex,
  createInMemoryEditorDocumentState,
  createSelectionGeometry,
  createTextareaBridgeSnapshot,
  LocalUndoManager,
  normalizeInputTrace,
  updatePointerSelection,
  type EditableLayoutIndex,
  type PointerSelectionSession,
  type TextareaBridgeSnapshot,
} from "../packages/editor/src/index.ts";
import { darkTilePalette, drawTile } from "../packages/wiki-canvas/src/index.ts";
import { waitForPremarkStoryFonts } from "./font-loading.ts";

export default {
  title: "Editing/Premark Canvas Native Editor",
};

const markdown = `# Canvas native editor

Click text, drag across blocks, then type directly on the rendered canvas.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Widths iiiii WWWW done.

Try **bold text**, \`inline code\`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.`;

const width = 780;
const height = 430;
const contentPadding = 28;
const editorWidth = width - contentPadding * 2;
const highlighter = createHighlighter();

export const InteractiveCanvasNativeEditor = () => {
  const root = document.createElement("div");
  root.className = "pcne-root";
  root.dataset.fontsReady = "0";
  root.innerHTML = `
    <style>
      .pcne-root {
        min-height: 100vh;
        background: #f4f7f2;
        color: #141511;
        font-family: "IBM Plex Sans", "Avenir Next", sans-serif;
      }

      .pcne-shell {
        display: grid;
        grid-template-columns: ${width}px 340px;
        gap: 20px;
        padding: 24px;
      }

      .pcne-editor {
        position: relative;
        width: ${width}px;
        height: ${height}px;
      }

      .pcne-canvas {
        display: block;
        width: ${width}px;
        height: ${height}px;
        cursor: text;
      }

      .pcne-input-bridge {
        position: absolute;
        z-index: 2;
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

      .pcne-debug {
        display: grid;
        align-content: start;
        border: 1px solid #cbd4c2;
        border-radius: 8px;
        overflow: hidden;
        background: #fbfcf8;
      }

      .pcne-debug section + section {
        border-top: 1px solid #d8dfd1;
      }

      .pcne-debug h2 {
        margin: 0;
        padding: 12px 14px;
        color: #4f5a47;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .pcne-debug pre {
        margin: 0;
        max-height: 240px;
        overflow: auto;
        padding: 14px;
        background: #eef3e9;
        color: #22251d;
        font: 12px/1.45 "IBM Plex Mono", "SFMono-Regular", monospace;
        white-space: pre-wrap;
      }
    </style>
    <div class="pcne-shell">
      <main class="pcne-editor">
        <canvas class="pcne-canvas" data-canvas-native-editor></canvas>
        <textarea class="pcne-input-bridge" data-canvas-input-bridge aria-label="Canvas native editor input bridge"></textarea>
      </main>
      <aside class="pcne-debug">
        <section>
          <h2>Selection</h2>
          <pre data-canvas-debug-selection></pre>
        </section>
        <section>
          <h2>Markdown source</h2>
          <pre data-canvas-debug-source></pre>
        </section>
      </aside>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("[data-canvas-native-editor]")!;
  const textarea = root.querySelector<HTMLTextAreaElement>("[data-canvas-input-bridge]")!;
  const debugSelection = root.querySelector<HTMLPreElement>("[data-canvas-debug-selection]")!;
  const debugSource = root.querySelector<HTMLPreElement>("[data-canvas-debug-source]")!;
  const maybeContext = canvas.getContext("2d");
  if (maybeContext === null) {
    throw new Error("Canvas 2D context is unavailable");
  }
  const ctx: CanvasRenderingContext2D = maybeContext;

  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  async function initialize() {
    await waitForPremarkStoryFonts();
    root.dataset.fontsReady = "1";
    const previewLayoutEngine = createLayoutEngine({
      fontTheme: "modern",
      highlighter,
      lineBreakMode: "source",
    });

    const editor = createInMemoryEditorDocumentState(markdown, editorWidth, {
      fontTheme: "modern",
      highlighter,
    });
    const undoManager = new LocalUndoManager();
    let bridgeSnapshot: TextareaBridgeSnapshot = createTextareaBridgeSnapshot(editor);
    let pointerSession: PointerSelectionSession | null = null;
    let composing = false;
    let activeEditableIndex: EditableLayoutIndex = editor.editableIndex;

    function activeRenderView(): {
      layout: ReturnType<typeof previewLayoutEngine.layout>;
      editableIndex: EditableLayoutIndex;
      compositionRects: readonly { x: number; y: number; width: number; height: number }[];
    } {
      const compositionView = editor.compositionView;
      if (compositionView === null) {
        const reveal = createActiveMarkerRevealMarkdown({
          markdown: editor.markdown,
          inlineSources: editor.inlineSources,
          blockSpans: editor.parseState.blockSpans,
          selectionRange: editor.selectionSourceRange,
        });
        if (reveal.markerState === "active") {
          const layout = previewLayoutEngine.layout(reveal.markdown, editorWidth);
          return {
            layout,
            editableIndex: createEditableLayoutIndex({
              markdown: editor.markdown,
              layout,
              blockSpans: editor.parseState.blockSpans,
              inlineSources: editor.inlineSources,
              sourceMap: reveal.sourceMap,
            }),
            compositionRects: [],
          };
        }
        return {
          layout: editor.layout,
          editableIndex: editor.editableIndex,
          compositionRects: [],
        };
      }

      const layout = previewLayoutEngine.layout(compositionView.virtualText, editorWidth);
      const parseState = createIncrementalParseState(compositionView.virtualText);
      const editableIndex = createEditableLayoutIndex({
        markdown: compositionView.virtualText,
        layout,
        blockSpans: parseState.blockSpans,
        inlineSources: createMarkdownInlineSourceMap(parseState),
      });
      return {
        layout,
        editableIndex,
        compositionRects:
          compositionView.preeditText.length === 0
            ? []
            : editableIndex.sourceRangeToSelectionRects({
                from: compositionView.replacementRange.from,
                to: compositionView.replacementRange.from + compositionView.preeditText.length,
              }),
      };
    }

    function render() {
      const view = activeRenderView();
      activeEditableIndex = view.editableIndex;
      const geometry =
        editor.compositionView === null
          ? createSelectionGeometry(editor, view.editableIndex)
          : createCompositionGeometry(view.editableIndex);
      drawTile(ctx, view.layout, width, height, {
        cardRadius: 0,
        contentPadding,
        selectionRects: geometry.selectionRects,
        selectionColor: "rgba(52, 139, 99, 0.34)",
        caretRect: geometry.caret?.rect,
        caretColor: "#7dd3ae",
        compositionRects: view.compositionRects,
        compositionColor: "#7dd3ae",
        palette: darkTilePalette,
      });
      debugSelection.textContent = JSON.stringify(geometry, null, 2);
      debugSource.textContent = editor.markdown;
      syncTextareaBridge(geometry.caret?.rect ?? geometry.headCaret.rect);
    }

    function createCompositionGeometry(index: EditableLayoutIndex) {
      const view = editor.compositionView;
      if (view === null) {
        return createSelectionGeometry(editor, activeEditableIndex);
      }
      const caretOffset = view.replacementRange.from + view.preeditText.length;
      const caret = index.sourceOffsetToCaretRect(caretOffset);
      return {
        range: { from: caretOffset, to: caretOffset },
        anchorOffset: caretOffset,
        headOffset: caretOffset,
        direction: "forward" as const,
        isCollapsed: true,
        selectionRects: [],
        caret,
        anchorCaret: caret,
        headCaret: caret,
      };
    }

    function syncTextareaBridge(caretRect: { x: number; y: number; height: number }) {
      bridgeSnapshot = createTextareaBridgeSnapshot(editor);
      textarea.value = bridgeSnapshot.value;
      textarea.setSelectionRange(bridgeSnapshot.selectionStart, bridgeSnapshot.selectionEnd);
      textarea.style.left = `${contentPadding + Math.max(0, caretRect.x)}px`;
      textarea.style.top = `${contentPadding + Math.max(0, caretRect.y)}px`;
      textarea.style.height = `${Math.max(16, caretRect.height)}px`;
    }

    function canvasPointFromEvent(event: PointerEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left - contentPadding,
        y: event.clientY - rect.top - contentPadding,
      };
    }

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = canvasPointFromEvent(event);
      pointerSession = beginPointerSelection(editor, point.x, point.y, activeEditableIndex);
      textarea.focus();
      render();
    });

    window.addEventListener("pointermove", (event) => {
      if (pointerSession === null) {
        return;
      }
      const point = canvasPointFromEvent(event);
      updatePointerSelection(editor, pointerSession, point.x, point.y, activeEditableIndex);
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
        __premarkCanvasNativeEditor?: {
          markdown(): string;
          selection(): { anchorOffset: number; headOffset: number; isCollapsed: boolean };
          pointForText(text: string, edge?: "start" | "end"): { x: number; y: number };
          fragmentForText(text: string): {
            text: string;
            font: string;
            textInsetX: number;
            sourceRange: { from: number; to: number };
            rect: { x: number; y: number; width: number; height: number };
          };
          setCaret(offset: number): void;
          setSelection(anchor: number, head: number): void;
        };
      }
    ).__premarkCanvasNativeEditor = {
      markdown: () => editor.markdown,
      selection: () => {
        const resolved = editor.adapter.resolveRange(editor.selection.range);
        return {
          anchorOffset: resolved.anchor,
          headOffset: resolved.head,
          isCollapsed: resolved.isCollapsed,
        };
      },
      pointForText(text, edge = "start") {
        const offset = editor.markdown.indexOf(text);
        if (offset < 0) {
          throw new Error(`Missing text: ${text}`);
        }
        const target = edge === "start" ? offset : offset + text.length;
        const caret = activeEditableIndex.sourceOffsetToCaretRect(target);
        return {
          x: contentPadding + caret.rect.x,
          y: contentPadding + caret.rect.y + caret.rect.height / 2,
        };
      },
      fragmentForText(text) {
        const fragment = activeEditableIndex.fragments.find((candidate) =>
          candidate.text.includes(text),
        );
        if (fragment === undefined) {
          throw new Error(`Missing fragment for text: ${text}`);
        }
        return {
          text: fragment.text,
          font: fragment.font,
          textInsetX: fragment.textInsetX,
          sourceRange: fragment.sourceRange,
          rect: fragment.rect,
        };
      },
      setCaret(offset) {
        editor.setSelection(offset, offset);
        render();
      },
      setSelection(anchor, head) {
        editor.setSelection(anchor, head);
        render();
      },
    };

    render();
  }

  void initialize();
  return root;
};
