import { createHighlighter } from "../packages/highlight/src/index.ts";
import {
  createInMemoryEditorDocumentState,
  createSelectionGeometry,
} from "../packages/editor/src/index.ts";
import { drawTile } from "../packages/wiki-canvas/src/index.ts";

export default {
  title: "Editing/Premark Canvas Selection",
};

const markdown = `# Canvas selection

Click text, drag across blocks, then type directly on the rendered surface.

- Selection is stored as source offsets.
- The hidden textarea mirrors only the active source slice.
- Cross-block replacement uses one source operation.

Try **bold text**, \`inline code\`, 中文输入, and emoji 👨‍👩‍👧‍👦.`;

export const CanvasSelection = () => {
  const root = document.createElement("div");
  root.className = "pcs-root";
  root.innerHTML = `
    <style>
      .pcs-root {
        min-height: 100vh;
        margin: 0;
        padding: 0;
        background: #fbfcf8;
      }

      .pcs-canvas {
        display: block;
        width: 560px;
        height: 340px;
      }
    </style>
    <canvas class="pcs-canvas" data-canvas-selection></canvas>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("[data-canvas-selection]")!;
  const pixelRatio = window.devicePixelRatio || 1;
  const width = 560;
  const height = 340;
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const highlighter = createHighlighter();
  const editor = createInMemoryEditorDocumentState(markdown, 500, {
    fontTheme: "modern",
    highlighter,
  });
  editor.setSelection(markdown.indexOf("Click text"), markdown.indexOf("hidden textarea"));

  const geometry = createSelectionGeometry(editor);
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Canvas 2D context is unavailable");
  }
  ctx.scale(pixelRatio, pixelRatio);
  drawTile(ctx, editor.layout, width, height, {
    cardRadius: 0,
    contentPadding: 28,
    selectionRects: geometry.selectionRects,
    selectionColor: "rgba(52, 139, 99, 0.34)",
  });

  return root;
};
