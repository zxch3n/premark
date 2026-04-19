# Performance Notes

Targets for [[wiki-canvas]]:

- < 16ms per tile draw at 625×625
- Streaming-friendly via [[layout-engine]]
- Sprite culling when `scale < 0.15`

| Doc size | Layout |  Draw | Total |
| :------- | -----: | ----: | ----: |
| 1 KB     |  0.5ms | 1.2ms | 1.7ms |
| 10 KB    |  3.1ms | 4.0ms | 7.1ms |
| 100 KB   |   18ms |  22ms |  40ms |

> Caching the `Texture.from(canvas)` lets PIXI batch upload at scale.

See [[design-notes]] for the cross-tile linking strategy.
