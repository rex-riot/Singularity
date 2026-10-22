// Shared by the text-based timing backends (letters, cmu).
//
// Input: words, each a list of units ({ shape, weight } -- one mouth shape and
// how long it should last relative to the others), plus the audio's speaking
// runs from lib/wav.mjs.
// Output: timed mouth cues, with the rest mouth wherever the audio is silent.
//
// Units are laid out along the "speaking time" axis (silences removed), then
// converted back to real clock time, so a pause in the audio never gets
// eaten by a word.

export function layout({ words, duration, runs }) {
  words = words.filter(w => w.units.length);
  const units = words.flatMap(w => w.units);
  const total = units.reduce((s, u) => s + u.weight, 0);
  const activeTotal = runs.reduce((s, r) => s + (r.end - r.start), 0);
  if (!total || !activeTotal) return { cues: [{ start: 0, end: duration, shape: 'rest' }], words: [] };

  const pieces = [];
  let acc = 0;
  for (const u of units) {
    const a0 = acc / total * activeTotal;
    acc += u.weight;
    pieces.push(toClockTime(a0, acc / total * activeTotal, runs));
  }

  const cues = [];
  units.forEach((u, i) => pieces[i].forEach(([s, e]) => cues.push({ start: s, end: e, shape: u.shape })));
  const filled = fillWithRest(cues, duration);

  let i = 0;
  const wordTimes = words.map(w => {
    const mine = pieces.slice(i, i + w.units.length).flat();
    i += w.units.length;
    return { text: w.text, start: mine[0]?.[0] ?? 0, end: mine.at(-1)?.[1] ?? 0 };
  });
  return { cues: filled, words: wordTimes };
}

export function fillWithRest(cues, duration) {
  const out = [];
  let t = 0;
  for (const c of cues) {
    if (c.start > t + 1e-6) out.push({ start: t, end: c.start, shape: 'rest' });
    out.push(c);
    t = c.end;
  }
  if (t < duration - 1e-6) out.push({ start: t, end: duration, shape: 'rest' });
  return out;
}

function toClockTime(a0, a1, runs) {
  const out = [];
  let offset = 0;
  for (const r of runs) {
    const len = r.end - r.start;
    const s = Math.max(a0, offset), e = Math.min(a1, offset + len);
    if (e > s) out.push([r.start + (s - offset), r.start + (e - offset)]);
    offset += len;
  }
  return out;
}
