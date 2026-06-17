// Logarithmic time compression for the graph.
//
// Goal: the most recent `halfMin` minutes (default 2) occupy 50% of the plot
// width, and older data is progressively compressed toward the far edge.
//
// We map an "age" (minutes since now, 0 = newest) to a fraction in [0,1] of the
// distance from the right edge:
//
//     frac(age) = ln(1 + age*u) / ln(1 + total*u)
//
// We pick u so that frac(halfMin) === 0.5. Solving
//     ln(1 + H*u) = 0.5 * ln(1 + T*u)   ->   (1 + H*u)^2 = 1 + T*u
//     =>  u = (T - 2H) / H^2
// which is only valid (positive) when total > 2*halfMin. Below that there is
// no log shape that satisfies the constraint, so we fall back to a linear map.

export function computeU(totalMin, halfMin = 2) {
  if (!(totalMin > 2 * halfMin)) return null // linear fallback
  return (totalMin - 2 * halfMin) / (halfMin * halfMin)
}

// age (minutes from now) -> fraction from the right edge (0..1)
export function ageToFrac(ageMin, totalMin, u) {
  if (totalMin <= 0) return 0
  if (!u) return Math.min(1, ageMin / totalMin) // linear fallback
  return Math.log(1 + ageMin * u) / Math.log(1 + totalMin * u)
}

// fraction from the right edge (0..1) -> age (minutes from now)
export function fracToAge(frac, totalMin, u) {
  if (!u) return frac * totalMin
  return (Math.pow(1 + totalMin * u, frac) - 1) / u
}
