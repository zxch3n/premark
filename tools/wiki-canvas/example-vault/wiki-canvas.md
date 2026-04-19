# Wiki Canvas

A **PixiJS**-driven viewer. Each note becomes a 625×625 sprite, drawn via Canvas2D using the [[layout-engine]].

Pipeline:

1. Scan the repo for `*.md`
2. Extract `[[wikilinks]]` (this paragraph counts!)
3. Run grid layout per connected component
4. Render each tile with [[renderer|premark]]
5. Pan + zoom on the giant canvas

\`\`\`ts
await mountWikiCanvas(container, { nodes })
\`\`\`

Related: [[premark]], [[performance]], [[design-notes]].
