import type { WorkspaceEngine } from "./engine.ts";
import type { WorkspaceStreamAppend, WorkspaceStreamFlushResult } from "./types.ts";

export interface AnimationFrameStreamBatcher {
  enqueue: (append: WorkspaceStreamAppend) => void;
  flushNow: () => WorkspaceStreamFlushResult;
  cancel: () => void;
}

export function createAnimationFrameStreamBatcher(
  engine: WorkspaceEngine,
  frame: {
    readonly requestAnimationFrame?: (callback: FrameRequestCallback) => number;
    readonly cancelAnimationFrame?: (handle: number) => void;
  } = globalThis,
): AnimationFrameStreamBatcher {
  type FrameHandle = number | ReturnType<typeof globalThis.setTimeout>;
  let scheduledFrame: FrameHandle | null = null;
  const requestFrame: (callback: FrameRequestCallback) => FrameHandle =
    frame.requestAnimationFrame ??
    ((callback: FrameRequestCallback) =>
      globalThis.setTimeout(() => callback(performance.now()), 16));
  const cancelFrame: (handle: FrameHandle) => void =
    frame.cancelAnimationFrame === undefined
      ? (handle) => {
          globalThis.clearTimeout(handle);
        }
      : (handle) => {
          frame.cancelAnimationFrame?.(Number(handle));
        };

  const flushNow = () => {
    if (scheduledFrame !== null) {
      cancelFrame(scheduledFrame);
      scheduledFrame = null;
    }
    return engine.flushStreamAppends();
  };

  return {
    enqueue: (append) => {
      engine.queueStreamAppend(append);
      if (scheduledFrame !== null) {
        return;
      }
      scheduledFrame = requestFrame(() => {
        scheduledFrame = null;
        engine.flushStreamAppends();
      });
    },
    flushNow,
    cancel: () => {
      if (scheduledFrame !== null) {
        cancelFrame(scheduledFrame);
        scheduledFrame = null;
      }
    },
  };
}
