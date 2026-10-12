// Central place to configure pdfjs-dist. Importing the worker via ?url lets
// Vite emit it as a proper asset and gives us a stable URL at runtime.
import * as pdfjsLib from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Allow the host page to override the worker URL at runtime (e.g. when the
// app is served from a static host where assets live at a different URL).
// Falls back to the Vite-bundled worker asset for normal dev/build.
const overrideSrc = (globalThis as unknown as { __PDF_WORKER_SRC__?: string })
  .__PDF_WORKER_SRC__;
pdfjsLib.GlobalWorkerOptions.workerSrc = overrideSrc || workerUrl;

export { pdfjsLib };
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;
export type PDFPageProxy = pdfjsLib.PDFPageProxy;
