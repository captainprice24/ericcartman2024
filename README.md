# OpenPDF Studio

A web-based PDF **viewer and editor**, built to grow toward the capabilities of
Adobe Acrobat. Runs entirely in the browser — no server, no upload; your files
never leave your machine.

> **Status:** early foundation. The core engine (render, navigate, search,
> annotate, page operations, save) works today. The feature set below tracks
> the road to Acrobat-level parity.

## Tech stack

- **[PDF.js](https://mozilla.github.io/pdf.js/)** — page rendering + text layer
  (selection & search), the same engine Firefox ships.
- **[pdf-lib](https://pdf-lib.js.org/)** — structural edits (rotate, delete,
  reorder, merge, split) and writing the output PDF, including baked annotations.
- **Vite + TypeScript** — build tooling and a typed, modular codebase.

Rendering and editing are intentionally split: PDF.js owns what you *see*,
pdf-lib owns what you *save*. After any structural edit the document is
re-serialized and PDF.js reloads from the new bytes, so the view always matches
what will be written to disk.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

Then open a PDF with the **Open** button or drag-and-drop one onto the page.

## Features today

| Area | Capability |
| --- | --- |
| View | Open local PDFs, continuous page scroll, thumbnails, zoom, page jump |
| Text | Selectable text layer, full-document case-insensitive search with match stepping |
| Annotate | Highlight, freehand ink, sticky notes, free text — stored in PDF coordinates |
| Pages | Rotate, delete (merge/split/reorder available in the document model) |
| Save | Export an edited PDF with annotations baked in, nothing uploaded |

## Architecture

```
src/
  pdfjs.ts        PDF.js + worker configuration
  types.ts        Annotation + tool types (PDF-space coordinates)
  document.ts     PdfDocumentModel — load, page ops, export (pdf-lib + pdf.js)
  renderer.ts     Renderer — canvas + text layer + annotation overlay per page
  annotations.ts  AnnotationStore — in-memory model + bake into output PDF
  tools.ts        ToolController — pointer gestures -> annotations
  search.ts       SearchIndex — full-text search over page text
  main.ts         UI wiring, toolbar, thumbnails, zoom, save
```

Annotations are always kept in **PDF user-space points** (origin bottom-left),
so they are independent of zoom and device pixel ratio and can be written into
the output PDF by pdf-lib with no conversion.

## Roadmap to Acrobat parity

**Near term**
- [ ] Reorder pages by drag-and-drop in the thumbnail rail (model support exists)
- [ ] Merge / split UI (model support exists)
- [ ] Insert blank / imported pages
- [ ] Annotation selection, move, resize, delete, and an undo/redo stack
- [ ] Highlight snapped to selected text runs (not just a drawn rectangle)
- [ ] Persist the edited document to the File System Access API

**Mid term**
- [ ] AcroForm form filling (text fields, checkboxes, radios, dropdowns)
- [ ] Form field creation and a form-designer mode
- [ ] In-place text editing of existing page content
- [ ] Image insertion / replacement / extraction
- [ ] Bookmarks/outline editor, page labels, document properties & metadata
- [ ] Redaction (true content removal, not just a black box)

**Longer term**
- [ ] OCR for scanned PDFs (searchable text layer) via a WASM engine
- [ ] Digital & electronic signatures, signature verification
- [ ] PDF/A conversion and validation
- [ ] Export to Word / images / HTML, and create-PDF-from-file
- [ ] Compare documents, Bates numbering, watermarks, headers/footers
- [ ] Accessibility (tagged PDF) tooling

## Testing

A headless smoke test drives the built app in Chromium to verify rendering,
the text layer, search, page rotation and the save flow against a generated
sample PDF. (Playwright-based; wiring it into `npm test` is a near-term task.)

## License

TBD.
