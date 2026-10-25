import type { ExerciseId } from "./exercises";

export type RomThresholds = {
  topMin: number;
  bottomMax: number;
};

export type RomSettings = Record<ExerciseId, RomThresholds>;

export const DEFAULT_ROM: RomSettings = {
  pushup: { topMin: 155, bottomMax: 115 },
  pullup: { topMin: 155, bottomMax: 115 },
  squat: { topMin: 155, bottomMax: 115 },
  other: { topMin: 155, bottomMax: 105 },
};

const STORAGE_KEY = "analyze-workout-rom-v1";

export function loadRomSettings(): RomSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROM };
    const parsed = JSON.parse(raw) as Partial<RomSettings>;
    return {
      pushup: { ...DEFAULT_ROM.pushup, ...parsed.pushup },
      pullup: { ...DEFAULT_ROM.pullup, ...parsed.pullup },
      squat: { ...DEFAULT_ROM.squat, ...parsed.squat },
      other: { ...DEFAULT_ROM.other, ...parsed.other },
    };
  } catch {
    return { ...DEFAULT_ROM };
  }
}

export function normalizeThresholds(t: RomThresholds): RomThresholds {
  let topMin = t.topMin;
  let bottomMax = t.bottomMax;
  if (topMin <= bottomMax) {
    topMin = bottomMax + 10;
  }
  topMin = Math.min(180, Math.max(120, topMin));
  bottomMax = Math.min(topMin - 5, Math.max(60, bottomMax));
  return { topMin, bottomMax };
}

export function normalizeRomSettings(settings: RomSettings): RomSettings {
  return {
    pushup: normalizeThresholds(settings.pushup),
    pullup: normalizeThresholds(settings.pullup),
    squat: normalizeThresholds(settings.squat),
    other: normalizeThresholds(settings.other),
  };
}

export function saveRomSettings(settings: RomSettings): void {
  const normalized = normalizeRomSettings(settings);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
