import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";

import { createCodeMirrorOverlay } from "../apps/playground/src/visual-parity/codemirror-overlay.ts";
import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createWorkspaceEngine, type WorkspaceDocument } from "../packages/workspace/src/index.ts";

export default {
  title: "Editing/CodeMirror Overlay",
  parameters: {
    layout: "fullscreen",
  },
};

const INITIAL_MARKDOWN = `# Rendered Markdown Canvas

Click this rendered paragraph. The active block is replaced by a transparent CodeMirror editor in the same canvas position.

- Selection, typing, paste, undo, redo, and IME stay inside CodeMirror.
- Premark keeps the rendered canvas in sync while the rest of the document remains rendered.

> The overlay should feel like editing the rendered block, not opening a floating card.

\`\`\`ts
export const editor = "codemirror-overlay"
\`\`\`
`;

const PURE_MARKDOWN = `# Plain CodeMirror Markdown

This story is only CodeMirror. It does not use Premark layout or canvas rendering.

- Edit the source directly
- Use normal browser selection and IME
- Compare this with the rendered-canvas overlay story

\`\`\`ts
const baseline = "plain-codemirror"
\`\`\`
`;

export const RenderedCanvasOverlay = () => {
  const highlighter = createHighlighter();
  const workspace = createWorkspaceEngine({
    containerWidth: 680,
    snippetContextBlocks: 1,
  });
  let markdown = INITIAL_MARKDOWN;
  workspace.loadDocuments([{ id: "story", title: "Story", markdown }]);

  const root = document.createElement("div");
  root.className = "md-editor-story";
  root.innerHTML = `
    <style>${storyCss}</style>
    <div class="md-editor-toolbar">
      <strong>Rendered canvas overlay</strong>
      <span data-status>Click a rendered block to edit.</span>
      <label><input data-debug type="checkbox" /> Debug outline</label>
      <button data-commit type="button" disabled>Commit</button>
      <button data-cancel type="button" disabled>Cancel</button>
    </div>
    <main class="md-editor-stage">
      <section class="md-editor-canvas" data-canvas>
        <div class="md-editor-rendered" data-rendered></div>
        <div class="md-editor-overlay-layer" data-overlay-layer></div>
      </section>
    </main>
  `;

  const renderedRoot = root.querySelector<HTMLElement>("[data-rendered]")!;
  const overlayLayer = root.querySelector<HTMLElement>("[data-overlay-layer]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const commitButton = root.querySelector<HTMLButtonElement>("[data-commit]")!;
  const cancelButton = root.querySelector<HTMLButtonElement>("[data-cancel]")!;
  const debugInput = root.querySelector<HTMLInputElement>("[data-debug]")!;

  interface ActiveOverlay {
    readonly host: HTMLElement;
    readonly editor: EditorView;
    readonly originalMarkdown: string;
    sourceFrom: number;
    sourceTo: number;
    blockIndex: number;
  }

  let active: ActiveOverlay | null = null;

  debugInput.addEventListener("input", () => {
    root.toggleAttribute("data-debug-overlay", debugInput.checked);
  });
  commitButton.addEventListener("click", () => commit());
  cancelButton.addEventListener("click", () => cancel());

  renderCanvas();

  function renderCanvas(): void {
    const document = requireDocument(workspace.getDocument("story"));
    const rendered = renderToHtml(document.layout, {
      codeThemeCss: highlighter.getThemeCss("dark"),
    });
    renderedRoot.innerHTML = `<style>${rendered.css}${renderedCanvasCss}</style>${rendered.html}`;
    renderedRoot.style.width = `${document.layout.containerWidth}px`;
    renderedRoot.style.height = `${document.layout.totalHeight}px`;
    overlayLayer.style.width = `${document.layout.containerWidth}px`;
    overlayLayer.style.height = `${document.layout.totalHeight}px`;

    renderedRoot.querySelectorAll<HTMLElement>(".pmd-block").forEach((block, index) => {
      block.dataset.blockIndex = String(index);
      block.toggleAttribute("data-active-block", active?.blockIndex === index);
      block.addEventListener("click", () => openOverlay(index));
    });

    positionActiveOverlay();
    updateControls();
  }

  function openOverlay(blockIndex: number): void {
    destroyOverlay();

    const document = requireDocument(workspace.getDocument("story"));
    const record = document.records[blockIndex];
    const block = document.layout.blocks[blockIndex];
    if (record === undefined || block === undefined) {
      return;
    }

    const host = documentElement("div", "md-editor-active-overlay");
    overlayLayer.append(host);
    active = {
      host,
      editor: createCodeMirrorOverlay(host, markdown.slice(record.source.from, record.source.to), {
        onChange: (_doc, update) => applyOverlayChange(update),
      }),
      originalMarkdown: markdown,
      sourceFrom: record.source.from,
      sourceTo: record.source.to,
      blockIndex,
    };
    positionActiveOverlay();
    renderCanvas();
    active.editor.focus();
    status.textContent = "Editing rendered block through CodeMirror.";
  }

  function applyOverlayChange(update: ViewUpdate): void {
    if (active === null) {
      return;
    }

    const changes: Array<{ from: number; to: number; text: string }> = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({
        from: active!.sourceFrom + fromA,
        to: active!.sourceFrom + toA,
        text: inserted.toString(),
      });
    });

    let nextMarkdown = markdown;
    let delta = 0;
    for (const change of changes.toReversed()) {
      nextMarkdown = `${nextMarkdown.slice(0, change.from)}${change.text}${nextMarkdown.slice(change.to)}`;
      delta += change.text.length - (change.to - change.from);
    }

    active.sourceTo += delta;
    markdown = nextMarkdown;
    workspace.upsertDocument({ id: "story", title: "Story", markdown });
    syncActiveBlockIndex();
    renderCanvas();
  }

  function syncActiveBlockIndex(): void {
    if (active === null) {
      return;
    }
    const document = requireDocument(workspace.getDocument("story"));
    const index = document.records.findIndex(
      (record) =>
        active !== null &&
        record.source.from <= active.sourceFrom &&
        active.sourceFrom <= record.source.to,
    );
    active.blockIndex = Math.max(0, index);
  }

  function positionActiveOverlay(): void {
    if (active === null) {
      return;
    }
    const document = requireDocument(workspace.getDocument("story"));
    const block = document.layout.blocks[active.blockIndex];
    if (block === undefined) {
      return;
    }
    active.host.style.transform = `translate(${block.contentBox.x}px, ${block.y}px)`;
    active.host.style.width = `${block.contentBox.width}px`;
    active.host.style.minHeight = `${Math.max(block.height, 44)}px`;
  }

  function commit(): void {
    destroyOverlay();
    status.textContent = "Committed. Click another rendered block to edit.";
    renderCanvas();
  }

  function cancel(): void {
    if (active !== null) {
      markdown = active.originalMarkdown;
      workspace.upsertDocument({ id: "story", title: "Story", markdown });
    }
    destroyOverlay();
    status.textContent = "Canceled. Click a rendered block to edit.";
    renderCanvas();
  }

  function destroyOverlay(): void {
    active?.editor.destroy();
    active?.host.remove();
    active = null;
  }

  function updateControls(): void {
    commitButton.disabled = active === null;
    cancelButton.disabled = active === null;
  }

  return root;
};

export const PlainCodeMirror = () => {
  const root = document.createElement("div");
  root.className = "md-editor-story";
  root.innerHTML = `
    <style>${storyCss}${plainCodeMirrorCss}</style>
    <div class="md-editor-toolbar">
      <strong>Plain CodeMirror</strong>
      <span data-status>Direct Markdown source editing.</span>
    </div>
    <main class="md-editor-stage">
      <section class="plain-cm-shell" data-editor></section>
    </main>
  `;

  const host = root.querySelector<HTMLElement>("[data-editor]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const editor = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: PURE_MARKDOWN,
      extensions: [
        history(),
        keymap.of([
          { key: "Mod-y", run: redo },
          { key: "Mod-Shift-z", run: redo },
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        markdownLanguage(),
        EditorView.lineWrapping,
        plainCodeMirrorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) {
            status.textContent = `${update.state.doc.length} chars`;
          }
        }),
      ],
    }),
  });
  editor.focus();

  return root;
};

function requireDocument(document: WorkspaceDocument | null): WorkspaceDocument {
  if (document === null) {
    throw new Error("Story document is not loaded");
  }
  return document;
}

function documentElement(tagName: string, className: string): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

const storyCss = `
  .md-editor-story {
    min-height: 100vh;
    background: #f6f7fb;
    color: #24292f;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .md-editor-toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 52px;
    padding: 0 24px;
    border-bottom: 1px solid rgba(31, 35, 40, 0.12);
    background: rgba(255, 255, 255, 0.94);
  }

  .md-editor-toolbar strong {
    font-size: 14px;
    font-weight: 700;
  }

  .md-editor-toolbar span,
  .md-editor-toolbar label {
    color: #59636e;
    font-size: 13px;
  }

  .md-editor-toolbar button {
    min-height: 32px;
    border: 1px solid rgba(31, 35, 40, 0.16);
    border-radius: 8px;
    background: #ffffff;
    color: #24292f;
    padding: 0 12px;
    font: inherit;
    cursor: pointer;
  }

  .md-editor-toolbar button:disabled {
    color: #8c959f;
    cursor: default;
  }

  .md-editor-stage {
    min-height: calc(100vh - 52px);
    padding: 40px 24px;
    overflow: auto;
  }
`;

const renderedCanvasCss = `
  .md-editor-canvas {
    position: relative;
    width: 680px;
    margin: 0 auto;
  }

  .md-editor-rendered {
    position: relative;
  }

  .md-editor-rendered .pmd-block {
    cursor: text;
  }

  .md-editor-rendered .pmd-block[data-active-block] {
    visibility: hidden;
  }

  .md-editor-overlay-layer {
    position: absolute;
    inset: 0 auto auto 0;
    pointer-events: none;
  }

  .md-editor-active-overlay {
    position: absolute;
    inset: 0 auto auto 0;
    pointer-events: auto;
    background: transparent;
  }

  .md-editor-active-overlay .cm-editor,
  .md-editor-active-overlay .cm-scroller {
    min-height: inherit;
  }

  .md-editor-active-overlay .cm-editor {
    background: transparent;
  }

  .md-editor-story[data-debug-overlay] .md-editor-active-overlay {
    outline: 1px solid rgba(9, 105, 218, 0.7);
    outline-offset: 2px;
    background: rgba(255, 255, 255, 0.35);
  }
`;

const plainCodeMirrorCss = `
  .plain-cm-shell {
    width: min(820px, calc(100vw - 48px));
    min-height: 70vh;
    margin: 0 auto;
    border: 1px solid rgba(31, 35, 40, 0.12);
    border-radius: 8px;
    background: #ffffff;
  }
`;

const plainCodeMirrorTheme = EditorView.theme({
  "&": {
    minHeight: "70vh",
    color: "#24292f",
    backgroundColor: "#ffffff",
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
    fontSize: "14px",
  },
  ".cm-scroller": {
    minHeight: "70vh",
    lineHeight: "22px",
  },
  ".cm-content": {
    padding: "20px",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(9, 105, 218, 0.18)",
  },
});
