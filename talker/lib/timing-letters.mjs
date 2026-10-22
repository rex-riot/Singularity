// Timing backend: "letters". The simplest possible estimate.
//
//   text -> guess a mouth shape per letter (config/letters-map.json)
//        -> spread those shapes across the stretches where the audio is
//           actually speaking (lib/layout.mjs)
//
// It knows nothing about real pronunciation or real timing inside a word, so
// expect drift. Also used by the cmu backend for words missing from its
// dictionary.
import { layout } from './layout.mjs';

const VOWEL_SHAPES = new Set(['ai', 'e', 'o', 'u']);
const VOWEL_LETTERS = new Set('aeiouy');

export function estimateCues({ text, duration, runs, map }) {
  const words = text.split(/\s+/).filter(Boolean).map(raw => ({ text: raw, units: unitsForWord(raw, map) }));
  return layout({ words, duration, runs });
}

export function unitsForWord(raw, { letters, digraphs, weights }) {
  const w = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const units = [];
  const add = shape => units.push({ shape, weight: VOWEL_SHAPES.has(shape) ? weights.vowel : weights.consonant });

  let end = w.length;
  // Silent final "e" (make, time) -- but not in short words (the, she) or after a vowel (see).
  if (end > 3 && w.endsWith('e') && !VOWEL_LETTERS.has(w[end - 2])) end--;

  for (let i = 0; i < end;) {
    const ch = w[i];
    if (/\d/.test(ch)) { add('etc'); add('e'); i++; continue; }   // digits: rough guess
    const two = w.slice(i, i + 2);
    let shape, len = 1;
    if (i + 2 <= end && digraphs[two] !== undefined) { shape = digraphs[two]; len = 2; }
    else shape = letters[ch] === undefined ? 'etc' : letters[ch];
    if (shape !== null) add(shape);                              // null = silent letter
    i += len;
    if (len === 1) while (i < end && w[i] === ch) i++;           // collapse doubled letters
  }
  if (!units.length && w) add('etc');
  return units;
}
