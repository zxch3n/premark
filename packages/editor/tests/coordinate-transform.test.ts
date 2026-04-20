import { describe, expect, it } from "vite-plus/test";

import {
  clientPointToSurfacePoint,
  clientPointToWorldPoint,
  surfacePointToClientPoint,
  surfacePointToDevicePixel,
  worldPointToClientPoint,
  type EditorCoordinateTransform,
} from "../src/index.ts";

describe("editor coordinate transforms", () => {
  it("maps client coordinates into scrolled surface coordinates", () => {
    const transform: EditorCoordinateTransform = {
      viewportLeft: 20,
      viewportTop: 30,
      scrollLeft: 100,
      scrollTop: 200,
    };

    expect(clientPointToSurfacePoint({ x: 70, y: 90 }, transform)).toEqual({
      x: 150,
      y: 260,
    });
    expect(surfacePointToClientPoint({ x: 150, y: 260 }, transform)).toEqual({
      x: 70,
      y: 90,
    });
  });

  it("accounts for css zoom and device scale factor separately", () => {
    const transform: EditorCoordinateTransform = {
      viewportLeft: 10,
      viewportTop: 20,
      scale: 2,
      deviceScaleFactor: 3,
    };

    const surface = clientPointToSurfacePoint({ x: 50, y: 80 }, transform);
    expect(surface).toEqual({
      x: 20,
      y: 30,
    });
    expect(surfacePointToDevicePixel(surface, transform)).toEqual({
      x: 60,
      y: 90,
    });
  });

  it("round-trips nested world coordinates through surface transforms", () => {
    const transform: EditorCoordinateTransform = {
      viewportLeft: 10,
      viewportTop: 20,
      scrollLeft: 40,
      scrollTop: 80,
      scale: 2,
      worldOffsetX: 300,
      worldOffsetY: 500,
      worldScale: 4,
    };

    const client = worldPointToClientPoint({ x: 25, y: 35 }, transform);
    expect(clientPointToWorldPoint(client, transform)).toEqual({
      x: 25,
      y: 35,
    });
  });
});
