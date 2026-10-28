import { useCallback, useEffect, useRef, useState } from 'react';
import { aiVideoApi, type AiVideoModelOption, type AiVideoOptionsDto } from '@/api/aiVideo';

const ESTIMATE_DELAY_MS = 400;

/**
 * Sprint C14d (web `useAiVideoForm` eşdeğeri): model / çözünürlük / süre seçimi (options'tan) ve
 * 400 ms gecikmeli canlı teklif. İstek yarışında yalnız SON isteğin sonucu yazılır (seq sayacı).
 * Sayfa kapanınca (bileşen sökülünce) bekleyen zamanlayıcı ve uçuştaki istek etkisiz kalır.
 */
export function useAiVideoForm(withImage: boolean) {
  const [options, setOptions] = useState<AiVideoOptionsDto | null>(null);
  const [model, setModel] = useState('');
  const [resolution, setResolution] = useState('');
  const [durationS, setDurationS] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(''); // '' = Otomatik (alan gönderilmez)
  const [estimateUsd, setEstimateUsd] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateFailed, setEstimateFailed] = useState(false);
  const seq = useRef(0);
  const alive = useRef(true);
  const loaded = useRef(false);

  const current: AiVideoModelOption | null = options?.models.find((m) => m.key === model) ?? null;
  // Liste sunucudan; model ya da görsel durumu değişince ve seçili ölçü listede yoksa Otomatik'e döner.
  const aspectRatios = current?.aspectRatios[withImage ? 'image' : 'text'] ?? [];
  const remainingUsd = options ? Math.max(0, options.dailyCapUsd - options.todaySpentUsd) : 0;
  const overCap = estimateUsd !== null && estimateUsd > remainingUsd;

  const pickModel = useCallback((key: string, from: AiVideoOptionsDto) => {
    const m = from.models.find((x) => x.key === key);
    setModel(key);
    if (!m) return;
    setResolution((r) => (m.resolutions.includes(r) ? r : m.resolutions[0]));
    setDurationS((d) => (m.durations.includes(d) ? d : m.durations[0]));
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const data = await aiVideoApi.options();
      if (!alive.current) return;
      if (!loaded.current && data.models.length) pickModel(data.models[0].key, data);
      loaded.current = true;
      setOptions(data);
    } catch {
      /* seçenekler yüklenmezse form boş kalır; hata kullanıcıya üretim denemesinde döner */
    }
  }, [pickModel]);

  useEffect(() => {
    alive.current = true;
    void loadOptions();
    return () => {
      alive.current = false;
      seq.current += 1; // uçuştaki istek sonucu yazmasın
    };
  }, [loadOptions]);

  const ratiosKey = aspectRatios.join(',');
  useEffect(() => {
    setAspectRatio((a) => (a && !ratiosKey.split(',').includes(a) ? '' : a));
  }, [ratiosKey]);

  useEffect(() => {
    if (!model || !resolution || !durationS) return;
    const id = ++seq.current;
    setEstimating(true);
    setEstimateFailed(false);
    const timer = setTimeout(async () => {
      try {
        const { quoteUsd } = await aiVideoApi.estimate(
          { model, resolution, durationS, ...(aspectRatio && { aspectRatio }) },
          withImage,
        );
        if (id === seq.current) setEstimateUsd(quoteUsd);
      } catch {
        if (id === seq.current) setEstimateFailed(true);
      } finally {
        if (id === seq.current) setEstimating(false);
      }
    }, ESTIMATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [model, resolution, durationS, aspectRatio, withImage]);

  return {
    options,
    model,
    resolution,
    durationS,
    aspectRatio,
    aspectRatios,
    current,
    estimateUsd,
    estimating,
    estimateFailed,
    overCap,
    setResolution,
    setDurationS,
    setAspectRatio,
    loadOptions,
    pickModel: (key: string) => options && pickModel(key, options),
  };
}
