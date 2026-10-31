import type { AiVideoRefKind } from '@/api/aiVideo'

/** C42 §1.4: istemdeki etiket biçimi (sunucu çevirir). `@Görsel<n>`, `@Video<n>`, `@Ses<n>`; n türü içindeki sıra. */
export const TAG_NAME: Record<AiVideoRefKind, string> = {
  image: 'Görsel',
  video: 'Video',
  audio: 'Ses',
}

const TAG_RE = /@(Görsel|Video|Ses)(\d+)/gi
const KIND_OF_NAME = new Map<string, AiVideoRefKind>(
  (Object.keys(TAG_NAME) as AiVideoRefKind[]).map((k) => [TAG_NAME[k].toLowerCase(), k]),
)

export const tagLabel = (kind: AiVideoRefKind, n: number) => `${TAG_NAME[kind]}${n}`

export interface PromptPart {
  text: string
  tag: AiVideoRefKind | null
}

/** Metni düz parçalar ile etiket parçalarına böler (renklendirme katmanı için). */
export function splitTags(text: string): PromptPart[] {
  const parts: PromptPart[] = []
  let last = 0
  for (const m of text.matchAll(TAG_RE)) {
    const idx = m.index ?? 0
    if (idx > last) parts.push({ text: text.slice(last, idx), tag: null })
    parts.push({ text: m[0], tag: KIND_OF_NAME.get(m[1].toLowerCase()) ?? null })
    last = idx + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), tag: null })
  return parts
}

/**
 * Bir ek kaldırılınca (§3.5): o eke ait etiketler silinir, aynı türdeki sonraki eklerin numarası bir azalır.
 * `n` kaldırılan ekin türü içindeki 1 tabanlı sırası.
 */
export function relabelAfterRemove(text: string, kind: AiVideoRefKind, n: number): string {
  let removed = false
  const out = text.replace(TAG_RE, (all, name: string, num: string) => {
    if (KIND_OF_NAME.get(name.toLowerCase()) !== kind) return all
    const k = Number(num)
    if (k === n) {
      removed = true
      return ''
    }
    return k > n ? `@${TAG_NAME[kind]}${k - 1}` : all
  })
  return removed ? out.replace(/ {2,}/g, ' ') : out
}

/** Etiket rengi (token): görsel turuncu, video mavi, ses yeşil. Kart rozeti ve istem vurgusu aynı rengi kullanır. */
export const TAG_COLOR: Record<AiVideoRefKind, string> = {
  image: 'var(--kv-accent-500)',
  video: 'var(--kv-info)',
  audio: 'var(--kv-success)',
}
