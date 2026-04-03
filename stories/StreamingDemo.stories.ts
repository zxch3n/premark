import { createHighlighter } from "../packages/highlight/src/index.ts";
import { renderToHtml } from "../packages/html-renderer/src/index.ts";
import { createLayoutEngine } from "../packages/layout/src/index.ts";

export default {
  title: "Streaming/Streaming Demo",
};

export const Demo = () => {
  const engine = createLayoutEngine({
    fontTheme: "github",
    highlighter: createHighlighter(),
  });
  const stream = engine.createStream(560);
  const chunks = [
    "# Streaming\n\nThis paragraph",
    " grows as more tokens arrive. ",
    "Then a code block appears.\n\n```ts\n",
    "const answer = 42\n```",
  ];

  const root = document.createElement("div");
  const surface = document.createElement("div");
  const log = document.createElement("pre");
  root.style.padding = "32px";
  log.style.marginTop = "24px";
  log.style.font = '13px/1.45 "IBM Plex Mono", monospace';
  log.style.whiteSpace = "pre-wrap";
  root.append(surface, log);

  let index = 0;
  const timer = window.setInterval(() => {
    if (index >= chunks.length) {
      window.clearInterval(timer);
      return;
    }
    const delta = stream.push(chunks[index]!);
    const rendered = renderToHtml(stream.getLayout(), {
      codeThemeCss: createHighlighter().getThemeCss("dark"),
    });
    surface.innerHTML = `<style>${rendered.css}</style>${rendered.html}`;
    log.textContent = JSON.stringify(delta, null, 2);
    index += 1;
  }, 900);

  return root;
};
