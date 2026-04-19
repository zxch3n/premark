export interface KnownVisualMismatch {
  fixtureId: string;
  area: "geometry" | "pixel" | "feature";
  reason: string;
  owner: string;
}

export const knownVisualMismatches: KnownVisualMismatch[] = [];

export function findKnownVisualMismatch(fixtureId: string): KnownVisualMismatch | undefined {
  return knownVisualMismatches.find((entry) => entry.fixtureId === fixtureId);
}
