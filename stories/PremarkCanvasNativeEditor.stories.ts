import { createHighlighter } from "../packages/highlight/src/index.ts";
import {
  applyInputIntent,
  applyTextareaBridgeChange,
  beginPointerSelection,
  createInMemoryEditorDocumentState,
  createPremarkEditorController,
  createSelectionGeometry,
  createTextareaBridgeSnapshot,
  LocalUndoManager,
  normalizeInputTrace,
  selectPointerRange,
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

const defaultMarkdown = `# Canvas native editor

Click text, drag across blocks, then type directly on the rendered canvas.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Widths iiiii WWWW done.

Try **bold text**, \`inline code\`, [docs](https://example.com), 中文输入, and emoji 👨‍👩‍👧‍👦.`;

const repeatedEmojiMarkdown = `# Canvas native editor

Emoji drift check 👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦

Widths iiiii WWWW done.

Try **bold text**, \`inline code\`, [docs](https://example.com).`;

function largeMarkdown(): string {
  const section = [
    "## Viewport section",
    "",
    "User edit anchor paragraph with **bold**, `code`, [docs](https://example.com), 中文文本, and emoji 👨‍👩‍👧‍👦.",
    "",
    "AI stream target paragraph with enough text to append generated tokens while editing another area.",
    "",
    "- item one",
    "- item two",
    "",
  ].join("\n");
  let markdown = "# Large Canvas native editor\n\n";
  while (markdown.length < 110_000) {
    markdown += section;
  }
  return markdown;
}

function streamingMarkdown(): string {
  return [
    "# Streaming collaboration canvas",
    "",
    "User edit anchor paragraph. Click here and type while the assistant streams below.",
    "",
    "AI stream target paragraph:",
    "",
    "- Remote peers may patch other blocks.",
    "- Local selection should stay where the user is editing.",
  ].join("\n");
}

function initialMarkdown(): string {
  const fixture = new URLSearchParams(window.location.search).get("fixture");
  if (fixture === "repeated-emoji") {
    return repeatedEmojiMarkdown;
  }
  if (fixture === "large") {
    return largeMarkdown();
  }
  if (fixture === "streaming") {
    return streamingMarkdown();
  }
  return defaultMarkdown;
}

const width = 780;
const height = 430;
const contentPadding = 28;
const editorWidth = width - contentPadding * 2;
const editorViewportHeight = height - contentPadding * 2;
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
        overflow: hidden;
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
          <h2>Render update</h2>
          <pre data-canvas-debug-render></pre>
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
  const debugRender = root.querySelector<HTMLPreElement>("[data-canvas-debug-render]")!;
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
    const editor = createInMemoryEditorDocumentState(initialMarkdown(), editorWidth, {
      fontTheme: "modern",
      highlighter,
    });
    const undoManager = new LocalUndoManager();
    const controller = createPremarkEditorController({ state: editor, undoManager });
    let bridgeSnapshot: TextareaBridgeSnapshot = createTextareaBridgeSnapshot(editor);
    let pointerSession: PointerSelectionSession | null = null;
    let composing = false;
    let activeEditableIndex: EditableLayoutIndex = editor.editableIndex;
    let pointerClickCount = 0;
    let lastPointerClick: {
      readonly time: number;
      readonly x: number;
      readonly y: number;
    } | null = null;
    let hasRendered = false;
    let lastRenderedVersion = -1;

    controller.setViewport({
      scrollTop: 0,
      height: editorViewportHeight,
      overscanY: editorViewportHeight,
    });
    const searchParams = new URLSearchParams(window.location.search);
    let autoStreamTimer: number | null = null;

    function render() {
      const view = controller.renderSnapshot();
      activeEditableIndex = view.editableIndex;
      const geometry =
        editor.compositionView === null
          ? createSelectionGeometry(editor, view.editableIndex)
          : createCompositionGeometry(view.editableIndex);
      const clipRect =
        hasRendered &&
        view.version !== lastRenderedVersion &&
        view.renderUpdate.dirtyRects.length === 1
          ? canvasClipFromDirtyRect(view.renderUpdate.dirtyRects[0]!, view.viewport.scrollTop)
          : undefined;
      drawTile(ctx, view.layout, width, height, {
        cardRadius: 0,
        contentPadding,
        scrollY: view.viewport.scrollTop,
        clipRect,
        selectionRects: geometry.selectionRects,
        selectionColor: "rgba(52, 139, 99, 0.34)",
        caretRect: geometry.caret?.rect,
        caretColor: "#7dd3ae",
        compositionRects: view.compositionRects,
        compositionColor: "#7dd3ae",
        palette: darkTilePalette,
      });
      drawDirtyOverlay(view.renderUpdate.dirtyRects, view.viewport.scrollTop);
      hasRendered = true;
      lastRenderedVersion = view.version;
      debugSelection.textContent = JSON.stringify(geometry, null, 2);
      debugRender.textContent = JSON.stringify(
        {
          viewport: view.viewport,
          editableIndex: view.renderUpdate.editableIndex,
          dirtyRects: view.renderUpdate.dirtyRects,
          clipRect,
        },
        null,
        2,
      );
      debugSource.textContent = controller.markdown();
      syncTextareaBridge(geometry.caret?.rect ?? geometry.headCaret.rect, view.viewport.scrollTop);
    }

    function canvasClipFromDirtyRect(
      rect: { x: number; y: number; width: number; height: number },
      scrollTop: number,
    ) {
      const margin = 4;
      const x = Math.max(0, contentPadding + rect.x - margin);
      const y = Math.max(0, contentPadding + rect.y - scrollTop - margin);
      return {
        x,
        y,
        width: Math.min(width - x, rect.width + margin * 2),
        height: Math.min(height - y, rect.height + margin * 2),
      };
    }

    function drawDirtyOverlay(
      rects: readonly { x: number; y: number; width: number; height: number }[],
      scrollTop: number,
    ) {
      ctx.save();
      ctx.strokeStyle = "rgba(248, 113, 113, 0.82)";
      ctx.setLineDash([6, 4]);
      for (const rect of rects) {
        ctx.strokeRect(
          contentPadding + rect.x + 0.5,
          contentPadding + rect.y - scrollTop + 0.5,
          rect.width,
          rect.height,
        );
      }
      ctx.restore();
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

    function syncTextareaBridge(
      caretRect: { x: number; y: number; height: number },
      scrollTop: number,
    ) {
      bridgeSnapshot = createTextareaBridgeSnapshot(editor);
      textarea.value = bridgeSnapshot.value;
      textarea.setSelectionRange(bridgeSnapshot.selectionStart, bridgeSnapshot.selectionEnd);
      textarea.style.left = `${contentPadding + Math.max(0, caretRect.x)}px`;
      textarea.style.top = `${contentPadding + Math.max(0, caretRect.y - scrollTop)}px`;
      textarea.style.height = `${Math.max(16, caretRect.height)}px`;
    }

    function canvasPointFromEvent(event: MouseEvent): { x: number; y: number } {
      const rect = canvas.getBoundingClientRect();
      const viewport = controller.renderSnapshot().viewport;
      return {
        x: event.clientX - rect.left - contentPadding,
        y: event.clientY - rect.top - contentPadding + viewport.scrollTop,
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

    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = canvasPointFromEvent(event);
      const clickCount = clickCountFromPointer(event, point);
      if (clickCount >= 3) {
        selectPointerRange(editor, point.x, point.y, "block", activeEditableIndex);
        pointerSession = null;
        textarea.focus();
        render();
        return;
      }
      if (clickCount === 2) {
        selectPointerRange(editor, point.x, point.y, "word", activeEditableIndex);
        pointerSession = null;
        textarea.focus();
        render();
        return;
      }
      pointerSession = beginPointerSelection(editor, point.x, point.y, activeEditableIndex);
      textarea.focus();
      render();
    });

    canvas.addEventListener("click", (event) => {
      if (event.detail < 2) {
        return;
      }
      const point = canvasPointFromEvent(event);
      selectPointerRange(
        editor,
        point.x,
        point.y,
        event.detail >= 3 ? "block" : "word",
        activeEditableIndex,
      );
      pointerSession = null;
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

    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const snapshot = controller.renderSnapshot();
        const maxScrollTop = Math.max(0, snapshot.layout.totalHeight - editorViewportHeight);
        controller.setViewport({
          scrollTop: Math.min(
            maxScrollTop,
            Math.max(0, snapshot.viewport.scrollTop + event.deltaY),
          ),
          height: editorViewportHeight,
          overscanY: editorViewportHeight,
        });
        render();
      },
      { passive: false },
    );

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
      if (
        intent?.type !== "keyboard-selection" &&
        intent?.type !== "select-all" &&
        intent?.type !== "line-indent"
      ) {
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

    if (searchParams.get("autostream") === "1") {
      let chunkIndex = 0;
      autoStreamTimer = window.setInterval(() => {
        if (!root.isConnected && autoStreamTimer !== null) {
          window.clearInterval(autoStreamTimer);
          autoStreamTimer = null;
          return;
        }
        chunkIndex += 1;
        streamAIChunk(` token-${chunkIndex}`);
        if (chunkIndex >= 12 && autoStreamTimer !== null) {
          window.clearInterval(autoStreamTimer);
          autoStreamTimer = null;
        }
      }, 280);
    }

    function streamAIChunk(chunk: string) {
      const markdown = controller.markdown();
      const needle = "AI stream target paragraph:";
      const target = markdown.indexOf(needle);
      if (target < 0) {
        return;
      }
      const lineEnd = markdown.indexOf("\n", target);
      const offset = lineEnd < 0 ? markdown.length : lineEnd;
      controller.applyRemotePatch({
        origin: "ai",
        actorId: "assistant",
        changes: [{ from: offset, to: offset, insert: chunk }],
      });
      render();
    }

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
          insertAt(offset: number, text: string): void;
          streamAIChunk(chunk: string): void;
          scrollTo(y: number): void;
        };
      }
    ).__premarkCanvasNativeEditor = {
      markdown: () => controller.markdown(),
      selection: () => {
        const selection = controller.selection();
        return {
          anchorOffset: selection.anchorOffset,
          headOffset: selection.headOffset,
          isCollapsed: selection.isCollapsed,
        };
      },
      pointForText(text, edge = "start") {
        const offset = editor.markdown.indexOf(text);
        if (offset < 0) {
          throw new Error(`Missing text: ${text}`);
        }
        const target = edge === "start" ? offset : offset + text.length;
        const caret = activeEditableIndex.sourceOffsetToCaretRect(target);
        const scrollTop = controller.renderSnapshot().viewport.scrollTop;
        return {
          x: contentPadding + caret.rect.x,
          y: contentPadding + caret.rect.y - scrollTop + caret.rect.height / 2,
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
        controller.setCaret(offset);
        render();
      },
      setSelection(anchor, head) {
        controller.setSelection(anchor, head);
        render();
      },
      insertAt(offset, text) {
        controller.applyRemotePatch({
          actorId: "peer",
          changes: [{ from: offset, to: offset, insert: text }],
        });
        render();
      },
      streamAIChunk,
      scrollTo(y) {
        const snapshot = controller.renderSnapshot();
        controller.setViewport({
          scrollTop: Math.min(
            Math.max(0, snapshot.layout.totalHeight - editorViewportHeight),
            Math.max(0, y),
          ),
          height: editorViewportHeight,
          overscanY: editorViewportHeight,
        });
        render();
      },
    };

    render();
  }

  void initialize();
  return root;
};
