import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { aiVideoApi, type AiVideoDto } from '@/api/aiVideo';
import { t } from '@/i18n';
import { aiVideoErrorText, aiVideoFailText, DOWNLOAD_PENDING } from './aiVideoErrors';
import { useAiVideoForm } from './useAiVideoForm';
import { useAiVideoImage } from './useAiVideoImage';

const POLL_MS = 4000;

/**
 * Sprint C14d (web `useAiVideo` eşdeğeri): oluştur (tek çağrı) → 4 sn yoklama → sonuç.
 * Yoklama sayfa kapanınca (bileşen sökülünce) durur; uygulama arka plandan dönünce hemen bir tur atılır.
 * Hata metni koda göre i18n'den, bilinmeyende sunucu mesajından.
 */
export function useAiVideo() {
  const [prompt, setPrompt] = useState('');
  const [job, setJob] = useState<AiVideoDto | null>(null);
  const [recent, setRecent] = useState<AiVideoDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const imageState = useAiVideoImage(setError);
  const form = useAiVideoForm(!!imageState.image);
  const jobRef = useRef<AiVideoDto | null>(null);
  const alive = useRef(true);

  const working = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  const saving = job?.errorCode === DOWNLOAD_PENDING;
  const elapsedSec = job ? Math.max(0, Math.floor((now - new Date(job.createdAt).getTime()) / 1000)) : 0;

  const refreshRecent = useCallback(async () => {
    try {
      const rows = await aiVideoApi.list();
      if (alive.current) setRecent(rows);
    } catch {
      /* son üretimler yardımcı bölüm; hata sessiz */
    }
  }, []);

  const poll = useCallback(async () => {
    const cur = jobRef.current;
    if (!cur) return;
    try {
      const next = await aiVideoApi.get(cur.id);
      if (!alive.current || jobRef.current?.id !== cur.id) return;
      jobRef.current = next;
      setJob(next);
      if (next.status !== 'QUEUED' && next.status !== 'RUNNING') void refreshRecent();
    } catch {
      /* geçici ağ hatası, sonraki turda yeniden dene */
    }
  }, [refreshRecent]);

  useEffect(() => {
    if (!working) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const pollTimer = setInterval(() => void poll(), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void poll());
    return () => {
      clearInterval(tick);
      clearInterval(pollTimer);
      sub.remove();
    };
  }, [working, job?.id, poll]);

  useEffect(() => {
    alive.current = true;
    void refreshRecent();
    return () => {
      alive.current = false;
    };
  }, [refreshRecent]);

  function track(row: AiVideoDto | null) {
    jobRef.current = row;
    setJob(row);
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const inputKey = imageState.image ? await imageState.upload(imageState.image) : undefined;
      const sel = { model: form.model, resolution: form.resolution, durationS: form.durationS };
      track(await aiVideoApi.create(sel, prompt, inputKey));
      void form.loadOptions(); // bugünkü harcama güncellensin
    } catch (e) {
      setError(aiVideoFailText(e));
    } finally {
      setBusy(false);
    }
  }

  /** Tek satırı siler (onaysız). Sohbete gönderilmiş ekler etkilenmez. */
  async function remove(id: string) {
    setError('');
    try {
      await aiVideoApi.remove(id);
      setRecent((rows) => rows.filter((r) => r.id !== id));
      if (jobRef.current?.id === id) track(null);
    } catch (e) {
      setError(aiVideoFailText(e));
    }
  }

  /** Son üretimlerin hepsini siler (çağıran onay alır). */
  async function clearAll() {
    setError('');
    try {
      await aiVideoApi.removeAll();
      setRecent([]);
      track(null);
    } catch (e) {
      setError(aiVideoFailText(e));
    }
  }

  /** Satır durum metni: kaydedilen RUNNING satır "Kaydediliyor". */
  function statusLabel(r: AiVideoDto): string {
    if (r.status === 'FAILED') return aiVideoErrorText(r.errorCode);
    if (r.errorCode === DOWNLOAD_PENDING) return t('aiVideo.saving');
    return t(`aiVideo.status.${r.status}`);
  }

  /** Süren satırı formda ilerleme olarak açar. */
  function open(row: AiVideoDto) {
    setError('');
    track(row);
  }

  function reset() {
    track(null);
    setError('');
  }

  return {
    prompt,
    setPrompt,
    image: imageState,
    form,
    job,
    recent,
    busy,
    setBusy,
    error,
    setError,
    working,
    saving,
    elapsedSec,
    submit,
    remove,
    clearAll,
    statusLabel,
    open,
    reset,
  };
}
