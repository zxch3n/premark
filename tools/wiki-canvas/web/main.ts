import { mountWikiCanvas } from "@pretext-md/wiki-canvas";

interface Payload {
  root: string;
  scanTimeMs: number;
  nodes: Array<{ id: string; title: string; relativePath: string; markdown: string }>;
  edges: Array<{ from: string; to: string }>;
}

function formatMs(ms: number): string {
  if (ms < 10) return ms.toFixed(2);
  if (ms < 100) return ms.toFixed(1);
  return Math.round(ms).toString();
}

async function load() {
  const payload = (await fetch("/payload.json").then((response) => {
    if (!response.ok) throw new Error(`Payload request failed: ${response.status}`);
    return response.json();
  })) as Payload;

  const titleEl = document.getElementById("title")!;
  titleEl.textContent = `Wiki Canvas · ${payload.root}`;

  const countEl = document.getElementById("countChip")!;
  countEl.textContent = `${payload.nodes.length} notes · 625 × 625`;

  const edgeEl = document.getElementById("edgeChip")!;
  edgeEl.textContent = `${payload.edges.length} wikilinks`;

  const renderEl = document.getElementById("renderChip")!;
  renderEl.textContent = `scan ${payload.scanTimeMs.toFixed(1)}ms`;

  const stage = document.getElementById("stage")!;

  const controller = await mountWikiCanvas(stage, {
    nodes: payload.nodes.map((node) => ({
      id: node.id,
      title: node.relativePath,
      markdown: node.markdown,
    })),
  });

  renderEl.textContent = `render ${formatMs(controller.renderTimeMs)}ms (${payload.nodes.length} tiles)`;

  document.getElementById("fitBtn")!.addEventListener("click", () => controller.fit());
  window.addEventListener("keydown", (event) => {
    if (event.key === "r" || event.key === "R") controller.fit();
  });
}

load().catch((error) => {
  const fatal = document.getElementById("fatal")!;
  fatal.style.display = "flex";
  fatal.innerHTML = `<div><h2 style="margin:0 0 12px;color:#fca5a5">Failed to load canvas</h2><pre style="text-align:left;max-width:720px;color:#fecaca;background:#1c1013;padding:14px;border-radius:10px;overflow:auto">${String(error?.stack ?? error)}</pre></div>`;
  // eslint-disable-next-line no-console
  console.error(error);
});
