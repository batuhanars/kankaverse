import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

/**
 * Sprint M3c §2 — uygulama içi galeri ızgarasının veri kaynağı.
 *
 * 🔴 **Sahip kararı 2026-08-04.** PM sistem seçicisini önermişti (sıfır izin, sıfır bağımlılık);
 * sahip Discord'daki gömülü ızgarayı seçti. Bedeli bu dosya: bir izin makinesi + sayfalama +
 * kısmi erişim dalı. İtiraz sözleşmede kayıtlı, karar sahibin.
 *
 * 🔴 **Yalnız FOTOĞRAF listelenir.** Sunucunun ek allowlist'inde `video/*` YOK
 * (`attachments.service.ts` `ALLOWED_CONTENT_TYPES`); videoyu ızgarada göstermek, dokununca kesin
 * hata veren bir yüzey açmak olurdu.
 */

/**
 * `checking` → izin cevabı henüz gelmedi · `granted` → tam erişim · `limited` → kullanıcı
 * "yalnız seçilen fotoğraflar" dedi (Android 14+ / iOS 14+) · `denied` → reddedildi.
 */
export type MediaAccess = 'checking' | 'granted' | 'limited' | 'denied';

const PAGE_SIZE = 60;

function toAccess(permission: MediaLibrary.PermissionResponse): MediaAccess {
  if (!permission.granted) return 'denied';
  // `accessPrivileges` yalnız kısmi erişimi destekleyen sürümlerde dolu gelir; yoksa tam erişim.
  return permission.accessPrivileges === 'limited' ? 'limited' : 'granted';
}

export function useMediaLibrary(enabled: boolean) {
  const [access, setAccess] = useState<MediaAccess>('checking');
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);

  const cursorRef = useRef<string | undefined>(undefined);
  const hasNextRef = useRef(true);
  const loadingRef = useRef(false);
  const askedRef = useRef(false);

  /** Bir sayfa daha çek. `reset` → baştan (izin kümesi değişince liste komple tazelenir). */
  const loadPage = useCallback((reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && !hasNextRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    if (reset) {
      cursorRef.current = undefined;
      hasNextRef.current = true;
    }
    MediaLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      mediaType: ['photo'],
      sortBy: ['creationTime'],
      after: reset ? undefined : cursorRef.current,
    })
      .then((page) => {
        cursorRef.current = page.endCursor;
        hasNextRef.current = page.hasNextPage;
        setAssets((prev) => (reset ? page.assets : [...prev, ...page.assets]));
      })
      // Hata sessiz: ızgara bir kolaylık, çöktüğünde kullanıcı sistem seçicisi yolunu kullanabilir.
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, []);

  // İzin + ilk sayfa. `askedRef` sayesinde panel her açılışta izni yeniden SORMAZ; bir kez sorulur,
  // sonuç bileşenin ömrü boyunca korunur.
  useEffect(() => {
    if (!enabled || askedRef.current) return;
    askedRef.current = true;
    let cancelled = false;
    MediaLibrary.getPermissionsAsync()
      .then((current) => (current.granted ? current : MediaLibrary.requestPermissionsAsync()))
      .then((permission) => {
        if (cancelled) return;
        const next = toAccess(permission);
        setAccess(next);
        if (next !== 'denied') loadPage(true);
      })
      .catch(() => {
        if (!cancelled) setAccess('denied');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, loadPage]);

  /**
   * 🔴 Kısmi erişimde uygulamaya dönünce listeyi tazele.
   *
   * "Daha fazla fotoğraf seç" sistem ekranı ayrı bir yüzeyde açılıyor ve kapandığında bize haber
   * vermiyor: `presentPermissionsPickerAsync` ekranı GÖSTERİNCE çözülüyor, kullanıcı seçimini
   * bitirince değil. Ele alınmazsa kullanıcı yeni fotoğraf paylaşır, geri döner ve ızgarada onu
   * göremezdi — sözleşmenin "fotoğraflarım kayboldu sanır" uyarısının ikinci yarısı.
   */
  useEffect(() => {
    if (!enabled || access !== 'limited') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        MediaLibrary.getPermissionsAsync()
          .then((permission) => {
            setAccess(toAccess(permission));
            loadPage(true);
          })
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [enabled, access, loadPage]);

  /** Kısmi erişimde izin verilen fotoğraf kümesini genişletme yolu (Android 14+ / iOS). */
  const pickMorePhotos = useCallback(async () => {
    try {
      await MediaLibrary.presentPermissionsPickerAsync(['photo']);
    } catch {
      // Sürüm desteklemiyorsa sessiz kal: satır zaten yalnız `limited` durumunda çiziliyor.
    }
    loadPage(true);
  }, [loadPage]);

  return {
    access,
    assets,
    loading,
    loadMore: () => loadPage(false),
    pickMorePhotos,
  };
}
