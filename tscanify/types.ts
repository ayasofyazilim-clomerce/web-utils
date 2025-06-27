// Types for tscanify

export interface Point {
  x: number;
  y: number;
}

export interface HighlightOptions {
  color?: string;
  thickness?: number;
}

export interface CornerPoints {
  topLeftCorner: Point;
  topRightCorner: Point;
  bottomLeftCorner: Point;
  bottomRightCorner: Point;
}
