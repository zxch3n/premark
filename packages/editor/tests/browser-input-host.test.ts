import { describe, expect, it } from "vite-plus/test";

import { shouldPreserveNativeInputContext } from "../src/index.ts";

function inputEventLike(inputType: string, data: string | null, isComposing = false): InputEvent {
  return {
    inputType,
    data,
    isComposing,
  } as InputEvent;
}

describe("PremarkBrowserInputHost", () => {
  it("preserves hidden textarea state during active native composition", () => {
    expect(
      shouldPreserveNativeInputContext(inputEventLike("insertCompositionText", "你", true)),
    ).toBe(true);
  });

  it("preserves Korean jamo and syllable insertText events outside explicit composition", () => {
    expect(shouldPreserveNativeInputContext(inputEventLike("insertText", "ㄴ"))).toBe(true);
    expect(shouldPreserveNativeInputContext(inputEventLike("insertText", "안"))).toBe(true);
  });

  it("allows normal text input to resync the hidden textarea bridge", () => {
    expect(shouldPreserveNativeInputContext(inputEventLike("insertText", "a"))).toBe(false);
    expect(shouldPreserveNativeInputContext(inputEventLike("insertParagraph", null))).toBe(false);
  });
});
