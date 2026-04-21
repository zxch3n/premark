import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  createInMemoryPremarkEditorController,
  createPremarkEditorController,
  type PremarkEditorEvent,
} from "../src/index.ts";

installNodeCanvas();

function buildLargeViewportFixture(targetLength = 110_000): string {
  const section = [
    "## Section",
    "",
    "User edit anchor paragraph with **bold**, `code`, [docs](https://example.com), and emoji 👨‍👩‍👧‍👦.",
    "",
    "AI stream target paragraph with enough text to append generated content away from the user.",
    "",
    "Remote patch target paragraph with enough text to keep block ranges stable.",
    "",
  ].join("\n");
  let markdown = "# Large editor\n\n";
  while (markdown.length < targetLength) {
    markdown += section;
  }
  return markdown;
}

describe("PremarkEditorController", () => {
  it("exposes markdown, selection, version and render snapshot through the public API", () => {
    const controller = createInMemoryPremarkEditorController("Hello **world**", 600);

    const worldFrom = controller.markdown().indexOf("world");
    controller.setSelection(worldFrom, worldFrom + "world".length);

    expect(controller.version()).toBe(0);
    expect(controller.selection()).toMatchObject({
      anchorOffset: worldFrom,
      headOffset: worldFrom + "world".length,
      from: worldFrom,
      to: worldFrom + "world".length,
      isCollapsed: false,
    });

    const snapshot = controller.renderSnapshot();
    expect(snapshot.markdown).toBe("Hello **world**");
    expect(snapshot.viewMarkdown).toContain("**world**");
    expect(snapshot.renderMode).toBe("active-controls");
    expect(snapshot.activeControls).toHaveLength(1);
    expect(snapshot.layout.blocks).toHaveLength(1);
    expect(snapshot.editableIndex.fragments.some((fragment) => fragment.text === "world")).toBe(
      true,
    );
    expect(snapshot.viewport.containerWidth).toBe(600);
  });

  it("emits change and final selection snapshots after replacing selection", () => {
    const controller = createInMemoryPremarkEditorController("Hello world", 600);
    const worldFrom = controller.markdown().indexOf("world");
    controller.setSelection(worldFrom, worldFrom + "world".length);

    const events: PremarkEditorEvent[] = [];
    controller.on("change", (event) => events.push(event));
    controller.on("selectionchange", (event) => events.push(event));

    controller.replaceSelection("Premark");

    expect(controller.markdown()).toBe("Hello Premark");
    expect(events.map((event) => event.type)).toEqual(["change", "selectionchange"]);
    expect(events[0]?.snapshot.markdown).toBe("Hello Premark");
    expect(events[0]?.snapshot.selection).toMatchObject({
      anchorOffset: worldFrom + "Premark".length,
      headOffset: worldFrom + "Premark".length,
      isCollapsed: true,
    });
  });

  it("applies input intents and local undo through the public API", () => {
    const controller = createInMemoryPremarkEditorController("Hello", 600);
    controller.setCaret(controller.markdown().length);

    const applied = controller.applyInputIntent({ type: "insert-text", text: " world" });

    expect(applied.type).toBe("edit");
    expect(controller.markdown()).toBe("Hello world");
    expect(controller.undo()).toBe(true);
    expect(controller.markdown()).toBe("Hello");
    expect(controller.redo()).toBe(true);
    expect(controller.markdown()).toBe("Hello world");
  });

  it("supports full-document replacement with explicit selection", () => {
    const controller = createInMemoryPremarkEditorController("Old", 600);
    const change = controller.setMarkdown("# New", {
      selection: { anchor: 2, head: 5 },
    });

    expect(change).toMatchObject({
      from: 0,
      to: 3,
      insert: "# New",
      deleted: "Old",
    });
    expect(controller.markdown()).toBe("# New");
    expect(controller.selection()).toMatchObject({
      anchorOffset: 2,
      headOffset: 5,
      from: 2,
      to: 5,
    });
  });

  it("emits composition and viewport events", () => {
    const controller = createPremarkEditorController({
      markdown: "Hello world",
      containerWidth: 600,
    });
    const events: PremarkEditorEvent[] = [];
    controller.on("compositionchange", (event) => events.push(event));
    controller.on("viewportchange", (event) => events.push(event));

    controller.setSelection(6, 11);
    const view = controller.updateComposition("世界");
    const compositionSnapshot = controller.renderSnapshot();
    controller.resize(320);

    expect(view.virtualText).toBe("Hello 世界");
    expect(compositionSnapshot.renderMode).toBe("composition");
    expect(compositionSnapshot.viewMarkdown).toBe("Hello 世界");
    expect(compositionSnapshot.compositionRects.length).toBeGreaterThan(0);
    expect(events.map((event) => event.type)).toEqual(["compositionchange", "viewportchange"]);
    expect(events[0]?.snapshot.compositionView?.preeditText).toBe("世界");
    expect(events[1]).toMatchObject({
      type: "viewportchange",
      viewport: { containerWidth: 320 },
    });
  });

  it("can apply source edits without recording them in local undo", () => {
    const controller = createInMemoryPremarkEditorController("abc", 600);

    controller.applyEdit(
      {
        type: "insert",
        offset: 1,
        text: "X",
      },
      { recordUndo: false, selection: "inserted-end" },
    );

    expect(controller.markdown()).toBe("aXbc");
    expect(controller.selection()).toMatchObject({
      anchorOffset: 2,
      headOffset: 2,
    });
    expect(controller.undo()).toBe(false);
    expect(controller.markdown()).toBe("aXbc");
  });

  it("toggles task checkboxes through the public controller API", () => {
    const controller = createInMemoryPremarkEditorController("- [ ] todo", 600);
    const todoFrom = controller.markdown().indexOf("todo");
    controller.setSelection(todoFrom, todoFrom + "todo".length);

    const result = controller.toggleTaskCheckbox(todoFrom);

    expect(result.type).toBe("edit");
    expect(controller.markdown()).toBe("- [x] todo");
    expect(controller.selection()).toMatchObject({
      from: todoFrom,
      to: todoFrom + "todo".length,
    });
    expect(controller.undo()).toBe(true);
    expect(controller.markdown()).toBe("- [ ] todo");
  });

  it("keeps render snapshots on a viewport editable index for large documents", () => {
    const markdown = buildLargeViewportFixture();
    const controller = createPremarkEditorController({
      markdown,
      containerWidth: 560,
      viewportHeight: 260,
      overscanY: 120,
    });
    const fullController = createInMemoryPremarkEditorController(markdown, 560);

    const snapshot = controller.renderSnapshot({ activeControls: false });
    const fullSnapshot = fullController.renderSnapshot({ activeControls: false });

    expect(snapshot.viewport).toMatchObject({
      containerWidth: 560,
      scrollTop: 0,
      height: 260,
      overscanY: 120,
    });
    expect(snapshot.renderUpdate.editableIndex.viewport).toBeDefined();
    expect(snapshot.editableIndex.fragments.length).toBeLessThan(
      fullSnapshot.editableIndex.fragments.length / 20,
    );

    const boldOffset = markdown.indexOf("bold") + 1;
    controller.setCaret(boldOffset);
    const activeSnapshot = controller.renderSnapshot();
    expect(activeSnapshot.renderMode).toBe("active-controls");
    expect(activeSnapshot.renderUpdate.editableIndex.viewport).toBeDefined();
    expect(activeSnapshot.editableIndex.fragments.length).toBeLessThan(
      fullSnapshot.editableIndex.fragments.length / 20,
    );
  }, 20_000);

  it("does not rebuild a full editable index for offscreen AI appends", () => {
    const markdown = buildLargeViewportFixture();
    const controller = createPremarkEditorController({
      markdown,
      containerWidth: 560,
      viewportHeight: 260,
      overscanY: 120,
    });
    const fullController = createInMemoryPremarkEditorController(markdown, 560);
    const fullFragmentCount = fullController.renderSnapshot({
      activeControls: false,
    }).editableIndex.fragments.length;
    const appendOffset =
      markdown.lastIndexOf("AI stream target paragraph") + "AI stream target paragraph".length;

    controller.applyEdit(
      {
        type: "insert",
        offset: appendOffset,
        text: " streamed token",
      },
      { recordUndo: false, selection: "preserve" },
    );
    const snapshot = controller.renderSnapshot({ activeControls: false });

    expect(snapshot.renderUpdate.layout?.mode).toBe("incremental");
    expect(snapshot.renderUpdate.editableIndex.mode).toBe("incremental");
    expect(snapshot.renderUpdate.editableIndex.viewport).toBeDefined();
    expect(snapshot.renderUpdate.editableIndex.rebuiltFragmentCount).toBeLessThan(
      fullFragmentCount / 20,
    );
    expect(snapshot.editableIndex.fragments.length).toBeLessThan(fullFragmentCount / 20);
    expect(snapshot.renderUpdate.dirtyRects).toEqual([]);
  }, 20_000);

  it("applies remote patches without recording local undo and rebases selection", () => {
    const controller = createInMemoryPremarkEditorController("alpha beta gamma", 560);
    controller.setSelection(6, 10);

    const result = controller.applyRemotePatch({
      actorId: "peer-1",
      changes: [
        { from: 0, to: 0, insert: "pre " },
        { from: "alpha beta gamma".length, to: "alpha beta gamma".length, insert: " tail" },
      ],
    });

    expect(controller.markdown()).toBe("pre alpha beta gamma tail");
    expect(result.actorId).toBe("peer-1");
    expect(result.beforeSelection).toMatchObject({ from: 6, to: 10 });
    expect(result.afterSelection).toMatchObject({ from: 10, to: 14 });
    expect(controller.markdown().slice(result.afterSelection.from, result.afterSelection.to)).toBe(
      "beta",
    );
    expect(controller.undo()).toBe(false);
  });

  it("preserves or reports composition conflicts around remote patches", () => {
    const controller = createInMemoryPremarkEditorController("alpha beta gamma", 560);
    controller.setSelection(6, 10);
    controller.updateComposition("测试");

    const preserved = controller.applyRemotePatch({
      actorId: "peer-1",
      changes: [{ from: 0, to: 0, insert: "pre " }],
    });

    expect(preserved.composition).toBe("preserved");
    expect(controller.renderSnapshot().compositionView).toMatchObject({
      replacementRange: { from: 10, to: 14 },
      hasConflict: false,
    });
    controller.commitComposition();
    expect(controller.markdown()).toBe("pre alpha 测试 gamma");

    const conflicting = createInMemoryPremarkEditorController("alpha beta gamma", 560);
    conflicting.setSelection(6, 10);
    conflicting.updateComposition("测试");
    const conflict = conflicting.applyRemotePatch({
      actorId: "peer-2",
      changes: [{ from: 8, to: 8, insert: "REMOTE" }],
    });

    expect(conflict.composition).toBe("conflict");
    expect(conflicting.renderSnapshot().compositionView?.hasConflict).toBe(true);
    expect(() => conflicting.commitComposition()).toThrow(/replacement range changed/u);
  });

  it("keeps offscreen AI remote patches on the viewport incremental path", () => {
    const markdown = buildLargeViewportFixture();
    const controller = createPremarkEditorController({
      markdown,
      containerWidth: 560,
      viewportHeight: 260,
      overscanY: 120,
    });
    const userOffset = markdown.indexOf("User edit anchor") + "User".length;
    controller.setCaret(userOffset);
    const appendOffset =
      markdown.lastIndexOf("AI stream target paragraph") + "AI stream target paragraph".length;

    const result = controller.applyRemotePatch({
      origin: "ai",
      actorId: "assistant",
      changes: [{ from: appendOffset, to: appendOffset, insert: " streamed token" }],
    });

    expect(result.origin).toBe("ai");
    expect(result.afterSelection).toMatchObject({ from: userOffset, to: userOffset });
    expect(result.snapshot.renderUpdate.editableIndex.mode).toBe("incremental");
    expect(result.snapshot.renderUpdate.editableIndex.viewport).toBeDefined();
    expect(result.snapshot.renderUpdate.dirtyRects).toEqual([]);
  });

  it("simulates AI same-block modification without moving local selection elsewhere", () => {
    const markdown = [
      "# Draft",
      "",
      "User edit anchor paragraph.",
      "",
      "AI stream target paragraph with draft wording.",
    ].join("\n");
    const controller = createPremarkEditorController({
      markdown,
      containerWidth: 560,
      viewportHeight: 260,
      overscanY: 120,
    });
    const userOffset = markdown.indexOf("User edit anchor") + "User".length;
    const draftFrom = markdown.indexOf("draft wording");
    controller.setCaret(userOffset);

    const result = controller.applyRemotePatch({
      origin: "ai",
      actorId: "assistant",
      changes: [
        {
          from: draftFrom,
          to: draftFrom + "draft".length,
          insert: "revised",
        },
      ],
    });

    expect(controller.markdown()).toContain("AI stream target paragraph with revised wording.");
    expect(result.afterSelection).toMatchObject({ from: userOffset, to: userOffset });
    expect(result.snapshot.renderUpdate.editableIndex.mode).toBe("incremental");
  });
});
