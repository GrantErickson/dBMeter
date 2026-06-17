// Two-point (or one-point) calibration. The meter produces a "raw" dB value
// that is only relative; calibration maps it onto a real dB SPL scale.
//
// With two points {raw, known} we solve a linear map:  spl = slope*raw + offset
// With one point we assume slope = 1 (just an offset shift).
// With none we pass the raw value through unchanged.

export function computeCalibration(points) {
  const valid = (points || []).filter(
    (p) => p && Number.isFinite(p.raw) && Number.isFinite(p.known)
  )

  if (valid.length >= 2) {
    const [p1, p2] = valid
    const denom = p2.raw - p1.raw
    if (Math.abs(denom) < 1e-6) {
      return { slope: 1, offset: p1.known - p1.raw, points: valid.length }
    }
    const slope = (p2.known - p1.known) / denom
    const offset = p1.known - slope * p1.raw
    return { slope, offset, points: 2 }
  }

  if (valid.length === 1) {
    return { slope: 1, offset: valid[0].known - valid[0].raw, points: 1 }
  }

  return { slope: 1, offset: 0, points: 0 }
}

export function applyCalibration(raw, cal) {
  if (!Number.isFinite(raw)) return raw
  return raw * cal.slope + cal.offset
}
