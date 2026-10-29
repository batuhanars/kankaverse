/**
 * C32 — sesli mesaj ses seviyesi eşitleme: ffmpeg/ffprobe argümanları (SAF, çalıştırma yok).
 * R7 kuralları ffmpeg-args.ts ile aynı: argüman DİZİSİ (shell yok), dosya yolları sunucu üretimi,
 * girdi biçimi contentType'tan ZORLANIR (-f), `-protocol_whitelist file`.
 */

export const AUDIO_LOUDNORM_FILTER = 'loudnorm=I=-16:TP=-2:LRA=11';
export const AUDIO_BITRATE = '64k';

interface AudioFormat {
  inputDemuxer: string;
  codec: string;
  muxer: string;
  sampleRate: string;
}

/** Aynı kap/kodek: m4a → AAC/mp4, webm → Opus/webm, mpeg → mp3. loudnorm 192 kHz çıkarır, örnek hızı açıkça geri alınır. */
export const AUDIO_FORMATS: Record<string, AudioFormat> = {
  'audio/mp4': { inputDemuxer: 'mov', codec: 'aac', muxer: 'mp4', sampleRate: '44100' },
  'audio/webm': { inputDemuxer: 'matroska', codec: 'libopus', muxer: 'webm', sampleRate: '48000' },
  'audio/mpeg': { inputDemuxer: 'mp3', codec: 'libmp3lame', muxer: 'mp3', sampleRate: '44100' },
};

export function isNormalizableAudio(contentType: string): boolean {
  return Object.keys(AUDIO_FORMATS).includes(contentType);
}

function formatOf(contentType: string): AudioFormat {
  if (!isNormalizableAudio(contentType)) throw new Error('ffmpeg argümanı geçersiz: ses türü');
  return AUDIO_FORMATS[contentType];
}

export function buildLoudnormArgs(
  contentType: string,
  inputPath: string,
  outputPath: string,
): string[] {
  const f = formatOf(contentType);
  return [
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-y',
    '-protocol_whitelist',
    'file',
    '-f',
    f.inputDemuxer,
    '-i',
    inputPath,
    '-vn',
    '-map_metadata',
    '-1',
    '-af',
    AUDIO_LOUDNORM_FILTER,
    '-ac',
    '1',
    '-ar',
    f.sampleRate,
    '-c:a',
    f.codec,
    '-b:a',
    AUDIO_BITRATE,
    '-f',
    f.muxer,
    outputPath,
  ];
}

/** ffprobe: yalnız süre (saniye, düz metin). Girdi ve çıktı aynı kapta olduğundan `-f` her ikisinde de zorlanır. */
export function buildDurationProbeArgs(contentType: string, filePath: string): string[] {
  const f = formatOf(contentType);
  return [
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-f',
    f.inputDemuxer,
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
}
