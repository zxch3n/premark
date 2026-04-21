import { createHighlighter } from "../packages/highlight/src/index.ts";
import {
  createInMemoryEditorDocumentState,
  createPremarkEditorController,
  LocalUndoManager,
} from "../packages/editor/src/index.ts";
import {
  createPremarkCanvasEditorHost,
  darkTilePalette,
} from "../packages/wiki-canvas/src/index.ts";
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

  async function initialize() {
    await waitForPremarkStoryFonts();
    root.dataset.fontsReady = "1";
    const editor = createInMemoryEditorDocumentState(initialMarkdown(), editorWidth, {
      fontTheme: "modern",
      highlighter,
    });
    const undoManager = new LocalUndoManager();
    const controller = createPremarkEditorController({ state: editor, undoManager });
    const searchParams = new URLSearchParams(window.location.search);
    let autoStreamTimer: number | null = null;

    const host = createPremarkCanvasEditorHost({
      editor,
      controller,
      undoManager,
      canvas,
      inputBridge: textarea,
      width,
      height,
      contentPadding,
      viewportHeight: editorViewportHeight,
      overscanY: editorViewportHeight,
      paint: {
        cardRadius: 0,
        palette: darkTilePalette,
        selectionColor: "rgba(52, 139, 99, 0.34)",
        caretColor: "#7dd3ae",
        compositionColor: "#7dd3ae",
        showDirtyOverlay: true,
      },
      onRender(state) {
        debugSelection.textContent = JSON.stringify(state.geometry, null, 2);
        debugRender.textContent = JSON.stringify(
          {
            viewport: state.snapshot.viewport,
            editableIndex: state.snapshot.renderUpdate.editableIndex,
            dirtyRects: state.snapshot.renderUpdate.dirtyRects,
            clipRect: state.clipRect,
          },
          null,
          2,
        );
        debugSource.textContent = controller.markdown();
      },
    });

    function render(options: { readonly syncBridgeValue?: boolean } = {}) {
      host.render(options);
    }

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
        return host.pointForText(text, edge);
      },
      fragmentForText(text) {
        const fragment = host.fragmentForText(text);
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
        host.scrollTo(y);
      },
    };

    render();
  }

  void initialize();
  return root;
};
