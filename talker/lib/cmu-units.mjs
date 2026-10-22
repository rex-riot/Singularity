// The dictionary-lookup half of the "cmu" backend, kept free of Node-only
// imports so the browser can load it too (see "Your own text" mode).
//
//   word -> ARPAbet phonemes (HH AH0 L OW1) via the CMU Pronouncing Dictionary
//        -> mouth-shape units via config/phoneme-map.json
//
// Words missing from the dictionary fall back to the letters guess and are
// added to the `unknown` set, if one is given.
import { unitsForWord } from './timing-letters.mjs';

export function wordsToUnits(raw, { dictionary, phonemeMap, lettersMap, unknown }) {
  const units = [];
  // "well-known" -> look up "well" and "known" separately
  for (const part of raw.toLowerCase().split(/[-–—]/)) {
    const key = part.replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
    if (!key) continue;
    const phones = dictionary[key];
    if (phones) units.push(...phonemesToUnits(phones.split(' '), phonemeMap));
    else { unknown?.add(key); units.push(...unitsForWord(key, lettersMap)); }
  }
  return units;
}

function phonemesToUnits(phones, { phonemes, weights }) {
  const units = [];
  for (const p of phones) {
    const base = p.replace(/\d/, '');
    const shape = phonemes[base];
    if (shape === null || shape === undefined) continue;            // silent / unmapped (e.g. HH)
    const isVowel = /\d/.test(p);
    let weight = isVowel ? weights.vowel : weights.stops.includes(base) ? weights.stop : weights.consonant;
    if (p.endsWith('1')) weight *= weights.stressed;
    const shapes = Array.isArray(shape) ? shape : [shape];          // diphthongs: several shapes
    for (const s of shapes) units.push({ shape: s, weight: weight / shapes.length });
  }
  return units;
}
