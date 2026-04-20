const preview = {
  parameters: {
    layout: "fullscreen",
  },
};

// Load Inter + JetBrains Mono from Google Fonts
const link = document.createElement("link");
link.rel = "stylesheet";
link.href =
  "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap";
const fontStylesReady = new Promise<void>((resolve) => {
  link.addEventListener("load", () => resolve(), { once: true });
  link.addEventListener("error", () => resolve(), { once: true });
});
(
  window as typeof window & {
    __premarkStoryFontStylesReady?: Promise<void>;
  }
).__premarkStoryFontStylesReady = fontStylesReady;
document.head.append(link);

// Global smooth font rendering
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
`;
document.head.append(style);

export default preview;
