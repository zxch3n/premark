import type { ResolvedFonts, SpacingConfig } from "../types.ts";

import { measureTextWidth } from "../measurement-context.ts";

export interface ListPrefix {
  text: string;
  font: string;
  width: number;
  gap: number;
}

export function createListPrefix(
  marker: string | undefined,
  fonts: ResolvedFonts,
  spacing: SpacingConfig,
): ListPrefix | undefined {
  if (marker === undefined) {
    return undefined;
  }

  return {
    text: marker,
    font: fonts.bodyBold,
    width: measureTextWidth(marker, fonts.bodyBold),
    gap: spacing.listMarkerGap,
  };
}
