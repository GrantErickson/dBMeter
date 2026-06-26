// Musical-note helpers for the spectrum analyser's piano keyboard.
//
// Equal-temperament mapping around A4 = 440 Hz. MIDI note numbers are used as
// the canonical integer index (A4 = 69, middle C = C4 = 60). On a logarithmic
// frequency axis every semitone is an equal horizontal step, which is what lets
// the keyboard line up under the spectrum.

const A4 = 440
const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]

// Standard 88-key piano range: A0 (MIDI 21) … C8 (MIDI 108).
export const PIANO_MIN_MIDI = 21
export const PIANO_MAX_MIDI = 108

export function freqToMidi(f) {
  return 69 + 12 * Math.log2(f / A4)
}

export function midiToFreq(m) {
  return A4 * Math.pow(2, (m - 69) / 12)
}

// Pitch class (0..11) of a MIDI note, robust to negatives.
function pitchClass(m) {
  return ((m % 12) + 12) % 12
}

export function isBlackKey(m) {
  return [1, 3, 6, 8, 10].includes(pitchClass(m))
}

export function noteName(m) {
  return NOTE_NAMES[pitchClass(m)] + (Math.floor(m / 12) - 1)
}
