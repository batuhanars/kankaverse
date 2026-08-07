<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import KvSelect, { type SelectOption } from '@/components/ui/KvSelect.vue'

const props = defineProps<{ error?: string }>()

// Dışarıya YYYY-MM-DD string veya '' emit eder
const model = defineModel<string>({ default: '' })

const { t } = useI18n()

const day = ref('')
const month = ref('')
const year = ref('')

// Ay seçenekleri i18n'den
const monthOptions = computed<SelectOption[]>(() =>
  Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: t(`months.${i + 1}`),
  })),
)

// Yıl seçenekleri: bugünden geriye 120 yıla
const currentYear = new Date().getFullYear()
const yearOptions = computed<SelectOption[]>(() =>
  Array.from({ length: 120 }, (_, i) => {
    const y = currentYear - i
    return { value: String(y), label: String(y) }
  }),
)

// Seçili ay ve yıla göre dinamik gün sayısı
const daysInMonth = computed(() => {
  if (!month.value) return 31
  const m = parseInt(month.value)
  const y = year.value ? parseInt(year.value) : 2000
  return new Date(y, m, 0).getDate()
})

const dayOptions = computed<SelectOption[]>(() =>
  Array.from({ length: daysInMonth.value }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1).padStart(2, '0'),
  })),
)

// Ay değişince geçersiz gün sıfırla
watch(daysInMonth, (max) => {
  if (day.value && parseInt(day.value) > max) {
    day.value = ''
  }
})

// Üç segment dolunca model'e YYYY-MM-DD yaz
watch([day, month, year], ([d, m, y]) => {
  if (d && m && y) {
    const mm = m.padStart(2, '0')
    const dd = d.padStart(2, '0')
    model.value = `${y}-${mm}-${dd}`
  } else {
    model.value = ''
  }
})

// Dışarıdan değer gelirse parse et
watch(
  () => model.value,
  (val) => {
    if (!val) return
    const [y, m, d] = val.split('-')
    if (y && m && d) {
      year.value = String(parseInt(y))
      month.value = String(parseInt(m))
      day.value = String(parseInt(d))
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label class="text-[11px] font-semibold uppercase tracking-wide" style="color: var(--kv-text-secondary);">
      {{ t('auth.birthDate') }}<span class="ml-0.5" style="color: var(--kv-danger);">*</span>
    </label>
    <div class="grid grid-cols-3 gap-2">
      <KvSelect
        v-model="day"
        :placeholder="t('auth.birthDateDay')"
        :options="dayOptions"
        :error="undefined"
      />
      <KvSelect
        v-model="month"
        :placeholder="t('auth.birthDateMonth')"
        :options="monthOptions"
        :error="undefined"
      />
      <KvSelect
        v-model="year"
        :placeholder="t('auth.birthDateYear')"
        :options="yearOptions"
        :error="undefined"
      />
    </div>
    <span v-if="error" class="text-[12px]" style="color: var(--kv-danger);">{{ error }}</span>
    <p class="text-[11px]" style="color: var(--kv-text-muted);">{{ t('auth.birthDateHelp') }}</p>
  </div>
</template>
