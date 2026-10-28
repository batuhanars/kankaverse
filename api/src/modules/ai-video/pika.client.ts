import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Pika iş durumu (belge: MediaJobStatusResponse). Yalnız kullandığımız alanlar. */
export interface PikaJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  outputUrl: string | null;
  errorCode: string | null;
  /** settled → kesin ücret; pending/unavailable → henüz yok; null → fatura alanı yok. */
  billing:
    | { state: 'settled'; chargeMicroUsd: number }
    | { state: 'pending' | 'unavailable' }
    | null;
}

export interface PikaUpload {
  uploadUrl: string;
  headers: Record<string, string>;
  url: string;
}

/** Pika'dan dönen, anahtar içermeyen hata. Mesaj yalnız durum + Pika'nın kendi `message` alanıdır. */
export class PikaError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

interface RawJob {
  id?: string;
  status?: string;
  output?: { video?: { url?: string | null } } | null;
  error?: { code?: string } | null;
  billing?: { state?: string; charge_micro_usd?: number } | null;
}

const REQUEST_TIMEOUT_MS = 30_000;
const DOWNLOAD_IDLE_MS = 30_000;
const DOWNLOAD_TOTAL_MS = 60 * 60_000;
/** C14e: deneme içinde art arda ilerlemesiz yeniden bağlanma üst sınırı. */
const MAX_STALLED_RECONNECTS = 5;

/** Tek denemenin mutlak süre sınırı: dolunca etkin bağlantı kesilir, yeniden bağlanılmaz. */
interface Clock {
  expired: boolean;
  abort: (() => void) | null;
}

/** Kaldığı yerden indirme için kısmi tampon. */
interface PartialDownload {
  chunks: Buffer[];
  size: number;
}

/**
 * Pika HTTP istemcisi (yalnız `fetch`). API anahtarı yalnız `X-API-Key` başlığında Pika sunucusuna gider;
 * ASLA loglanmaz, hata mesajına/çıktıya girmez ve çıktı (CDN) adresine gönderilmez.
 */
@Injectable()
export class PikaClient {
  /** C14e: süreç belleğinde, üretim kimliği anahtarlı kısmi indirmeler (üst sınır AI_OUTPUT_MAX_BYTES/iş). */
  private readonly partials = new Map<string, PartialDownload>();

  constructor(private config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('aiVideo.apiUrl')!;
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'X-API-Key': this.config.get<string>('aiVideo.apiKey') ?? '',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json: unknown = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  private fail(status: number, json: unknown): never {
    const msg = (json as { message?: unknown } | null)?.message;
    throw new PikaError(status, `Pika ${status}${typeof msg === 'string' ? `: ${msg}` : ''}`);
  }

  /** Ücretsiz fiyat teklifi: düz gövde (`inputs` sarmalayıcısı YOK), yanıt `{ sell_usd, micro_usd }`. */
  async quote(apiId: string, body: Record<string, unknown>): Promise<number> {
    const { status, json } = await this.request(
      'POST',
      `/catalog/apis/${encodeURIComponent(apiId)}/quote`,
      body,
    );
    const micro = (json as { micro_usd?: unknown } | null)?.micro_usd;
    if (status !== 200 || typeof micro !== 'number') this.fail(status, json);
    return micro;
  }

  /** Görsel için presigned yükleme alır (`{ upload_url, headers, url }`). */
  async createUpload(contentType: string, sizeBytes: number): Promise<PikaUpload> {
    const { status, json } = await this.request('POST', '/v1/media/uploads', {
      content_type: contentType,
      size_bytes: sizeBytes,
    });
    const j = json as {
      upload_url?: string;
      headers?: Record<string, string>;
      url?: string;
    } | null;
    if (status !== 200 || !j?.upload_url || !j.url) this.fail(status, json);
    return { uploadUrl: j.upload_url, headers: j.headers ?? {}, url: j.url };
  }

  /** Presigned adrese PUT. Pika anahtarı GÖNDERİLMEZ (üçüncü taraf depolama adresi). */
  async putUpload(upload: PikaUpload, body: Buffer, contentType: string): Promise<void> {
    const res = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, ...upload.headers },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 2),
    });
    if (!res.ok) throw new PikaError(res.status, `Pika yükleme ${res.status}`);
  }

  /**
   * İş gönderir. Pika hem 2xx hem de bazı hatalarda (403 bakiye, 429, 503) iş zarfı döner:
   * gövde `id`+`status` taşıyorsa HTTP durumundan bağımsız iş olarak döner (failed + error.code).
   */
  async submit(
    apiId: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<PikaJob> {
    const { status, json } = await this.request('POST', `/v1/media/${apiId}`, body, {
      'Idempotency-Key': idempotencyKey,
    });
    const job = toJob(json);
    if (!job) this.fail(status, json);
    return job;
  }

  async getJob(jobId: string): Promise<PikaJob> {
    const { status, json } = await this.request(
      'GET',
      `/v1/media/jobs/${encodeURIComponent(jobId)}`,
    );
    const job = status === 200 ? toJob(json) : null;
    if (!job) this.fail(status, json);
    return job;
  }

  /** İş medyasını Pika'da siler (204; tekrar güvenli). 404 başarı sayılır; diğer hatalar fırlatır. */
  async deleteJob(jobId: string): Promise<void> {
    const { status, json } = await this.request(
      'DELETE',
      `/v1/media/jobs/${encodeURIComponent(jobId)}`,
    );
    if (status !== 204 && status !== 404) this.fail(status, json);
  }

  /**
   * Çıktı videosunu akışla indirir; `maxBytes` aşılırsa fırlatır. Anahtar GÖNDERİLMEZ.
   * C14c: toplam süre değil BOŞTA kalma zaman aşımı (yavaş CDN ~28 KB/s verir).
   * C14e: kopma/boşta kalmada `Range` ile kaldığı yerden sürer; `key` verilirse kısmi tampon denemeler arası
   * (süreç belleğinde) kalır. Başarıda ya da `discardPartial` ile atılır. `totalMs` tek denemenin mutlak sınırı.
   */
  async downloadVideo(
    url: string,
    maxBytes: number,
    idleMs: number = DOWNLOAD_IDLE_MS,
    totalMs: number = DOWNLOAD_TOTAL_MS,
    key?: string,
  ): Promise<Buffer> {
    const part = (key && this.partials.get(key)) || { chunks: [], size: 0 };
    if (key) this.partials.set(key, part);
    const clock: Clock = { expired: false, abort: null };
    const total = setTimeout(() => {
      clock.expired = true;
      clock.abort?.();
    }, totalMs);
    let stalls = 0;
    try {
      for (;;) {
        const before = part.size;
        try {
          const buf = await this.pull(url, part, maxBytes, idleMs, clock);
          if (key) this.partials.delete(key);
          return buf;
        } catch (err) {
          if (err instanceof PikaError) {
            if (key && (err.httpStatus < 400 || err.httpStatus === 416)) this.partials.delete(key);
            throw err;
          }
          stalls = part.size > before ? 0 : stalls + 1;
          if (clock.expired || stalls >= MAX_STALLED_RECONNECTS) throw err;
        }
      }
    } finally {
      clearTimeout(total);
    }
  }

  /** Anahtarlı kısmi indirme tamponunu atar (başarısızlık/silme yolu). */
  discardPartial(key: string): void {
    this.partials.delete(key);
  }

  /** Tek bağlantı: kısmi varsa `Range` ister, gelen baytları `part`a ekler. Kopmada düz hata fırlar. */
  private async pull(
    url: string,
    part: PartialDownload,
    maxBytes: number,
    idleMs: number,
    clock: Clock,
  ): Promise<Buffer> {
    const ctrl = new AbortController();
    let idle = setTimeout(() => ctrl.abort(), idleMs);
    clock.abort = () => ctrl.abort();
    try {
      const headers = part.size > 0 ? { Range: `bytes=${part.size}-` } : undefined;
      const res = await fetch(url, { signal: ctrl.signal, headers });
      if (!res.ok || !res.body) throw new PikaError(res.status, `Çıktı indirme ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('video/mp4') && !type.startsWith('application/octet-stream')) {
        throw new PikaError(res.status, `Beklenmeyen çıktı türü: ${type}`);
      }
      const expected = readExpectedTotal(res, part);
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        clearTimeout(idle);
        idle = setTimeout(() => ctrl.abort(), idleMs);
        if (part.size + chunk.length > maxBytes) throw new PikaError(res.status, 'Çıktı çok büyük');
        part.chunks.push(Buffer.from(chunk));
        part.size += chunk.length;
      }
      if (expected !== null && part.size > expected) {
        throw new PikaError(res.status, 'Çıktı boyutu uyuşmuyor');
      }
      if (expected !== null && part.size < expected) throw new Error('Bağlantı erken kapandı');
      return Buffer.concat(part.chunks);
    } finally {
      clearTimeout(idle);
      clock.abort = null;
    }
  }
}

/**
 * Beklenen toplam bayt: 206 → `content-range` toplamı (başlangıç tamponla örtüşmeli); 200 → baştan
 * (tampon sıfırlanır) ve `content-length`. Bilinmiyorsa null.
 */
function readExpectedTotal(res: Response, part: PartialDownload): number | null {
  if (res.status === 206) {
    const m = /^bytes (\d+)-\d+\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    if (m && Number(m[1]) !== part.size) {
      throw new PikaError(res.status, 'Beklenmeyen aralık başlangıcı');
    }
    return m ? Number(m[2]) : null;
  }
  part.chunks = [];
  part.size = 0;
  const len = Number(res.headers.get('content-length'));
  return Number.isFinite(len) && len > 0 ? len : null;
}

function toJob(json: unknown): PikaJob | null {
  const j = json as RawJob | null;
  if (!j || typeof j.id !== 'string' || typeof j.status !== 'string') return null;
  const b = j.billing;
  let billing: PikaJob['billing'] = null;
  if (b?.state === 'settled' && typeof b.charge_micro_usd === 'number') {
    billing = { state: 'settled', chargeMicroUsd: b.charge_micro_usd };
  } else if (b?.state === 'pending' || b?.state === 'unavailable') {
    billing = { state: b.state };
  }
  return {
    id: j.id,
    status: j.status as PikaJob['status'],
    outputUrl: j.output?.video?.url ?? null,
    errorCode: j.error?.code ?? null,
    billing,
  };
}
