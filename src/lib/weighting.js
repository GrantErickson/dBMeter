// Frequency weighting curves per IEC 61672 (A and B). Returns the gain in dB
// that should be added to the level of a pure tone at frequency `f` (Hz).
// 'Z' is flat (no weighting). We apply these in the frequency domain across
// the analyser's FFT bins, which keeps the result correct regardless of the
// hardware sample rate.

export const WEIGHTINGS = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'Z', label: 'Z (flat)' },
]

export function weightingDb(type, f) {
  if (f <= 0) return -Infinity
  const f2 = f * f

  if (type === 'A') {
    const ra =
      (12194 ** 2 * f2 * f2) /
      ((f2 + 20.6 ** 2) *
        Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
        (f2 + 12194 ** 2))
    return 20 * Math.log10(ra) + 2.0
  }

  if (type === 'B') {
    const rb =
      (12194 ** 2 * f2 * f) /
      ((f2 + 20.6 ** 2) * Math.sqrt(f2 + 158.5 ** 2) * (f2 + 12194 ** 2))
    return 20 * Math.log10(rb) + 0.17
  }

  // 'Z' / unknown -> flat
  return 0
}
