/**
 * Shared visual theme for showcase stories.
 *
 * Provides a refined dark palette with indigo accents,
 * custom CSS overrides for pmd-* classes, and reusable
 * UI component factories for stat badges, buttons, etc.
 */

// ── Color tokens ──────────────────────────────────────────

export const color = {
  bg: "#0a0e17",
  surface: "#111827",
  panel: "#161d2e",
  border: "rgba(148,163,184,.08)",
  borderHover: "rgba(148,163,184,.18)",
  text: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accent: "#818cf8",
  accentSoft: "rgba(129,140,248,.12)",
  accentBorder: "rgba(129,140,248,.25)",
  accentGlow: "rgba(129,140,248,.06)",
  link: "#93c5fd",
  linkUnderline: "rgba(147,197,253,.3)",
  green: "#34d399",
  greenSoft: "rgba(52,211,153,.12)",
} as const;

// ── Enhanced CSS for pmd-* elements ───────────────────────

export const enhancedCss = `
  /* Headings — subtle accent underline on H1 */
  .pmd-block--heading .pmd-fragment {
    color: ${color.text};
  }

  /* Links — blue with soft underline */
  .pmd-fragment--link {
    color: ${color.link} !important;
    text-decoration-color: ${color.linkUnderline} !important;
    transition: color .15s ease;
  }

  /* Inline code — indigo-tinted background */
  .pmd-fragment--inline_code {
    background: ${color.accentSoft} !important;
    color: ${color.accent} !important;
    border-radius: 6px;
  }

  /* Blockquote — indigo left border */
  .pmd-quote-bar {
    background: ${color.accentBorder} !important;
  }

  /* Table borders — subtle */
  .pmd-table th,
  .pmd-table td {
    border-color: ${color.border} !important;
  }
  .pmd-table th {
    background: ${color.accentGlow};
  }

  /* Thematic break — gradient */
  .pmd-rule {
    border-top: 1px solid transparent !important;
    background: linear-gradient(90deg, transparent, ${color.accentBorder}, transparent) !important;
    height: 1px !important;
    top: 50% !important;
  }

  /* Strikethrough — muted */
  .pmd-fragment--strikethrough {
    color: ${color.textMuted} !important;
  }

  /* Code block — enhanced gradient */
  .pmd-code {
    background:
      linear-gradient(180deg, rgba(13,17,28,.98), rgba(22,29,46,.96)),
      linear-gradient(135deg, rgba(129,140,248,.08), transparent 50%) !important;
    border: 1px solid ${color.border};
    box-shadow: 0 2px 12px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.03);
  }

  /* Scrollbar in code blocks */
  .pmd-code::-webkit-scrollbar {
    height: 6px;
  }
  .pmd-code::-webkit-scrollbar-thumb {
    background: rgba(148,163,184,.15);
    border-radius: 3px;
  }
`;

// ── UI component factories ────────────────────────────────

export function createBadge(label: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    border-radius: 100px;
    background: ${color.accentSoft};
    color: ${color.textSecondary};
    font: 500 11.5px/1 "JetBrains Mono", monospace;
    letter-spacing: .02em;
    white-space: nowrap;
  `;
  el.textContent = label;
  return el;
}

export function createGreenBadge(label: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 12px;
    border-radius: 100px;
    background: ${color.greenSoft};
    color: ${color.green};
    font: 500 11.5px/1 "JetBrains Mono", monospace;
    letter-spacing: .02em;
    white-space: nowrap;
  `;
  el.textContent = label;
  return el;
}

export function createButton(label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    padding: 5px 18px;
    border-radius: 8px;
    border: 1px solid ${color.accentBorder};
    background: ${color.accentSoft};
    color: ${color.accent};
    cursor: pointer;
    font: 500 12px/1 "Inter", sans-serif;
    letter-spacing: .01em;
    transition: all .15s ease;
  `;
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "rgba(129,140,248,.2)";
    btn.style.borderColor = "rgba(129,140,248,.4)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = color.accentSoft;
    btn.style.borderColor = color.accentBorder;
  });
  return btn;
}

export function createHeader(): HTMLDivElement {
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 24px;
    border-bottom: 1px solid ${color.border};
    font-size: 13px;
    flex-shrink: 0;
    background: ${color.surface};
    backdrop-filter: blur(12px);
  `;
  return header;
}

export function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: ${color.bg};
    color: ${color.text};
    font-family: "Inter", -apple-system, sans-serif;
  `;
  return root;
}
