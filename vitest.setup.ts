/**
 * Polyfill OffscreenCanvas for Node.js using @napi-rs/canvas.
 * Pretext requires OffscreenCanvas for text measurement.
 */
import { createCanvas } from '@napi-rs/canvas'

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  // @ts-expect-error — polyfill OffscreenCanvas with @napi-rs/canvas
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    private canvas: ReturnType<typeof createCanvas>
    width: number
    height: number

    constructor(width: number, height: number) {
      this.width = width
      this.height = height
      this.canvas = createCanvas(width, height)
    }

    getContext(type: string) {
      if (type === '2d') {
        return this.canvas.getContext('2d')
      }
      return null
    }
  }
}
