import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation, RGB } from './types';

/**
 * Holds all annotations for the open document, keyed by page index, and knows
 * how to bake them into a pdf-lib document on save.
 */
export class AnnotationStore {
  private byPage = new Map<number, Annotation[]>();
  private counter = 0;

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  add(annotation: Annotation): void {
    const list = this.byPage.get(annotation.pageIndex) ?? [];
    list.push(annotation);
    this.byPage.set(annotation.pageIndex, list);
  }

  remove(pageIndex: number, id: string): void {
    const list = this.byPage.get(pageIndex);
    if (!list) return;
    this.byPage.set(
      pageIndex,
      list.filter((a) => a.id !== id),
    );
  }

  forPage(pageIndex: number): Annotation[] {
    return this.byPage.get(pageIndex) ?? [];
  }

  get count(): number {
    let total = 0;
    for (const list of this.byPage.values()) total += list.length;
    return total;
  }

  /** Remap annotations after pages are reordered or removed. */
  remap(oldToNew: Map<number, number | null>): void {
    const next = new Map<number, Annotation[]>();
    for (const [oldIndex, list] of this.byPage) {
      const newIndex = oldToNew.get(oldIndex);
      if (newIndex == null) continue; // page was deleted
      const moved = list.map((a) => ({ ...a, pageIndex: newIndex }));
      next.set(newIndex, moved);
    }
    this.byPage = next;
  }

  /** Draw every annotation into the given pdf-lib document. */
  async bake(doc: PDFDocument): Promise<void> {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    for (const [pageIndex, list] of this.byPage) {
      const page = pages[pageIndex];
      if (!page) continue;
      for (const a of list) {
        const color = toPdfColor(a.color);
        switch (a.type) {
          case 'highlight': {
            const [x, y, w, h] = a.rect;
            page.drawRectangle({
              x,
              y,
              width: w,
              height: h,
              color,
              opacity: a.opacity,
            });
            break;
          }
          case 'ink': {
            for (const stroke of a.paths) {
              for (let i = 1; i < stroke.length; i += 1) {
                const [x1, y1] = stroke[i - 1];
                const [x2, y2] = stroke[i];
                page.drawLine({
                  start: { x: x1, y: y1 },
                  end: { x: x2, y: y2 },
                  thickness: a.width,
                  color,
                });
              }
            }
            break;
          }
          case 'note': {
            // A small filled square marker plus the note text beside it.
            page.drawRectangle({
              x: a.x,
              y: a.y,
              width: 14,
              height: 14,
              color: rgb(1, 0.85, 0.2),
              borderColor: rgb(0.6, 0.45, 0),
              borderWidth: 1,
            });
            if (a.text) {
              page.drawText(a.text, {
                x: a.x + 18,
                y: a.y,
                size: 10,
                font,
                color,
                maxWidth: 200,
                lineHeight: 12,
              });
            }
            break;
          }
          case 'text': {
            page.drawText(a.text, {
              x: a.x,
              y: a.y,
              size: a.size,
              font,
              color,
              lineHeight: a.size * 1.2,
            });
            break;
          }
        }
      }
    }
  }
}

function toPdfColor(c: RGB) {
  return rgb(c.r / 255, c.g / 255, c.b / 255);
}
