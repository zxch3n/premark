# Code Blocks and Tables

```ts
type RenderResult = {
  file: string;
  width: number;
  height: number;
};

export function renderMarkdown(file: string, width: number): RenderResult {
  const clampedWidth = Math.max(320, width);
  return { file, width: clampedWidth, height: clampedWidth * 0.75 };
}
```

```bash
pnpm install
pnpm render:examples
printf '%s\n' "long shell lines should wrap cleanly in the canvas renderer as well"
```

| Syntax |             Example              | Alignment |
| :----- | :------------------------------: | --------: |
| Strong |             **bold**             |     right |
| Code   |        `const value = 1`         |  centered |
| Link   | [docs](https://example.com/docs) |      left |
| Mixed  |      _italic_ + ~~strike~~       |    stable |
