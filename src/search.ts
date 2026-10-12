import type { PdfDocumentModel } from './document';

export interface SearchMatch {
  pageIndex: number;
  /** Index within the concatenated page text, for scrolling into view. */
  itemIndex: number;
  text: string;
}

/**
 * Simple full-document text search over pdf.js text content. Case-insensitive
 * substring match; returns matches in document order.
 */
export class SearchIndex {
  private pageText: string[] = [];
  private built = false;

  constructor(private model: PdfDocumentModel) {}

  async build(): Promise<void> {
    this.pageText = [];
    for (let i = 0; i < this.model.pageCount; i += 1) {
      const page = await this.model.pdfjsDoc.getPage(i + 1);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ');
      this.pageText.push(text);
    }
    this.built = true;
  }

  search(query: string): SearchMatch[] {
    if (!this.built || !query.trim()) return [];
    const needle = query.toLowerCase();
    const matches: SearchMatch[] = [];
    this.pageText.forEach((text, pageIndex) => {
      const hay = text.toLowerCase();
      let from = 0;
      for (;;) {
        const idx = hay.indexOf(needle, from);
        if (idx === -1) break;
        matches.push({
          pageIndex,
          itemIndex: idx,
          text: text.slice(idx, idx + query.length),
        });
        from = idx + needle.length;
      }
    });
    return matches;
  }
}
