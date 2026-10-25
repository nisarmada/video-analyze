export type ContentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Visible picture rectangle for a video drawn with object-fit: contain.
 * Landmark coordinates are relative to the video frame, not the element box.
 */
export function objectFitContainRect(
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
): ContentRect {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return { x: 0, y: 0, width: Math.max(0, containerWidth), height: Math.max(0, containerHeight) };
  }
  const scale = Math.min(containerWidth / contentWidth, containerHeight / contentHeight);
  const width = contentWidth * scale;
  const height = contentHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function mapLandmarkToCanvas(
  point: { x: number; y: number },
  rect: ContentRect,
): { x: number; y: number } {
  return {
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height,
  };
}
