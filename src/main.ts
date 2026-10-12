import './styles.css';
import { PdfDocumentModel } from './document';
import { Renderer } from './renderer';
import { ToolController } from './tools';
import { SearchIndex, type SearchMatch } from './search';
import type { Tool } from './types';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const pagesEl = $('#pages');
const emptyState = $('#empty-state');
const thumbs = $('#thumbnails');
const fileInput = $<HTMLInputElement>('#file-input');
const pageInput = $<HTMLInputElement>('#page-input');
const pageCountEl = $('#page-count');
const zoomLevelEl = $('#zoom-level');
const searchInput = $<HTMLInputElement>('#search-input');
const searchStatus = $('#search-status');

let model: PdfDocumentModel | null = null;
let renderer: Renderer | null = null;
let tools: ToolController | null = null;
let searchIndex: SearchIndex | null = null;
let currentPage = 0;
let matches: SearchMatch[] = [];
let matchPos = -1;

function setDocumentControlsEnabled(enabled: boolean): void {
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      '[data-action]:not([data-action="open"]), [data-tool], #page-input, #search-input',
    )
    .forEach((el) => {
      el.disabled = !enabled;
    });
}

async function openFile(file: File): Promise<void> {
  const bytes = await file.arrayBuffer();
  if (model) await model.destroy();

  model = await PdfDocumentModel.open(bytes, file.name);
  renderer = new Renderer(model, pagesEl);
  tools = new ToolController(model, renderer, markDirty);
  searchIndex = new SearchIndex(model);

  emptyState.style.display = 'none';
  await rerender();
  await searchIndex.build();
  setDocumentControlsEnabled(true);
  goToPage(0);
}

async function rerender(): Promise<void> {
  if (!renderer || !tools) return;
  await renderer.renderAll();
  for (const view of renderer.views) tools.attach(view);
  tools.syncInteractivity();
  buildThumbnails();
  pageCountEl.textContent = String(model!.pageCount);
  pageInput.max = String(model!.pageCount);
  zoomLevelEl.textContent = `${Math.round(renderer.scale * 100)}%`;
  observePages();
}

function buildThumbnails(): void {
  if (!renderer) return;
  thumbs.replaceChildren();
  renderer.views.forEach((view) => {
    const t = document.createElement('button');
    t.className = 'thumb';
    t.dataset.pageIndex = String(view.pageIndex);
    const img = view.canvas.toDataURL();
    t.innerHTML = `<img src="${img}" alt="Page ${view.pageIndex + 1}" /><span>${view.pageIndex + 1}</span>`;
    t.addEventListener('click', () => goToPage(view.pageIndex));
    thumbs.append(t);
  });
}

let pageObserver: IntersectionObserver | null = null;
function observePages(): void {
  pageObserver?.disconnect();
  pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
          currentPage = idx;
          pageInput.value = String(idx + 1);
          highlightThumb(idx);
        }
      }
    },
    { root: $('#viewer'), threshold: 0.5 },
  );
  renderer?.views.forEach((v) => pageObserver!.observe(v.container));
}

function highlightThumb(idx: number): void {
  thumbs.querySelectorAll('.thumb').forEach((t) => {
    t.classList.toggle('is-active', Number((t as HTMLElement).dataset.pageIndex) === idx);
  });
}

function goToPage(idx: number): void {
  if (!renderer) return;
  const clamped = Math.max(0, Math.min(idx, model!.pageCount - 1));
  renderer.views[clamped]?.container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  currentPage = clamped;
  pageInput.value = String(clamped + 1);
  highlightThumb(clamped);
}

async function setZoom(scale: number): Promise<void> {
  if (!renderer) return;
  renderer.scale = Math.max(0.25, Math.min(scale, 5));
  await rerender();
  goToPage(currentPage);
}

function markDirty(): void {
  const saveBtn = document.querySelector<HTMLButtonElement>('[data-action="save"]');
  if (saveBtn) saveBtn.disabled = false;
}

async function save(): Promise<void> {
  if (!model) return;
  const bytes = await model.exportBytes();
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = model.fileName.replace(/\.pdf$/i, '') + '-edited.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

function runSearch(): void {
  if (!searchIndex) return;
  matches = searchIndex.search(searchInput.value);
  matchPos = matches.length ? 0 : -1;
  searchStatus.textContent = matches.length ? `1 / ${matches.length}` : 'No matches';
  if (matchPos >= 0) goToPage(matches[matchPos].pageIndex);
}

function stepSearch(dir: 1 | -1): void {
  if (!matches.length) return;
  matchPos = (matchPos + dir + matches.length) % matches.length;
  searchStatus.textContent = `${matchPos + 1} / ${matches.length}`;
  goToPage(matches[matchPos].pageIndex);
}

function setTool(tool: Tool): void {
  if (!tools) return;
  tools.tool = tool;
  tools.syncInteractivity();
  document.querySelectorAll('[data-tool]').forEach((b) => {
    b.classList.toggle('is-active', (b as HTMLElement).dataset.tool === tool);
  });
}

// --- Event wiring --------------------------------------------------------

document.addEventListener('click', async (e) => {
  const target = (e.target as HTMLElement).closest('[data-action], [data-tool]');
  if (!target) return;
  const action = target.getAttribute('data-action');
  const tool = target.getAttribute('data-tool');

  if (tool) return setTool(tool as Tool);
  if (!action) return;

  switch (action) {
    case 'open':
      fileInput.click();
      break;
    case 'save':
      await save();
      break;
    case 'prev':
      goToPage(currentPage - 1);
      break;
    case 'next':
      goToPage(currentPage + 1);
      break;
    case 'zoom-in':
      await setZoom((renderer?.scale ?? 1) + 0.25);
      break;
    case 'zoom-out':
      await setZoom((renderer?.scale ?? 1) - 0.25);
      break;
    case 'rotate':
      if (model) {
        await model.rotatePage(currentPage, 90);
        await rerender();
        goToPage(currentPage);
        markDirty();
      }
      break;
    case 'delete-page':
      if (model) {
        try {
          await model.deletePage(currentPage);
          await rerender();
          goToPage(Math.min(currentPage, model.pageCount - 1));
          markDirty();
        } catch (err) {
          alert((err as Error).message);
        }
      }
      break;
    case 'search-next':
      stepSearch(1);
      break;
    case 'search-prev':
      stepSearch(-1);
      break;
  }
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (file) await openFile(file);
  fileInput.value = '';
});

pageInput.addEventListener('change', () => goToPage(Number(pageInput.value) - 1));

let searchTimer: number | undefined;
searchInput.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(runSearch, 200);
});

// Drag & drop to open.
const viewer = $('#viewer');
viewer.addEventListener('dragover', (e) => {
  e.preventDefault();
  viewer.classList.add('is-dropping');
});
viewer.addEventListener('dragleave', () => viewer.classList.remove('is-dropping'));
viewer.addEventListener('drop', async (e) => {
  e.preventDefault();
  viewer.classList.remove('is-dropping');
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type === 'application/pdf') await openFile(file);
});
