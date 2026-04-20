import { installNodeCanvas } from "../../layout/src/node-canvas.ts";
import { describe, expect, it } from "vite-plus/test";

import {
  createInMemoryPremarkEditorController,
  createPremarkEditorController,
  type PremarkEditorEvent,
} from "../src/index.ts";

installNodeCanvas();

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
});
