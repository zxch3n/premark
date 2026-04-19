# Fonts

Font selection drives layout precision.

Sans stack: `Inter, -apple-system, system-ui`
Mono stack: `JetBrains Mono, ui-monospace`

Pretext measures real glyph metrics, so the layout matches the eventual paint. CJK and emoji fold into the fallback chain.

中文段落用于验证混合排版与禁则。日本語のテキストも問題なくレンダーされます。

Used by [[layout-engine]] and [[renderer]].
