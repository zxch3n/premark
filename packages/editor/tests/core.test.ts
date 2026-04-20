import { describe, expect, it } from "vite-plus/test";

import {
  applyEditOperation,
  createCompositionSession,
  createInMemoryTextDocumentAdapter,
  LocalUndoManager,
} from "../src/index.ts";

describe("InMemoryTextDocumentAdapter stable ranges", () => {
  it("preserves selection direction and expands around inserts inside the range", () => {
    const adapter = createInMemoryTextDocumentAdapter("alpha beta gamma");
    const range = adapter.createRange(10, 6, {
      kind: "selection",
      bias: "expand",
    });

    adapter.transact((tx) => {
      tx.insert(0, "pre ");
    });

    expect(adapter.resolveRange(range)).toMatchObject({
      anchor: 14,
      head: 10,
      from: 10,
      to: 14,
      direction: "backward",
      text: "beta",
    });

    adapter.transact((tx) => {
      tx.insert(12, "++");
    });

    expect(adapter.resolveRange(range)).toMatchObject({
      anchor: 16,
      head: 10,
      text: "be++ta",
      direction: "backward",
    });
  });

  it("collapses composition ranges when overlapping edits use collapse-on-edit", () => {
    const adapter = createInMemoryTextDocumentAdapter("alpha beta gamma");
    const range = adapter.createRange(6, 10, {
      kind: "composition",
      bias: "collapse-on-edit",
    });

    adapter.transact((tx) => {
      tx.replaceRange({ from: 8, to: 12 }, "X");
    });

    expect(adapter.resolveRange(range)).toMatchObject({
      from: 9,
      to: 9,
      isCollapsed: true,
    });
  });
});

describe("edit operations", () => {
  it("replaces a cross-block source range without relying on textarea selection", () => {
    const adapter = createInMemoryTextDocumentAdapter("one\n\ntwo");
    const applied = applyEditOperation(adapter, {
      type: "replace",
      range: { from: 0, to: 8 },
      insert: "new",
    });

    expect(adapter.getText()).toBe("new");
    expect(applied.beforeRange).toEqual({ from: 0, to: 8 });
    expect(applied.insertedRange).toEqual({ from: 0, to: 3 });
    expect(applied.change.deleted).toBe("one\n\ntwo");
  });
});

describe("composition virtual patches", () => {
  it("renders preedit text virtually and commits only on composition end", () => {
    const adapter = createInMemoryTextDocumentAdapter("Hello **world**");
    const range = adapter.createRange(8, 13, {
      kind: "composition",
      bias: "expand",
    });
    const session = createCompositionSession(adapter, range);

    const view = session.update("世界");

    expect(adapter.getText()).toBe("Hello **world**");
    expect(view.replacementRange).toEqual({ from: 8, to: 13 });
    expect(view.virtualText).toBe("Hello **世界**");

    const change = session.commit();
    expect(change).toMatchObject({
      from: 8,
      to: 13,
      insert: "世界",
      deleted: "world",
    });
    expect(adapter.getText()).toBe("Hello **世界**");
  });

  it("tracks remote edits before and after composition ranges", () => {
    const adapter = createInMemoryTextDocumentAdapter("alpha beta gamma");
    const range = adapter.createRange(6, 10, {
      kind: "composition",
      bias: "expand",
    });
    const session = createCompositionSession(adapter, range);

    adapter.transact((tx) => {
      tx.insert(0, "pre ");
    });

    expect(session.update("测试")).toMatchObject({
      replacementRange: { from: 10, to: 14 },
      hasConflict: false,
      virtualText: "pre alpha 测试 gamma",
    });

    adapter.transact((tx) => {
      tx.insert(adapter.getText().length, " tail");
    });

    expect(session.update("测试")).toMatchObject({
      replacementRange: { from: 10, to: 14 },
      hasConflict: false,
      virtualText: "pre alpha 测试 gamma tail",
    });

    const change = session.commit();
    expect(change).toMatchObject({
      from: 10,
      to: 14,
      insert: "测试",
      deleted: "beta",
    });
    expect(adapter.getText()).toBe("pre alpha 测试 gamma tail");
  });

  it("rejects remote edits inside or overlapping the composition range", () => {
    const insideAdapter = createInMemoryTextDocumentAdapter("alpha beta gamma");
    const insideRange = insideAdapter.createRange(6, 10, {
      kind: "composition",
      bias: "expand",
    });
    const insideSession = createCompositionSession(insideAdapter, insideRange);

    insideSession.update("测试");
    insideAdapter.transact((tx) => {
      tx.insert(8, "REMOTE");
    });

    expect(insideSession.update("测试")).toMatchObject({
      hasConflict: true,
    });
    expect(() => insideSession.commit()).toThrow(/replacement range changed/u);

    const overlappingAdapter = createInMemoryTextDocumentAdapter("alpha beta gamma");
    const overlappingRange = overlappingAdapter.createRange(6, 10, {
      kind: "composition",
      bias: "expand",
    });
    const overlappingSession = createCompositionSession(overlappingAdapter, overlappingRange);

    overlappingSession.update("测试");
    overlappingAdapter.transact((tx) => {
      tx.replaceRange({ from: 4, to: 8 }, "REMOTE");
    });

    expect(overlappingSession.update("测试")).toMatchObject({
      hasConflict: true,
    });
    expect(() => overlappingSession.commit()).toThrow(/replacement range changed/u);
  });

  it("marks remote edits inside the moved composition range as conflicts", () => {
    const adapter = createInMemoryTextDocumentAdapter("alpha beta gamma");
    const range = adapter.createRange(6, 10, {
      kind: "composition",
      bias: "expand",
    });
    const session = createCompositionSession(adapter, range);

    adapter.transact((tx) => {
      tx.insert(0, "pre ");
    });

    adapter.transact((tx) => {
      tx.insert(12, "REMOTE");
    });

    expect(session.update("测试")).toMatchObject({
      hasConflict: true,
    });
    expect(() => session.commit()).toThrow(/replacement range changed/u);
  });
});

describe("LocalUndoManager", () => {
  it("undos and redos local operations after unrelated remote edits move the target", () => {
    const adapter = createInMemoryTextDocumentAdapter("hello world");
    const undo = new LocalUndoManager();

    undo.apply(adapter, {
      type: "replace",
      range: { from: 6, to: 11 },
      insert: "there",
    });
    expect(adapter.getText()).toBe("hello there");

    adapter.transact((tx) => {
      tx.insert(0, "say ");
    });

    expect(undo.undo(adapter)).toBe(true);
    expect(adapter.getText()).toBe("say hello world");
    expect(undo.redo(adapter)).toBe(true);
    expect(adapter.getText()).toBe("say hello there");
  });

  it("fails closed when an undo target was changed by another actor", () => {
    const adapter = createInMemoryTextDocumentAdapter("hello world");
    const undo = new LocalUndoManager();

    undo.apply(adapter, {
      type: "replace",
      range: { from: 6, to: 11 },
      insert: "there",
    });

    adapter.transact((tx) => {
      tx.insert(8, "REMOTE");
    });

    expect(undo.undo(adapter)).toBe(false);
    expect(adapter.getText()).toBe("hello thREMOTEere");
  });
});
