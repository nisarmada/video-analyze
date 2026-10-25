/**
 * MediaPipe video mode rejects a timestamp that does not move forward.
 * Live camera uses a monotonic clock. Files use currentTime, which rewinds if the clip loops.
 * Returns null when this frame should be skipped.
 */
export function nextDetectionTimestamp(
  lastTimestampMs: number,
  sample: { currentTimeSec: number; liveMs?: number },
): number | null {
  const raw =
    sample.liveMs === undefined
      ? Math.floor(sample.currentTimeSec * 1000)
      : Math.floor(sample.liveMs);
  if (!Number.isFinite(raw)) return null;
  if (lastTimestampMs >= 0 && raw <= lastTimestampMs) return null;
  return raw;
}
