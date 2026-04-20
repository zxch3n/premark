import type { SourceRange } from "@pretext-md/parser";

import type {
  AppliedEditOperation,
  EditOperation,
  StableRange,
  TextChange,
  TextDocumentAdapter,
} from "./types.ts";

export function applyEditOperation(
  adapter: TextDocumentAdapter,
  operation: EditOperation,
): AppliedEditOperation {
  let beforeRange: SourceRange | undefined;
  let change: TextChange | undefined;

  adapter.transact((tx) => {
    switch (operation.type) {
      case "replace": {
        beforeRange = resolveRange(adapter, operation.range);
        change = tx.replaceRange(operation.range, operation.insert);
        break;
      }
      case "insert": {
        beforeRange = { from: operation.offset, to: operation.offset };
        change = tx.insert(operation.offset, operation.text);
        break;
      }
      case "delete": {
        beforeRange = resolveRange(adapter, operation.range);
        change = tx.deleteRange(operation.range);
        break;
      }
    }
  });

  if (change === undefined || beforeRange === undefined) {
    throw new Error("Edit operation did not produce a document change");
  }

  return {
    operation,
    change,
    beforeRange,
    insertedRange: {
      from: change.from,
      to: change.from + change.insert.length,
    },
  };
}

export function replaceRangeOperation(
  range: SourceRange | StableRange,
  insert: string,
): EditOperation {
  return {
    type: "replace",
    range,
    insert,
  };
}

export function insertTextOperation(offset: number, text: string): EditOperation {
  return {
    type: "insert",
    offset,
    text,
  };
}

export function deleteRangeOperation(range: SourceRange | StableRange): EditOperation {
  return {
    type: "delete",
    range,
  };
}

function resolveRange(adapter: TextDocumentAdapter, range: SourceRange | StableRange): SourceRange {
  if ("from" in range && "to" in range) {
    return range.from <= range.to ? range : { from: range.to, to: range.from };
  }

  const resolved = adapter.resolveRange(range);
  return {
    from: resolved.from,
    to: resolved.to,
  };
}
