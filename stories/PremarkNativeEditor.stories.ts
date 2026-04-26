import { createHighlighter } from "../packages/highlight/src/index.ts";
import { createPremarkDomEditorHost, renderToHtml } from "../packages/html-renderer/src/index.ts";
import {
  createInMemoryEditorDocumentState,
  createPremarkEditorController,
  LocalUndoManager,
} from "../packages/editor/src/index.ts";
import { waitForPremarkStoryFonts } from "./font-loading.ts";

export default {
  title: "Editing/Premark Native Editor",
};

const sampleImageSrc =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='96'%3E%3Crect%20width='160'%20height='96'%20rx='10'%20fill='%23d7efe5'/%3E%3Ccircle%20cx='46'%20cy='42'%20r='18'%20fill='%234a8f72'/%3E%3Cpath%20d='M78%2072%20108%2032%20146%2072z'%20fill='%232f5f8f'/%3E%3Ctext%20x='18'%20y='86'%20font-family='Arial'%20font-size='12'%20fill='%23223835'%3ETiny%20sample%3C/text%3E%3C/svg%3E";

const sampleMarkdown = `# Native rendered Markdown

Click text, drag across blocks, then type directly on the rendered surface.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

| Element | Active editing behavior |
| --- | --- |
| Table | Shows this Markdown source while the caret is inside it. |
| Image | Shows the image Markdown source while the caret is on it. |

![Tiny sample image](${sampleImageSrc})

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
    const host = createPremarkDomEditorHost({
      editor,
      controller,
      undoManager,
      surface,
      overlay,
      inputBridge: textarea,
      contentInset: { x: 28, y: 28 },
      renderMarkdown(snapshot) {
        return renderToHtml(snapshot.layout, {
          codeThemeCss: highlighter.getThemeCss("dark"),
        });
      },
      onRender(state) {
        debugSelection.textContent = JSON.stringify(state.geometry, null, 2);
        debugSource.textContent = controller.markdown();
      },
    });

    function render(options: { readonly syncBridgeValue?: boolean } = {}) {
      host.render(options);
    }

    (
      window as typeof window & {
        __premarkNativeEditor?: {
          markdown(): string;
          setMarkdown(markdown: string): void;
          insertRemote(offset: number, text: string): void;
          resize(width: number): void;
          pointForSourceRange(from: number, to: number): { x: number; y: number };
          setSelection(anchor: number, head: number): void;
          setCaret(offset: number): void;
        };
      }
    ).__premarkNativeEditor = {
      markdown: () => controller.markdown(),
      setMarkdown(markdown) {
        controller.setMarkdown(markdown, {
          recordUndo: false,
          selection: { anchor: 0, head: 0 },
        });
        render();
      },
      insertRemote(offset, text) {
        controller.applyEdit({ type: "insert", offset, text }, { recordUndo: false });
        render();
      },
      resize(width) {
        controller.resize(width);
        render();
      },
      pointForSourceRange(from, to) {
        return host.pointForSourceRange(from, to);
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
