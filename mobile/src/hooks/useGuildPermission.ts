import { useEffect, useState } from 'react';
import { guildsApi } from '@/api/guilds';
import { rolesApi } from '@/api/roles';
import { useAuthStore } from '@/stores/auth';

/**
 * Sprint M1h — "bu ortamda şu izne sahip miyim?"
 *
 * 🔴 **Neden OWNER/ADMIN kontrolü YETMİYOR:** `MANAGE_MESSAGES` granüler bir rol iznidir. Sadece
 * OWNER/ADMIN'e bakmak, o izne sahip **özel rolü olan sıradan üyeden** yeteneği gizlerdi — yani
 * sunucunun izin verdiği bir işi istemci saklardı. Bu, "istemci sunucunun kararını gevşetmez"
 * kuralının simetriği: **daraltmaz da.**
 *
 * Web `useGuildPermissions` ile aynı mantık (`MessageArea.vue`: `can('MANAGE_MESSAGES')`):
 * sahip her şeyi yapar · `ADMINISTRATOR` her şeyi yapar · aksi hâlde rollerin izin birleşimi.
 *
 * Karar yine de **UX'tir**: sunucu 403 dönerse mesajı gösteririz. Buradaki hesap yalnız
 * yapılamayacak bir işi ekranda göstermemek için.
 */
export function useGuildPermission(guildId: string | null | undefined, permission: string): boolean {
  const myUserId = useAuthStore((s) => s.user?.id);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!guildId || !myUserId) {
      setAllowed(false);
      return;
    }
    let cancelled = false;

    // Tekil ortam ucu YOK — sahiplik bilgisi üye olduğum ortamlar listesinden okunur (aynı veri,
    // ek uç gerekmiyor).
    Promise.all([guildsApi.list(), guildsApi.getMembers(guildId), rolesApi.listByGuild(guildId)])
      .then(([guilds, members, roles]) => {
        if (cancelled) return;
        if (guilds.find((g) => g.id === guildId)?.ownerId === myUserId) {
          setAllowed(true);
          return;
        }
        const me = members.find((m) => m.userId === myUserId);
        if (!me) {
          setAllowed(false);
          return;
        }
        const myRoleIds = new Set(me.roles.map((r) => r.id));
        const granted = new Set<string>();
        for (const role of roles) {
          // `@everyone` rolü herkese uygulanır — açıkça atanmış olması gerekmez.
          if (role.isEveryone || myRoleIds.has(role.id)) {
            for (const p of role.permissions) granted.add(p);
          }
        }
        setAllowed(granted.has('ADMINISTRATOR') || granted.has(permission));
      })
      // Hata SESSİZ ve **kısıtlayıcı**: yetki bilinemiyorsa yokmuş gibi davranılır. Aksi yön
      // (bilinmiyorsa göster) kullanıcıya sürekli 403 yedirirdi.
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });

    return () => {
      cancelled = true;
    };
  }, [guildId, myUserId, permission]);

  return allowed;
}
