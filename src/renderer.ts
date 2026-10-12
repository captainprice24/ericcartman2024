import { pdfjsLib } from './pdfjs';
import type { PdfDocumentModel } from './document';
import type { Annotation } from './types';

export interface PageView {
  pageIndex: number;
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  textLayer: HTMLDivElement;
  viewport: ReturnType<pdfjsLib.PDFPageProxy['getViewport']>;
  /** Convert a viewport (CSS px, origin top-left) point to PDF points. */
  toPdf(x: number, y: number): [number, number];
  /** Convert PDF points to viewport CSS px. */
  toView(x: number, y: number): [number, number];
}

/**
 * Renders the open document into the #pages element as a vertical scroll of
 * pages, each with a text layer (for selection/search) and an annotation
 * overlay canvas that redraws from the AnnotationStore.
 */
export class Renderer {
  private pageViews: PageView[] = [];
  scale = 1.0;

  constructor(
    private model: PdfDocumentModel,
    private pagesEl: HTMLElement,
  ) {}

  get views(): PageView[] {
    return this.pageViews;
  }

  async renderAll(): Promise<void> {
    this.pagesEl.replaceChildren();
    this.pageViews = [];
    for (let i = 0; i < this.model.pageCount; i += 1) {
      const view = await this.renderPage(i);
      this.pageViews.push(view);
    }
  }

  async renderPage(pageIndex: number): Promise<PageView> {
    const page = await this.model.pdfjsDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: this.scale });
    const dpr = window.devicePixelRatio || 1;

    const container = document.createElement('div');
    container.className = 'page';
    container.dataset.pageIndex = String(pageIndex);
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    const canvas = document.createElement('canvas');
    canvas.className = 'page__canvas';
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const overlay = document.createElement('canvas');
    overlay.className = 'page__overlay';
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    const textLayer = document.createElement('div');
    textLayer.className = 'page__text-layer';

    container.append(canvas, textLayer, overlay);
    this.pagesEl.append(container);

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Text layer for selection + search highlighting.
    const textContent = await page.getTextContent();
    textLayer.style.width = `${viewport.width}px`;
    textLayer.style.height = `${viewport.height}px`;
    // pdf.js v4 exposes a TextLayer class rather than a renderTextLayer helper.
    const layer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayer,
      viewport,
    });
    await layer.render();

    const view: PageView = {
      pageIndex,
      container,
      canvas,
      overlay,
      textLayer,
      viewport,
      toPdf: (x, y) => {
        const [px, py] = viewport.convertToPdfPoint(x, y);
        return [px, py];
      },
      toView: (x, y) => {
        const [vx, vy] = viewport.convertToViewportPoint(x, y);
        return [vx, vy];
      },
    };

    this.drawOverlay(view);
    return view;
  }

  /** Redraw a single page's annotation overlay from the store. */
  drawOverlay(view: PageView): void {
    const ctx = view.overlay.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.overlay.width, view.overlay.height);
    for (const a of this.model.annotations.forPage(view.pageIndex)) {
      this.drawAnnotation(ctx, view, a);
    }
  }

  drawOverlayFor(pageIndex: number): void {
    const view = this.pageViews[pageIndex];
    if (view) this.drawOverlay(view);
  }

  private drawAnnotation(
    ctx: CanvasRenderingContext2D,
    view: PageView,
    a: Annotation,
  ): void {
    const col = `rgb(${a.color.r}, ${a.color.g}, ${a.color.b})`;
    switch (a.type) {
      case 'highlight': {
        const [x, y, w, h] = a.rect;
        const [vx, vy] = view.toView(x, y + h); // top-left in view space
        ctx.globalAlpha = a.opacity;
        ctx.fillStyle = col;
        ctx.fillRect(vx, vy, w * this.scale, h * this.scale);
        ctx.globalAlpha = 1;
        break;
      }
      case 'ink': {
        ctx.strokeStyle = col;
        ctx.lineWidth = a.width * this.scale;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const stroke of a.paths) {
          ctx.beginPath();
          stroke.forEach(([px, py], i) => {
            const [vx, vy] = view.toView(px, py);
            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          });
          ctx.stroke();
        }
        break;
      }
      case 'note': {
        const [vx, vy] = view.toView(a.x, a.y);
        ctx.fillStyle = '#ffd93b';
        ctx.strokeStyle = '#99731a';
        ctx.fillRect(vx, vy - 14, 14, 14);
        ctx.strokeRect(vx, vy - 14, 14, 14);
        ctx.fillStyle = '#99731a';
        ctx.font = '10px sans-serif';
        ctx.fillText('📝', vx + 1, vy - 3);
        break;
      }
      case 'text': {
        const [vx, vy] = view.toView(a.x, a.y);
        ctx.fillStyle = col;
        ctx.font = `${a.size * this.scale}px Helvetica, sans-serif`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(a.text, vx, vy);
        break;
      }
    }
  }
}
