// Talker front end. Three jobs:
//  1. send the text to the local server, get back audio + mouth cues
//  2. play the audio
//  3. on every animation frame, look up which cue the audio is currently in
//     and show that mouth shape
const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const CX = 200, CY = 185;

let shapes = {}, cues = [], words = [], duration = 0, lastWord = -1;
const audio = new Audio();

// ---------- placeholder face ----------
const face = $('face');
const el = (name, attrs = {}, parent = face) => {
  const e = document.createElementNS(SVG, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
};
const headOutline = el('ellipse', { cx: 200, cy: 150, rx: 150, ry: 140, fill: 'none', stroke: '#2a2a2a' });
const clip = el('clipPath', { id: 'mouthClip' });
const clipShape = el('ellipse', {}, clip);
const inside = el('g', { 'clip-path': 'url(#mouthClip)' });
const mouthFill = el('ellipse', { fill: '#111' }, inside);
const teethTop = el('rect', { fill: '#fff' }, inside);
const teethBottom = el('rect', { fill: '#fff' }, inside);
const tongue = el('ellipse', { fill: '#E8350A' }, inside);
const lips = el('ellipse', { fill: 'none', stroke: '#fff', 'stroke-width': 3 });
// Image art sets draw into this box instead of the placeholder shapes above.
const ART_BOX = { x: 60, y: 15, width: 280, height: 270 };
const artBg = el('rect', { ...ART_BOX, display: 'none' });
const artImg = el('image', { ...ART_BOX, preserveAspectRatio: 'xMidYMid meet', display: 'none' });

// ---------- art sets ----------
const BLAIR = { rest: 'rest', mbp: 'MBP', etc: 'etc', e: 'E', ai: 'AI', o: 'O', u: 'U', wq: 'WQ', fv: 'FV', l: 'L' };
let artSets = {}, art = null;

function setArt(id) {
  const set = artSets[id];
  art = set?.dir ? { ...set, files: set.files === 'blair' ? BLAIR : set.files } : null;
  const placeholder = art ? 'none' : 'inline';
  for (const e of [headOutline, inside, lips]) e.setAttribute('display', placeholder);
  artImg.setAttribute('display', art ? 'inline' : 'none');
  artBg.setAttribute('display', art?.bg ? 'inline' : 'none');
  if (art?.bg) artBg.setAttribute('fill', art.bg);
  if (art) for (const f of new Set(Object.values(art.files))) new Image().src = `${art.dir}/${f}.${art.ext}`;  // preload: no flicker
  $('credit').textContent = set?.credit ?? '';
  const shown = setShape.current;
  setShape.current = null;
  setShape(shown || 'rest');
}

function setShape(name) {
  const s = shapes[name];
  if (!s || setShape.current === name) return;
  setShape.current = name;
  document.querySelectorAll('#shapes button').forEach(b => b.classList.toggle('on', b.dataset.shape === name));
  if (art) {
    const f = art.files[name] ?? art.files.rest;
    artImg.setAttribute('href', `${art.dir}/${f}.${art.ext}`);
    return;
  }
  const rx = s.w / 2, ry = s.h / 2;
  for (const e of [clipShape, mouthFill, lips]) { e.setAttribute('cx', CX); e.setAttribute('cy', CY); e.setAttribute('rx', rx); e.setAttribute('ry', ry); }
  const tt = s.teethTop || 0, tb = s.teethBottom || 0;
  Object.entries({ x: CX - rx, width: s.w }).forEach(([k, v]) => { teethTop.setAttribute(k, v); teethBottom.setAttribute(k, v); });
  teethTop.setAttribute('y', CY - ry); teethTop.setAttribute('height', tt);
  teethBottom.setAttribute('y', CY + ry - tb); teethBottom.setAttribute('height', tb);
  tongue.setAttribute('display', s.tongue ? 'inline' : 'none');
  if (s.tongue) {
    tongue.setAttribute('cx', CX); tongue.setAttribute('rx', rx * 0.55); tongue.setAttribute('ry', ry * 0.4);
    tongue.setAttribute('cy', s.tongue === 'up' ? CY - ry + tt + ry * 0.3 : CY + ry * 0.6);
  }
}

// ---------- playback loop ----------
function frame() {
  if (custom.active && !speechSynthesis.paused) customTick(performance.now());
  if (cues.length && !audio.paused) {
    const t = audio.currentTime + $('lead').value / 1000;
    setShape(cueAt(t)?.shape ?? 'rest');
  }
  if (duration) {
    $('playhead').style.left = (audio.currentTime / duration * 100) + '%';
    highlightWord(audio.currentTime);
  }
  requestAnimationFrame(frame);
}

// Binary search: the cue whose start <= t < end.
function cueAt(t) {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < cues[mid].start) hi = mid - 1;
    else if (t >= cues[mid].end) lo = mid + 1;
    else return cues[mid];
  }
  return null;
}

function highlightWord(t) {
  let idx = -1;
  for (let i = 0; i < words.length; i++) if (words[i].start <= t) idx = i; else break;
  if (idx === lastWord) return;
  const spans = $('words').querySelectorAll('.w');
  if (spans[lastWord]) spans[lastWord].classList.remove('on');
  if (spans[idx]) spans[idx].classList.add('on');
  lastWord = idx;
}

// ---------- UI ----------
function renderResult(r) {
  cues = r.cues; words = r.words; duration = r.duration; lastWord = -1;
  const tl = $('timeline');
  tl.querySelectorAll('.cue, .run').forEach(n => n.remove());
  for (const c of cues) {
    const d = document.createElement('div');
    d.className = 'cue' + (c.shape === 'rest' ? ' rest' : '');
    d.style.left = (c.start / duration * 100) + '%';
    d.style.width = ((c.end - c.start) / duration * 100) + '%';
    d.title = `${c.shape}  ${c.start.toFixed(2)}–${c.end.toFixed(2)}s`;
    d.textContent = shapes[c.shape]?.label ?? c.shape;
    tl.appendChild(d);
  }
  for (const run of r.speechRuns) {
    const d = document.createElement('div');
    d.className = 'run';
    d.style.left = (run.start / duration * 100) + '%';
    d.style.width = ((run.end - run.start) / duration * 100) + '%';
    tl.appendChild(d);
  }
  $('words').replaceChildren(...words.flatMap(w => {
    const s = document.createElement('span');
    s.className = 'w'; s.textContent = w.text;
    return [s, document.createTextNode(' ')];
  }));
}

function status(msg, err = false) { $('status').textContent = msg; $('status').className = err ? 'err' : ''; }

async function speak() {
  $('speak').disabled = true;
  audio.pause();
  status('Generating speech…');
  try {
    const res = await fetch('api/speak', { method: 'POST', body: JSON.stringify({
      text: $('text').value, voice: $('voice').value, rate: +$('rate').value, backend: $('backend').value }) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error);
    // Download the audio fully first so seeking works and playback is instant.
    const blob = await (await fetch(r.audioUrl)).blob();
    audio.src = URL.createObjectURL(blob);
    renderResult(r);
    status([`${r.duration.toFixed(1)} s · ${r.cues.length} mouth cues · timing: ${r.backend} (${r.timingMs} ms)`, ...r.notes].join(' · '));
    $('toggle').disabled = $('restart').disabled = false;
    await audio.play().catch(() => status('Press Restart to play.'));
  } catch (e) {
    status(e.message, true);
  }
  $('speak').disabled = false;
}

// "Your own text" (the public site): there is no recorded audio, so the text is
// spoken by the browser's built-in voice. We can't analyze that audio (so no
// Rhubarb), but many voices announce each word as it starts ("boundary"
// events). The mouth is timed word by word from those: each word's shapes are
// spread across that word's duration, estimated from the speed measured so far.
// If a voice sends no boundary events, words advance on the estimated schedule.
const CUSTOM = '__custom__';
const custom = { active: false, words: [], i: -1, wordStart: 0, boundaries: false, msPerWeight: 85 };
let customModules = null, customText = '', customHi = -1;

async function loadCustomModules() {
  if (customModules) return customModules;
  const [md, letters, cmuUnits, lettersMap, phonemeMap] = await Promise.all([
    import('./lib/markdown.mjs'), import('./lib/timing-letters.mjs'), import('./lib/cmu-units.mjs'),
    fetch('config/letters-map.json').then(r => r.json()), fetch('config/phoneme-map.json').then(r => r.json()),
  ]);
  return customModules = { md, letters, cmuUnits, lettersMap, phonemeMap, dictionary: null };
}

function loadBrowserVoices() {
  const voices = (window.speechSynthesis?.getVoices() ?? []).filter(v => v.lang.startsWith('en'));
  const keep = $('bvoice').value;
  $('bvoice').replaceChildren(...voices.map(v => Object.assign(document.createElement('option'), { value: v.name, textContent: `${v.name} (${v.lang})` })));
  $('bvoice').value = keep || voices.find(v => v.name === 'Samantha')?.name || voices.find(v => v.default)?.name || voices[0]?.name;
}

function highlightCustom(i) {
  const spans = $('words').querySelectorAll('.w');
  spans[customHi]?.classList.remove('on');
  spans[i]?.classList.add('on');
  customHi = i;
}

// A new word has started at time `at` (ms).
function startWord(i, at, observed) {
  if (observed && custom.i >= 0) {
    // Learn the speaking speed from the word that just finished (smoothed).
    const prev = custom.words[custom.i];
    const ms = Math.min(250, Math.max(40, (at - custom.wordStart) / prev.weight));
    custom.msPerWeight = custom.msPerWeight * 0.7 + ms * 0.3;
  }
  custom.i = i; custom.wordStart = at;
  highlightCustom(i);
}

function customTick(now) {
  const w = custom.words[custom.i];
  if (!w) return setShape('rest');
  const dur = w.weight * custom.msPerWeight;
  if (!custom.boundaries && now - custom.wordStart >= dur && custom.i < custom.words.length - 1) {
    startWord(custom.i + 1, custom.wordStart + dur, false);   // no word events: follow the schedule
    return;
  }
  const f = (now - custom.wordStart) / dur;
  if (f >= 1) return setShape('rest');                        // word is over; waiting for the next one
  let acc = 0;
  for (const u of w.units) { acc += u.weight; if (acc > f * w.weight) return setShape(u.shape); }
  setShape('rest');
}

async function speakCustom() {
  if (!('speechSynthesis' in window)) return status("This browser can't speak text.", true);
  speechSynthesis.cancel(); audio.pause(); custom.active = false;
  status('Preparing…');
  try {
    const m = await loadCustomModules();
    const text = m.md.stripMarkdown($('text').value);
    if (!text) return status('Type something first.', true);
    const backend = $('backend').value;
    if (backend === 'cmu' && !m.dictionary) {
      status('Loading the pronunciation dictionary (about 1 MB)…');
      m.dictionary = await (await fetch('cmu-dict.json')).json();
    }
    const unknown = new Set();
    const words = [...text.matchAll(/\S+/g)].map(x => {
      const units = backend === 'cmu'
        ? m.cmuUnits.wordsToUnits(x[0], { dictionary: m.dictionary, phonemeMap: m.phonemeMap, lettersMap: m.lettersMap, unknown })
        : m.letters.unitsForWord(x[0], m.lettersMap);
      return { text: x[0], at: x.index, units, weight: units.reduce((s, u) => s + u.weight, 0) || 1 };
    });

    // Nothing recorded to draw on the timeline; show the words instead.
    cues = []; duration = 0;
    $('timeline').querySelectorAll('.cue, .run').forEach(n => n.remove());
    $('words').replaceChildren(...words.flatMap(w => {
      const s = document.createElement('span');
      s.className = 'w'; s.textContent = w.text;
      return [s, document.createTextNode(' ')];
    }));
    customHi = -1;

    const u = new SpeechSynthesisUtterance(text);
    u.voice = speechSynthesis.getVoices().find(v => v.name === $('bvoice').value) ?? null;
    Object.assign(custom, { words, i: -1, boundaries: false, active: true });
    u.onstart = () => startWord(0, performance.now(), false);
    u.onboundary = e => {
      if (e.name && e.name !== 'word') return;
      custom.boundaries = true;
      let i = 0;
      while (i + 1 < words.length && words[i + 1].at <= e.charIndex) i++;
      if (i !== custom.i) startWord(i, performance.now(), true);
    };
    u.onend = u.onerror = () => { custom.active = false; setShape('rest'); highlightCustom(-1); $('toggle').textContent = 'Pause'; };
    speechSynthesis.speak(u);
    status(['Browser voice', `timing: ${backend}, word by word`, unknown.size ? `guessed from letters: ${[...unknown].join(', ')}` : null].filter(Boolean).join(' · '));
    $('toggle').disabled = $('restart').disabled = false;
    $('toggle').textContent = 'Pause';
  } catch (e) {
    status(e.message, true);
  }
}

function enterCustom(on) {
  window.speechSynthesis?.cancel(); custom.active = false; audio.pause(); setShape('rest');
  $('text').readOnly = !on;
  $('custom-voice').hidden = !on;
  $('speak').textContent = on ? 'Speak' : 'Play';
  const rhubarb = $('backend').querySelector('[value=rhubarb]');
  rhubarb.disabled = on;
  if (on) {
    if ($('backend').value === 'rhubarb') $('backend').value = 'cmu';
    $('text').value = customText;
    $('text').placeholder = 'Type or paste text here, then press Speak.';
    $('text').focus();
    status("Your own text is spoken by your browser's built-in voice. Rhubarb needs recorded audio, so it's only available for the samples.");
    $('words').replaceChildren();
  } else {
    customText = $('text').value;
  }
}

// Pre-recorded mode (the public site): no server, so the audio and the cues for
// every backend were generated ahead of time (scripts/export-static.mjs).
// Changing backend just swaps the cues; the audio keeps playing.
let samples = [], loadedSample = null;
async function playStatic(restart = true) {
  const id = $('sample').value;
  const r = await (await fetch(`samples/${id}/${$('backend').value}.json`)).json();
  if (loadedSample !== id) {
    audio.src = URL.createObjectURL(await (await fetch(r.audioUrl)).blob());
    loadedSample = id;
  }
  renderResult(r);
  status(`${r.duration.toFixed(1)} s · ${r.cues.length} mouth cues · timing: ${r.backend}`);
  $('toggle').disabled = $('restart').disabled = false;
  if (restart) { audio.currentTime = 0; await audio.play().catch(() => status('Press Restart to play.')); }
}

async function init() {
  shapes = (await (await fetch('config/mouth-shapes.json')).json()).shapes;
  for (const [name, s] of Object.entries(shapes)) {
    const b = document.createElement('button');
    b.textContent = s.label; b.dataset.shape = name;
    b.onclick = () => { audio.pause(); setShape(name); };
    $('shapes').appendChild(b);
  }
  setShape('rest');

  artSets = (await (await fetch('config/art-sets.json')).json()).sets;
  $('artset').replaceChildren(...Object.entries(artSets).map(([id, s]) => Object.assign(document.createElement('option'), { value: id, textContent: s.label })));
  $('artset').onchange = e => setArt(e.target.value);

  // Is the local helper server there? If not, fall back to pre-recorded mode.
  let voices = null;
  try { const res = await fetch('api/voices'); if (res.ok) voices = await res.json(); } catch {}

  if (voices) {
    $('voice').innerHTML = voices.map(v => `<option value="${v.name}">${v.name} (${v.locale})</option>`).join('');
    $('voice').value = voices.find(v => v.name === 'Samantha')?.name ?? voices[0]?.name;
    $('file').onchange = async e => { const f = e.target.files[0]; if (f) $('text').value = await f.text(); };
    $('speak').onclick = speak;
  } else {
    document.body.className = 'static';
    samples = await (await fetch('samples/index.json')).json();
    $('sample').innerHTML = samples.map(s => `<option value="${s.id}">${s.title}</option>`).join('')
      + `<option value="${CUSTOM}">Your own text…</option>`;
    const isCustom = () => $('sample').value === CUSTOM;
    const showText = () => { $('text').value = samples.find(s => s.id === $('sample').value).text; };
    showText();
    $('text').readOnly = true;
    $('speak').textContent = 'Play';
    $('speak').onclick = () => isCustom() ? speakCustom() : playStatic(true);
    $('sample').onchange = () => {
      if (isCustom()) { enterCustom(true); return; }
      if ($('text').readOnly === false) enterCustom(false);
      audio.pause(); showText(); playStatic(true);
    };
    $('backend').onchange = () => { if (!isCustom() && loadedSample) playStatic(false); };
    loadBrowserVoices();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadBrowserVoices;
  }
  $('toggle').onclick = () => {
    if (custom.active) {
      if (speechSynthesis.paused) { speechSynthesis.resume(); $('toggle').textContent = 'Pause'; }
      else { speechSynthesis.pause(); $('toggle').textContent = 'Resume'; }
    } else audio.paused ? audio.play() : audio.pause();
  };
  $('restart').onclick = () => {
    if ($('sample').value === CUSTOM) speakCustom();
    else { audio.currentTime = 0; audio.play(); }
  };
  $('lead').oninput = e => { $('leadval').textContent = e.target.value; };
  $('timeline').onclick = e => {
    if (!duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    audio.currentTime = (e.clientX - r.left) / r.width * duration;
  };
  audio.onpause = () => { $('toggle').textContent = 'Play'; };
  audio.onplay = () => { $('toggle').textContent = 'Pause'; };
  audio.onended = () => setShape('rest');
  frame();
}
init();
