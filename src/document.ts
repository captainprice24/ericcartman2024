import { PDFDocument, degrees } from 'pdf-lib';
import { pdfjsLib, type PDFDocumentProxy } from './pdfjs';
import { AnnotationStore } from './annotations';

/**
 * Wraps a single open PDF. pdf.js owns rendering; pdf-lib owns structural edits
 * (rotate / delete / reorder / merge / split) and final serialization.
 *
 * Edits mutate the pdf-lib document. After any structural edit we re-serialize
 * and reload pdf.js from the new bytes so what you see always matches what you
 * will save.
 */
export class PdfDocumentModel {
  pdfjsDoc!: PDFDocumentProxy;
  libDoc!: PDFDocument;
  annotations = new AnnotationStore();
  fileName = 'document.pdf';

  static async open(bytes: ArrayBuffer, fileName: string): Promise<PdfDocumentModel> {
    const model = new PdfDocumentModel();
    model.fileName = fileName;
    await model.load(new Uint8Array(bytes));
    return model;
  }

  get pageCount(): number {
    return this.pdfjsDoc.numPages;
  }

  private async load(data: Uint8Array): Promise<void> {
    // pdf.js transfers (detaches) the buffer it receives, so hand each library
    // its own copy. Uint8Array.slice() allocates a fresh backing buffer.
    this.libDoc = await PDFDocument.load(data.slice());
    this.pdfjsDoc = await pdfjsLib.getDocument({ data: data.slice() }).promise;
  }

  /** Re-serialize the pdf-lib doc and reload pdf.js so views stay in sync. */
  private async refresh(): Promise<void> {
    const bytes = await this.libDoc.save();
    await this.pdfjsDoc.destroy();
    await this.load(bytes);
  }

  async rotatePage(pageIndex: number, delta: number): Promise<void> {
    const page = this.libDoc.getPage(pageIndex);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + delta + 360) % 360));
    await this.refresh();
  }

  async deletePage(pageIndex: number): Promise<void> {
    if (this.pageCount <= 1) throw new Error('A PDF must keep at least one page.');
    this.libDoc.removePage(pageIndex);
    const oldToNew = new Map<number, number | null>();
    let shift = 0;
    for (let i = 0; i < this.pageCount; i += 1) {
      if (i === pageIndex) {
        oldToNew.set(i, null);
        shift = 1;
      } else {
        oldToNew.set(i, i - shift);
      }
    }
    this.annotations.remap(oldToNew);
    await this.refresh();
  }

  async movePage(from: number, to: number): Promise<void> {
    if (from === to) return;
    const [removed] = this.libDoc.getPages().slice(from, from + 1);
    this.libDoc.removePage(from);
    this.libDoc.insertPage(to, removed);
    await this.refresh();
  }

  /** Append all pages of another PDF after the current last page. */
  async mergeAppend(bytes: ArrayBuffer): Promise<void> {
    const other = await PDFDocument.load(bytes);
    const copied = await this.libDoc.copyPages(other, other.getPageIndices());
    for (const p of copied) this.libDoc.addPage(p);
    await this.refresh();
  }

  /** Produce a new PDF containing only the given 0-based page indices. */
  async extractPages(indices: number[]): Promise<Uint8Array> {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(this.libDoc, indices);
    for (const p of copied) out.addPage(p);
    return out.save();
  }

  /** Bake annotations and return the final PDF bytes. */
  async exportBytes(): Promise<Uint8Array> {
    // Bake into a clone so repeated saves don't double-apply annotations.
    const clone = await PDFDocument.load(await this.libDoc.save());
    await this.annotations.bake(clone);
    return clone.save();
  }

  async destroy(): Promise<void> {
    await this.pdfjsDoc.destroy();
  }
}
