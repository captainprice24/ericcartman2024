import type { Renderer, PageView } from './renderer';
import type { PdfDocumentModel } from './document';
import type { Tool, RGB } from './types';

/**
 * Translates pointer gestures on each page overlay into annotations, according
 * to the active tool. Coordinates are converted to PDF points immediately so
 * annotations are resolution- and zoom-independent.
 */
export class ToolController {
  tool: Tool = 'select';
  color: RGB = { r: 255, g: 215, b: 0 };
  inkColor: RGB = { r: 220, g: 30, b: 30 };
  textColor: RGB = { r: 20, g: 20, b: 20 };

  private drawing = false;
  private currentStroke: Array<[number, number]> = [];
  private dragStart: { x: number; y: number } | null = null;

  constructor(
    private model: PdfDocumentModel,
    private renderer: Renderer,
    private onChange: () => void,
  ) {}

  attach(view: PageView): void {
    const overlay = view.overlay;
    overlay.addEventListener('pointerdown', (e) => this.onDown(e, view));
    overlay.addEventListener('pointermove', (e) => this.onMove(e, view));
    overlay.addEventListener('pointerup', (e) => this.onUp(e, view));
    overlay.addEventListener('pointerleave', (e) => this.onUp(e, view));
  }

  private localPoint(e: PointerEvent, view: PageView): [number, number] {
    const rect = view.overlay.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private setInteractive(view: PageView): void {
    // Only capture pointer events on the overlay when a drawing tool is active,
    // so text selection works in select mode.
    view.overlay.style.pointerEvents = this.tool === 'select' ? 'none' : 'auto';
  }

  syncInteractivity(): void {
    for (const v of this.renderer.views) this.setInteractive(v);
  }

  private onDown(e: PointerEvent, view: PageView): void {
    if (this.tool === 'select') return;
    e.preventDefault();
    const [lx, ly] = this.localPoint(e, view);

    if (this.tool === 'draw') {
      this.drawing = true;
      this.currentStroke = [view.toPdf(lx, ly)];
      view.overlay.setPointerCapture(e.pointerId);
    } else if (this.tool === 'highlight') {
      this.drawing = true;
      this.dragStart = { x: lx, y: ly };
      view.overlay.setPointerCapture(e.pointerId);
    } else if (this.tool === 'note') {
      const text = window.prompt('Note text:') ?? '';
      const [px, py] = view.toPdf(lx, ly);
      this.model.annotations.add({
        id: this.model.annotations.nextId('note'),
        type: 'note',
        pageIndex: view.pageIndex,
        color: this.textColor,
        x: px,
        y: py,
        text,
      });
      this.renderer.drawOverlay(view);
      this.onChange();
    } else if (this.tool === 'text') {
      const text = window.prompt('Text to add:') ?? '';
      if (!text) return;
      const [px, py] = view.toPdf(lx, ly);
      this.model.annotations.add({
        id: this.model.annotations.nextId('text'),
        type: 'text',
        pageIndex: view.pageIndex,
        color: this.textColor,
        x: px,
        y: py,
        text,
        size: 14,
      });
      this.renderer.drawOverlay(view);
      this.onChange();
    }
  }

  private onMove(e: PointerEvent, view: PageView): void {
    if (!this.drawing) return;
    const [lx, ly] = this.localPoint(e, view);

    if (this.tool === 'draw') {
      this.currentStroke.push(view.toPdf(lx, ly));
      // Live preview: draw the committed overlay then the in-progress stroke.
      this.renderer.drawOverlay(view);
      const ctx = view.overlay.getContext('2d')!;
      ctx.strokeStyle = `rgb(${this.inkColor.r},${this.inkColor.g},${this.inkColor.b})`;
      ctx.lineWidth = 2 * this.renderer.scale;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.currentStroke.forEach(([px, py], i) => {
        const [vx, vy] = view.toView(px, py);
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      });
      ctx.stroke();
    } else if (this.tool === 'highlight' && this.dragStart) {
      this.renderer.drawOverlay(view);
      const ctx = view.overlay.getContext('2d')!;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = `rgb(${this.color.r},${this.color.g},${this.color.b})`;
      ctx.fillRect(
        this.dragStart.x,
        this.dragStart.y,
        lx - this.dragStart.x,
        ly - this.dragStart.y,
      );
      ctx.globalAlpha = 1;
    }
  }

  private onUp(e: PointerEvent, view: PageView): void {
    if (!this.drawing) return;
    const [lx, ly] = this.localPoint(e, view);

    if (this.tool === 'draw') {
      if (this.currentStroke.length > 1) {
        this.model.annotations.add({
          id: this.model.annotations.nextId('ink'),
          type: 'ink',
          pageIndex: view.pageIndex,
          color: this.inkColor,
          paths: [this.currentStroke],
          width: 2,
        });
      }
      this.currentStroke = [];
    } else if (this.tool === 'highlight' && this.dragStart) {
      const [x1, y1] = view.toPdf(this.dragStart.x, this.dragStart.y);
      const [x2, y2] = view.toPdf(lx, ly);
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      if (w > 2 && h > 2) {
        this.model.annotations.add({
          id: this.model.annotations.nextId('hl'),
          type: 'highlight',
          pageIndex: view.pageIndex,
          color: this.color,
          rect: [x, y, w, h],
          opacity: 0.35,
        });
      }
      this.dragStart = null;
    }

    this.drawing = false;
    this.renderer.drawOverlay(view);
    this.onChange();
  }
}
