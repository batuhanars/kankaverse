import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { aiVideoApi, type AiVideoDto, type AiVideoReferencesOption } from '@/api/aiVideo';
import { authApi } from '@/api/auth';
import { extractErrorCode } from '@/api/errors';
import { useAuthStore } from '@/stores/auth';
import { syncActiveAiVideo, useAiVideoViewerStore } from '@/stores/aiVideoViewer';
import { t } from '@/i18n';
import { aiVideoErrorText, aiVideoFailText, DOWNLOAD_PENDING } from './aiVideoErrors';
import { useAiVideoForm } from './useAiVideoForm';
import { retagPrompt } from './aiVideoRefs';
import { useAiVideoRefs } from './useAiVideoRefs';

const POLL_MS = 4000;

/**
 * Hak bayrağı (`aiVideoAllowed`) yalnız uygulama açılışında çekiliyor. Sayfa açılınca ve kredi/süre
 * bitebilecek anlarda kullanıcı tazelenir: admin kredi tanımladıysa uygulamayı yeniden başlatmadan görünür (web ile aynı).
 */
async function refreshAccess() {
  try {
    useAuthStore.getState().updateUser(await authApi.me());
  } catch {
    /* geçici hata: bir sonraki yenilemede düzelir */
  }
}

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
  // Ek hook'u seçenekleri çağrı anında okur (seçenekler form hook'undan gelir, sıra döngüsünü kırar).
  const refsOption = useRef<AiVideoReferencesOption | null>(null);
  const refs = useAiVideoRefs(() => refsOption.current);
  // C33: pasif tanıtım. Kilitliyken yalnız options çağrılır.
  const locked = useAuthStore((s) => s.user?.aiVideoAllowed !== true);
  const kinds = refs.items.map((i) => i.kind);
  const form = useAiVideoForm(refs.mode, kinds, locked);
  refsOption.current = form.current?.references ?? null;
  const jobRef = useRef<AiVideoDto | null>(null);
  const alive = useRef(true);

  const working = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  // C43: kişi başı tek eşzamanlı üretim; sunucu yine 409 verir, bu yalnız erken uyarı.
  const inProgress = working || recent.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');
  const saving = job?.errorCode === DOWNLOAD_PENDING;
  const elapsedSec = job ? Math.max(0, Math.floor((now - new Date(job.createdAt).getTime()) / 1000)) : 0;

  // C44: kendi üretimleri hak istemez; kilitli (hakkı biten) kullanıcı da Son üretimler'i görür
  const refreshRecent = useCallback(async () => {
    try {
      const rows = await aiVideoApi.list();
      if (alive.current) {
        setRecent(rows);
        syncActiveAiVideo(rows);
      }
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
      if (next.status !== 'QUEUED' && next.status !== 'RUNNING') {
        const store = useAiVideoViewerStore.getState();
        if (store.activeId === next.id) store.setActive(null);
        void refreshRecent();
      }
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
    void refreshAccess();
    return () => {
      alive.current = false;
    };
  }, [refreshRecent]);

  // Sabit alandaki hata seçime aitti: kullanıcı süreyi/çözünürlüğü/ekleri değiştirince artık geçerli değil.
  useEffect(() => {
    setError('');
  }, [form.model, form.resolution, form.durationS, form.aspectRatio, refs.items.length]);

  function track(row: AiVideoDto | null) {
    jobRef.current = row;
    setJob(row);
  }

  async function submit() {
    if (locked) return;
    setError('');
    setBusy(true);
    try {
      // Tek görsel: eski `inputKey` yolu; başka her bileşim `references` (sıra = eklenme sırası).
      const input =
        refs.mode === 'image'
          ? { inputKey: refs.items[0].key }
          : refs.mode === 'reference'
            ? { references: refs.items.map((i) => ({ kind: i.kind, key: i.key! })) }
            : {};
      const sel = {
        model: form.model,
        resolution: form.resolution,
        durationS: form.durationS,
        ...(form.aspectRatio && { aspectRatio: form.aspectRatio }),
      };
      const created = await aiVideoApi.create(sel, prompt, input);
      track(created);
      if (created.status === 'QUEUED' || created.status === 'RUNNING') useAiVideoViewerStore.getState().setActive(created.id);
      void form.loadOptions(); // bugünkü harcama ve kalan kredi güncellensin
      void refreshAccess(); // bütçe bu üretimle bittiyse kilitli moda düşsün
    } catch (e) {
      setError(aiVideoFailText(e));
      if (extractErrorCode(e) === 'AI_VIDEO_BUDGET_EXCEEDED') void refreshAccess();
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

  /** Eki kaldırır; o eke ait etiketleri istemden siler, sonrakileri yeniden numaralar. */
  function removeRef(id: string) {
    const gone = refs.remove(id);
    if (gone) setPrompt((p) => retagPrompt(p, gone.kind, gone.n));
  }

  function reset() {
    track(null);
    setError('');
  }

  return {
    locked,
    prompt,
    setPrompt,
    refs,
    removeRef,
    form,
    job,
    recent,
    busy,
    setBusy,
    error,
    setError,
    working,
    inProgress,
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
