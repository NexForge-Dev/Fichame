'use strict';

/* Banda sonora do vídeo de demonstração, sintetizada aqui mesmo: sem
 * ficheiros de terceiros, logo sem licenças nem atribuições a gerir.
 *
 * Pop a 120 BPM (1 compasso = 2 s), I–V–vi–IV em dó maior. Secções:
 *   0 → dropAt   tensão: pad filtrado, hats a crescer e riser
 *   dropAt → outroAt   groove completo (kick, palmas, baixo, pluck, melodia)
 *   outroAt → fim      acorde final e fade
 * Os efeitos (whoosh, pop, ding…) chegam como `cues` vindos da linha de
 * tempo do palco, para baterem certo com a imagem. */

const SR = 44100;

function buildAudio({ duration, dropAt, outroAt, cues = [] }) {
  const N = Math.ceil(duration * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const busL = new Float32Array(N), busR = new Float32Array(N); // vai ao sidechain
  const beat = 0.5, bar = 2;

  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const noise = () => rnd() * 2 - 1;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const add = (bufL, bufR, i, v, pan = 0) => {
    if (i < 0 || i >= N) return;
    bufL[i] += v * Math.min(1, 1 - pan);
    bufR[i] += v * Math.min(1, 1 + pan);
  };

  /* ---- instrumentos ---- */
  function kick(t, g = 1) {
    const n = Math.floor(0.45 * SR), s0 = Math.floor(t * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      const f = 45 + 115 * Math.exp(-x / 0.035);
      ph += 2 * Math.PI * f / SR;
      const env = Math.exp(-x / 0.16) * (x < 0.002 ? x / 0.002 : 1);
      add(L, R, s0 + i, Math.sin(ph) * env * 0.9 * g + (i < 60 ? noise() * 0.15 * g : 0));
    }
  }
  function clap(t, g = 1) {
    const n = Math.floor(0.25 * SR), s0 = Math.floor(t * SR);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      const burst = x < 0.03 ? (Math.floor(x / 0.009) % 2 === 0 ? 1 : 0.4) : 1;
      const w = noise(); lp += 0.25 * (w - lp);
      const env = Math.exp(-x / 0.07) * burst;
      add(L, R, s0 + i, (w - lp) * env * 0.32 * g, (rnd() - 0.5) * 0.3);
    }
  }
  function hat(t, open, g = 1, pan = 0.25) {
    const n = Math.floor((open ? 0.22 : 0.06) * SR), s0 = Math.floor(t * SR);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      const w = noise(); lp += 0.55 * (w - lp);
      const env = Math.exp(-x / (open ? 0.07 : 0.018));
      add(L, R, s0 + i, (w - lp) * env * 0.16 * g, pan);
    }
  }
  function bass(t, midi, len, g = 1) {
    const n = Math.floor(len * SR), s0 = Math.floor(t * SR), f = mtof(midi);
    let ph = 0, a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      ph = (ph + f / SR) % 1;
      const saw = ph * 2 - 1;
      const cut = 0.04 + 0.1 * Math.exp(-x / 0.08);
      a += cut * (saw - a); b += cut * (a - b);
      const env = Math.min(1, x / 0.004) * Math.min(1, (len - x) / 0.02) * (0.75 + 0.25 * Math.exp(-x / 0.1));
      add(busL, busR, s0 + i, (b * 0.8 + Math.sin(ph * 2 * Math.PI) * 0.35) * env * 0.42 * g);
    }
  }
  function pluck(t, midi, g = 1, pan = 0) {
    const n = Math.floor(0.4 * SR), s0 = Math.floor(t * SR), f = mtof(midi);
    let ph = 0, a = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      ph = (ph + f / SR) % 1;
      const sq = (ph < 0.5 ? 1 : -1) * 0.6 + (ph * 2 - 1) * 0.4;
      const cut = 0.05 + 0.35 * Math.exp(-x / 0.05);
      a += cut * (sq - a);
      const env = Math.min(1, x / 0.002) * Math.exp(-x / 0.11);
      add(busL, busR, s0 + i, a * env * 0.13 * g, pan);
    }
  }
  function pad(t, midis, len, g = 1, cutoff = 0.06) {
    const n = Math.floor(len * SR), s0 = Math.floor(t * SR);
    const voices = [];
    midis.forEach((m) => [-0.12, 0.12].forEach((d) => voices.push({ f: mtof(m + d), ph: rnd(), pan: d * 4 })));
    let aL = 0, aR = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      let sL = 0, sR = 0;
      for (const v of voices) {
        v.ph = (v.ph + v.f / SR) % 1;
        const s = v.ph * 2 - 1;
        sL += s * (1 - v.pan); sR += s * (1 + v.pan);
      }
      aL += cutoff * (sL - aL); aR += cutoff * (sR - aR);
      const env = Math.min(1, x / 0.35) * Math.min(1, (len - x) / 0.4);
      const v = env * 0.045 * g / Math.sqrt(voices.length);
      if (s0 + i < N) { busL[s0 + i] += aL * v; busR[s0 + i] += aR * v; }
    }
  }
  function bell(t, midi, g = 1, pan = 0, decay = 0.5) {
    const n = Math.floor(decay * 3 * SR), s0 = Math.floor(t * SR), f = mtof(midi);
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      const env = Math.min(1, x / 0.003) * Math.exp(-x / decay);
      const s = Math.sin(2 * Math.PI * f * x) + 0.35 * Math.sin(2 * Math.PI * f * 2 * x) * Math.exp(-x / 0.15)
        + 0.12 * Math.sin(2 * Math.PI * f * 3.01 * x) * Math.exp(-x / 0.08);
      add(busL, busR, s0 + i, s * env * 0.075 * g, pan);
    }
  }

  /* ---- efeitos ---- */
  const sfx = {
    whoosh(t, g = 1) {
      const d = 0.55, n = Math.floor(d * SR), s0 = Math.floor((t - d * 0.6) * SR);
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) {
        const p = i / n;
        const cut = 0.02 + 0.5 * Math.sin(Math.PI * p) ** 2;
        const w = noise(); a += cut * (w - a); b += 0.5 * (a - b);
        const env = Math.sin(Math.PI * p) ** 2;
        add(L, R, s0 + i, (a - b * 0.5) * env * 0.5 * g, (p - 0.5) * 1.4);
      }
    },
    pop(t, g = 1) {
      const n = Math.floor(0.14 * SR), s0 = Math.floor(t * SR);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const x = i / SR;
        ph += 2 * Math.PI * (320 + 700 * Math.exp(-x / 0.02)) / SR;
        add(L, R, s0 + i, Math.sin(ph) * Math.exp(-x / 0.035) * 0.32 * g);
      }
    },
    ding(t, g = 1) {
      [[0, 91], [0.13, 96]].forEach(([dt, m]) => {
        const n = Math.floor(1.2 * SR), s0 = Math.floor((t + dt) * SR), f = mtof(m);
        for (let i = 0; i < n; i++) {
          const x = i / SR;
          const s = Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(2 * Math.PI * f * 2.7 * x) * Math.exp(-x / 0.1);
          add(L, R, s0 + i, s * Math.min(1, x / 0.002) * Math.exp(-x / 0.35) * 0.2 * g);
        }
      });
    },
    tick(t, g = 1) {
      const n = Math.floor(0.09 * SR), s0 = Math.floor(t * SR);
      for (let i = 0; i < n; i++) {
        const x = i / SR;
        add(L, R, s0 + i, Math.sin(2 * Math.PI * 1320 * x) * Math.exp(-x / 0.025) * 0.16 * g
          + Math.sin(2 * Math.PI * 2640 * x) * Math.exp(-x / 0.012) * 0.08 * g);
      }
    },
    click(t, g = 1) {
      const n = Math.floor(0.03 * SR), s0 = Math.floor(t * SR);
      for (let i = 0; i < n; i++) add(L, R, s0 + i, noise() * Math.exp(-i / SR / 0.004) * 0.25 * g);
    },
    impact(t, g = 1) {
      const n = Math.floor(1.4 * SR), s0 = Math.floor(t * SR);
      let ph = 0, a = 0;
      for (let i = 0; i < n; i++) {
        const x = i / SR;
        ph += 2 * Math.PI * (38 + 80 * Math.exp(-x / 0.06)) / SR;
        const w = noise(); a += 0.08 * (w - a);
        add(L, R, s0 + i, (Math.sin(ph) * Math.exp(-x / 0.45) * 0.75 + a * Math.exp(-x / 0.3) * 0.9) * g);
      }
    },
    sparkle(t, g = 1) {
      for (let k = 0; k < 9; k++) {
        const tt = t + k * 0.045 + rnd() * 0.02, m = 84 + Math.floor(rnd() * 14);
        const n = Math.floor(0.25 * SR), s0 = Math.floor(tt * SR), f = mtof(m), pan = rnd() * 1.6 - 0.8;
        for (let i = 0; i < n; i++) {
          const x = i / SR;
          add(L, R, s0 + i, Math.sin(2 * Math.PI * f * x) * Math.exp(-x / 0.06) * 0.06 * g, pan);
        }
      }
    },
    riser(t, d, g = 1) {
      const n = Math.floor(d * SR), s0 = Math.floor(t * SR);
      let a = 0, ph = 0;
      for (let i = 0; i < n; i++) {
        const p = i / n;
        const w = noise(); a += (0.01 + 0.4 * p * p) * (w - a);
        ph += 2 * Math.PI * (200 + 1400 * p * p) / SR;
        add(L, R, s0 + i, (a * 0.5 + Math.sin(ph) * 0.06) * p * p * g);
      }
    }
  };

  /* ---- arranjo ---- */
  const CH = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]; // C G Am F
  const ROOT = [36, 31, 33, 29];
  const MEL = [
    [[0, 76, 1], [1, 79, 0.5], [1.5, 76, 0.5], [2, 72, 1], [3, 74, 1]],
    [[0, 74, 1.5], [1.5, 71, 0.5], [2, 74, 1], [3, 79, 1]],
    [[0, 76, 1], [1, 72, 0.5], [1.5, 76, 0.5], [2, 81, 1], [3, 79, 1]],
    [[0, 77, 1.5], [1.5, 76, 0.5], [2, 72, 2]]
  ];
  const kicks = [];
  const bars = Math.ceil(duration / bar);

  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    if (t0 < dropAt) {
      // Tensão: Am sustentado, hats a acelerar, pulso grave
      const p = t0 / dropAt;
      pad(t0, [45, 57, 60, 64], bar + 0.4, 1.4, 0.02 + 0.05 * p);
      const step = p < 0.34 ? beat : beat / 2;
      for (let x = 0; x < bar - 0.01; x += step) {
        if (t0 + x < dropAt - 0.15) hat(t0 + x, false, 0.5 + p, 0.3);
      }
      kick(t0, 0.55); kicks.push(t0);
      if (p > 0.3) { kick(t0 + beat * 2, 0.45); kicks.push(t0 + beat * 2); }
      continue;
    }
    const ci = (b - Math.round(dropAt / bar)) % 4;
    const chord = CH[(ci + 4) % 4], root = ROOT[(ci + 4) % 4];
    if (t0 >= outroAt) {
      if (t0 === Math.ceil(outroAt / bar) * bar) {
        kick(t0); kicks.push(t0);
        pad(t0, [48, 60, 64, 67, 72], duration - t0, 2.2, 0.05);
        bass(t0, 36, Math.min(3.5, duration - t0), 0.8);
        [72, 76, 79, 84].forEach((m, k) => bell(t0 + k * 0.12, m, 1.1, (k - 1.5) * 0.3, 0.9));
      }
      continue;
    }
    const energy = t0 >= outroAt - 6 * 1 ? 1.15 : 1;
    pad(t0, chord.map((m) => m - 12).concat(chord), bar + 0.3, 1, 0.05);
    for (let q = 0; q < 4; q++) {
      const tb = t0 + q * beat;
      kick(tb); kicks.push(tb);
      if (q % 2 === 1) clap(tb, 0.9);
      hat(tb + beat / 2, true, 0.8 * energy, 0.3);
      hat(tb + beat / 4, false, 0.45, -0.3);
      hat(tb + beat * 3 / 4, false, 0.45, -0.3);
    }
    for (let e = 0; e < 8; e++) {
      const oct = e % 4 === 3 ? 12 : 0;
      bass(t0 + e * beat / 2, root + oct, beat / 2 * 0.85, e % 2 ? 0.8 : 1);
    }
    const arp = [0, 1, 2, 1, 2, 0, 1, 2];
    for (let s = 0; s < 16; s++) {
      const m = chord[arp[s % 8]] + 12 + (s % 8 >= 6 ? 12 : 0);
      pluck(t0 + s * beat / 4, m, s % 4 === 0 ? 1 : 0.7, s % 2 ? 0.45 : -0.45);
    }
    const melBar = (b - Math.round(dropAt / bar)) % 4;
    if (t0 >= dropAt + 2 * bar) {
      MEL[(melBar + 4) % 4].forEach(([pos, m]) => bell(t0 + pos * beat, m, energy, 0.15, 0.32));
    }
  }
  sfx.riser(Math.max(0, dropAt - 2.6), 2.5, 0.9);

  for (const c of cues) {
    const fn = sfx[c.type];
    if (fn) fn(c.t, c.g == null ? 1 : c.g);
  }

  /* Sidechain: o bus de música baixa em cada kick. Eco simples no bus. */
  const dl = Math.floor(beat * 0.75 * SR);
  for (let i = dl; i < N; i++) { busL[i] += busR[i - dl] * 0.22; busR[i] += busL[i - dl] * 0.22; }
  kicks.sort((a, b) => a - b);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    while (k + 1 < kicks.length && kicks[k + 1] <= t) k++;
    const dt = kicks.length && kicks[k] <= t ? t - kicks[k] : 9;
    const duck = 1 - 0.55 * Math.exp(-dt / 0.1);
    L[i] += busL[i] * duck; R[i] += busR[i] * duck;
  }

  /* Fade final, saturação suave e normalização */
  const fadeFrom = duration - 2.2;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = t > fadeFrom ? Math.max(0, 1 - (t - fadeFrom) / 2.2) : 1;
    const fi = Math.min(1, t / 0.05);
    L[i] = Math.tanh(L[i] * 1.1) * f * fi; R[i] = Math.tanh(R[i] * 1.1) * f * fi;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const gain = 0.89 / (peak || 1);
  return { L, R, gain };
}

function writeWav(file, { L, R, gain }) {
  const fs = require('fs');
  const N = L.length;
  const buf = Buffer.alloc(44 + N * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * gain * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * gain * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

module.exports = { buildAudio, writeWav };
