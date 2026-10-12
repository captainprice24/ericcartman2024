export type Tool = 'select' | 'highlight' | 'draw' | 'note' | 'text';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Annotations are stored in PDF user-space coordinates (origin bottom-left,
 * points) so they survive zoom/rotation and can be baked into the output PDF
 * with pdf-lib without any further conversion.
 */
interface BaseAnnotation {
  id: string;
  pageIndex: number;
  color: RGB;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: 'highlight';
  /** Rectangle in PDF points: [x, y, width, height]. */
  rect: [number, number, number, number];
  opacity: number;
}

export interface InkAnnotation extends BaseAnnotation {
  type: 'ink';
  /** One stroke = array of [x, y] points in PDF points. */
  paths: Array<Array<[number, number]>>;
  width: number;
}

export interface NoteAnnotation extends BaseAnnotation {
  type: 'note';
  /** Anchor point in PDF points. */
  x: number;
  y: number;
  text: string;
}

export interface TextAnnotation extends BaseAnnotation {
  type: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
}

export type Annotation =
  | HighlightAnnotation
  | InkAnnotation
  | NoteAnnotation
  | TextAnnotation;
