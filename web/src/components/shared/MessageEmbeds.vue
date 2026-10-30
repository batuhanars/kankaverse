<script setup lang="ts">
/**
 * MessageEmbeds - C35 §5.2: gelen webhook mesajinin embed kartlari.
 *
 * Guvenlik: gorsel alani HIC yok (sunucu atar, §0.4). Aciklama mesajla ayni guvenli isleyiciden
 * gecer (markdown-it + DOMPurify); baska hicbir alan v-html'e girmez, metinler {{ }} ile kacirilir.
 * Baglantilar yalniz http(s):// ise cizilir, yeni sekme + rel="noopener noreferrer".
 *
 * Dar ekran (390 / 320px): kart satirin icerik sutununa gore daralir (w-full min-w-0, max 520px),
 * uzun kelime/adres `break-words` + `[overflow-wrap:anywhere]` ile kirilir, alan izgarasi
 * `minmax(min(100%, 140px), 1fr)` oldugu icin 320px'te tek, 390px'te iki, 520px'te en cok uc sutun olur.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderMessageHtml } from '@/utils/markdown'
import type { MessageEmbed } from '@/types'

const props = defineProps<{
  embeds: MessageEmbed[]
  mentionResolver?: (userId: string) => string
  roleResolver?: (roleId: string) => { name: string; color?: string | null } | undefined
}>()

const { t } = useI18n()

/** Sunucu yalniz http(s) kabul eder; istemci de savunma derinligi olarak tekrar sinar (javascript: vb. cizilmez). */
function safeHref(url: string | undefined): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

function accentColor(embed: MessageEmbed): string {
  if (typeof embed.color !== 'number' || embed.color < 0 || embed.color > 0xffffff) {
    return 'var(--kv-border-strong)'
  }
  return `#${embed.color.toString(16).padStart(6, '0')}`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
  return `${date} ${time}`
}

function renderText(text: string): string {
  return renderMessageHtml(
    text,
    (id) => props.mentionResolver?.(id),
    t('mention.unknown'),
    (roleId) => props.roleResolver?.(roleId),
  )
}

const cards = computed(() =>
  props.embeds.map((embed) => ({
    embed,
    accent: accentColor(embed),
    titleHref: safeHref(embed.url),
    authorHref: safeHref(embed.author?.url),
    descriptionHtml: embed.description ? renderText(embed.description) : '',
    time: embed.timestamp ? formatTimestamp(embed.timestamp) : '',
  })),
)
</script>

<template>
  <div class="flex flex-col gap-2 mt-1 min-w-0">
    <article
      v-for="(card, i) in cards"
      :key="i"
      class="w-full min-w-0 max-w-[520px] rounded-[var(--kv-radius-sm)] border-l-4 px-3 py-2.5 flex flex-col gap-1.5 break-words [overflow-wrap:anywhere]"
      :style="`border-left-color: ${card.accent}; background-color: var(--kv-bg-sidebar);`"
    >
      <div v-if="card.embed.author" class="text-[13px] font-semibold" style="color: var(--kv-text-secondary);">
        <a
          v-if="card.authorHref"
          :href="card.authorHref"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline"
        >{{ card.embed.author.name }}</a>
        <span v-else>{{ card.embed.author.name }}</span>
      </div>

      <div v-if="card.embed.title" class="text-[15px] font-semibold" style="color: var(--kv-text-primary);">
        <a
          v-if="card.titleHref"
          :href="card.titleHref"
          target="_blank"
          rel="noopener noreferrer"
          class="hover:underline"
          style="color: var(--kv-accent-400);"
        >{{ card.embed.title }}</a>
        <span v-else>{{ card.embed.title }}</span>
      </div>

      <!-- Aciklama: mesajla ayni guvenli markdown isleyicisi (DOMPurify), ham HTML yok -->
      <div
        v-if="card.descriptionHtml"
        class="kv-md text-[14px]"
        style="color: var(--kv-text-primary);"
        v-html="card.descriptionHtml"
      />

      <div
        v-if="card.embed.fields?.length"
        class="grid gap-x-3 gap-y-2"
        style="grid-template-columns: repeat(auto-fill, minmax(min(100%, 140px), 1fr));"
      >
        <div
          v-for="(field, j) in card.embed.fields"
          :key="j"
          class="min-w-0"
          :class="field.inline ? '' : 'col-span-full'"
        >
          <div class="text-[13px] font-semibold" style="color: var(--kv-text-primary);">{{ field.name }}</div>
          <div class="text-[14px] whitespace-pre-wrap" style="color: var(--kv-text-secondary);">{{ field.value }}</div>
        </div>
      </div>

      <div
        v-if="card.embed.footer || card.time"
        class="text-[12px]"
        style="color: var(--kv-text-muted);"
      >
        <span v-if="card.embed.footer">{{ card.embed.footer.text }}</span>
        <span v-if="card.embed.footer && card.time" aria-hidden="true"> · </span>
        <span v-if="card.time">{{ card.time }}</span>
      </div>
    </article>
  </div>
</template>
