export interface PremarkHtmlRenderResult {
  readonly html: string;
  readonly css: string;
}

export interface PremarkHtmlRenderHost {
  readonly styleElement: HTMLStyleElement | null;
  readonly documentElement: HTMLElement | null;
  readonly surfaceElement: HTMLElement | null;
  render(rendered: PremarkHtmlRenderResult): void;
  clear(): void;
}

export function createPremarkHtmlRenderHost(container: HTMLElement): PremarkHtmlRenderHost {
  return new PremarkHtmlRenderHostImpl(container);
}

class PremarkHtmlRenderHostImpl implements PremarkHtmlRenderHost {
  styleElement: HTMLStyleElement | null = null;

  documentElement: HTMLElement | null = null;

  surfaceElement: HTMLElement | null = null;

  constructor(private readonly container: HTMLElement) {}

  render(rendered: PremarkHtmlRenderResult): void {
    if (!this.ownsRenderedTree()) {
      this.clear();
    }

    if (this.styleElement === null) {
      this.styleElement = document.createElement("style");
      this.styleElement.dataset.premarkRenderer = "style";
      this.container.append(this.styleElement);
    }
    this.styleElement.textContent = rendered.css;

    const nextDocument = parseRenderedDocument(rendered.html);
    const nextSurface = nextDocument.querySelector<HTMLElement>(".pmd-surface");
    if (nextSurface === null) {
      throw new Error("Rendered Premark document is missing .pmd-surface");
    }

    if (this.documentElement === null || this.surfaceElement === null) {
      this.documentElement = nextDocument;
      this.surfaceElement = nextSurface;
      this.container.append(this.documentElement);
      return;
    }

    syncElementAttributes(this.documentElement, nextDocument);
    syncElementAttributes(this.surfaceElement, nextSurface);
    this.surfaceElement.replaceChildren(...Array.from(nextSurface.childNodes));
  }

  clear(): void {
    this.container.replaceChildren();
    this.styleElement = null;
    this.documentElement = null;
    this.surfaceElement = null;
  }

  private ownsRenderedTree(): boolean {
    return (
      (this.styleElement === null || this.styleElement.parentElement === this.container) &&
      (this.documentElement === null ||
        (this.documentElement.parentElement === this.container &&
          this.surfaceElement !== null &&
          this.documentElement.contains(this.surfaceElement)))
    );
  }
}

function parseRenderedDocument(html: string): HTMLElement {
  const template = document.createElement("template");
  template.innerHTML = html;
  const documentElement = template.content.firstElementChild;
  if (!(documentElement instanceof HTMLElement)) {
    throw new Error("Rendered Premark document is empty");
  }
  return documentElement;
}

function syncElementAttributes(target: HTMLElement, source: HTMLElement): void {
  for (const attribute of Array.from(target.attributes)) {
    target.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(source.attributes)) {
    target.setAttribute(attribute.name, attribute.value);
  }
}
