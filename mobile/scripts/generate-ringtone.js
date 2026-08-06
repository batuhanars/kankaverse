#!/usr/bin/env node
// M4a-2 sözleşme §8.3 — gelen arama zili, web'in `useCallSounds.ts` `ringCycle()` reçetesinden
// BİREBİR türetilmiş bir WAV dosyası üretir (indirilmiş bir ses DOSYASI DEĞİL — sentezlenir).
// React Native'de Web Audio yok, bu yüzden aynı matematik burada Node'da örnek-örnek render edilip
// PCM WAV'a yazılıyor; mobil `expo-audio` bu dosyayı DÖNGÜDE çalar (kanal sesi tek atış olduğu için
// zili taşıyamaz — bkz. `src/notifications/incomingCall.ts`).
//
// Web reçetesi (`web/src/composables/useCallSounds.ts`):
//   tone(freq, startAt, dur, peak)  — attack 0.012s lineer yükseliş, sonra dur-release'e kadar düz,
//                                     sonra dur'a kadar lineer iniş (release=0.05s).
//   warble(start, dur=0.4)          — 620/480 Hz arası 0.05s adımlarla hızlı geçiş ("brrr" hissi).
//   ringCycle()                     — warble(t, 0.4) + warble(t+0.6, 0.4); interval 3000ms'de tekrar
//                                     ediyordu (setInterval) — burada tek bir 3.0s DÖNGÜ dosyası
//                                     üretilip native tarafta `loop=true` ile tekrarlanıyor.
//
// Çıktı: 44.1kHz mono 16-bit PCM WAV, 3.0 saniye (bir `ringCycle` + sonraki tekrara kadarki sessizlik).
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const CYCLE_SEC = 3.0; // web setInterval(ringCycle, 3000)
const ATTACK = 0.012;
const RELEASE = 0.05;

const buffer = new Float32Array(Math.round(SAMPLE_RATE * CYCLE_SEC));

/** Web `tone(freq, startAt, dur, peak)` — aynı zarf, örnek örnek render edilip buffer'a toplanır. */
function renderTone(freq, startAt, dur, peak) {
  const flatStart = Math.max(ATTACK, dur - RELEASE);
  const startIdx = Math.floor(startAt * SAMPLE_RATE);
  const endIdx = Math.min(buffer.length, Math.ceil((startAt + dur) * SAMPLE_RATE));
  for (let i = startIdx; i < endIdx; i++) {
    const tRel = i / SAMPLE_RATE - startAt;
    let env;
    if (tRel < ATTACK) {
      env = peak * (tRel / ATTACK);
    } else if (tRel < flatStart) {
      env = peak;
    } else {
      const span = dur - flatStart;
      env = span > 0 ? peak * Math.max(0, 1 - (tRel - flatStart) / span) : 0;
    }
    buffer[i] += env * Math.sin(2 * Math.PI * freq * (i / SAMPLE_RATE));
  }
}

/** Web `warble(start, dur)` — 620/480 Hz arası 0.05s adım, 0.18 peak. */
function renderWarble(start, dur) {
  const step = 0.05;
  let high = true;
  for (let o = 0; o < dur - 1e-6; o += step) {
    renderTone(high ? 620 : 480, start + o, step, 0.18);
    high = !high;
  }
}

// Web `ringCycle()`: iki warble, 0.6s arayla.
renderWarble(0, 0.4);
renderWarble(0.6, 0.4);
// 1.0s'ten 3.0s'e kadar sessizlik — bir sonraki tekrara kadarki boşluk (native `loop` bunu üretir).

// ---- Float32 → 16-bit PCM WAV ----
function writeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataSize = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28); // byte rate
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buf;
}

const outDir = path.resolve(__dirname, '../assets/sounds');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'incoming-call.wav');
fs.writeFileSync(outPath, writeWav(buffer, SAMPLE_RATE));
console.log(`[generate-ringtone] ${outPath} (${CYCLE_SEC}s, ${SAMPLE_RATE}Hz mono)`);
