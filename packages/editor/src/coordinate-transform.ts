export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface EditorCoordinateTransform {
  readonly viewportLeft: number;
  readonly viewportTop: number;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
  readonly scale?: number;
  readonly deviceScaleFactor?: number;
  readonly worldOffsetX?: number;
  readonly worldOffsetY?: number;
  readonly worldScale?: number;
}

export function clientPointToSurfacePoint(
  point: Point,
  transform: EditorCoordinateTransform,
): Point {
  const scale = transform.scale ?? 1;
  return {
    x: (point.x - transform.viewportLeft) / scale + (transform.scrollLeft ?? 0),
    y: (point.y - transform.viewportTop) / scale + (transform.scrollTop ?? 0),
  };
}

export function surfacePointToClientPoint(
  point: Point,
  transform: EditorCoordinateTransform,
): Point {
  const scale = transform.scale ?? 1;
  return {
    x: (point.x - (transform.scrollLeft ?? 0)) * scale + transform.viewportLeft,
    y: (point.y - (transform.scrollTop ?? 0)) * scale + transform.viewportTop,
  };
}

export function surfacePointToDevicePixel(
  point: Point,
  transform: Pick<EditorCoordinateTransform, "deviceScaleFactor">,
): Point {
  const deviceScaleFactor = transform.deviceScaleFactor ?? 1;
  return {
    x: point.x * deviceScaleFactor,
    y: point.y * deviceScaleFactor,
  };
}

export function clientPointToWorldPoint(point: Point, transform: EditorCoordinateTransform): Point {
  const surface = clientPointToSurfacePoint(point, transform);
  const worldScale = transform.worldScale ?? 1;
  return {
    x: (surface.x - (transform.worldOffsetX ?? 0)) / worldScale,
    y: (surface.y - (transform.worldOffsetY ?? 0)) / worldScale,
  };
}

export function worldPointToClientPoint(point: Point, transform: EditorCoordinateTransform): Point {
  const worldScale = transform.worldScale ?? 1;
  return surfacePointToClientPoint(
    {
      x: point.x * worldScale + (transform.worldOffsetX ?? 0),
      y: point.y * worldScale + (transform.worldOffsetY ?? 0),
    },
    transform,
  );
}
