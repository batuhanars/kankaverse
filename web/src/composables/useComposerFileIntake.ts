import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToastStore } from '@/stores/toast'
import { resolveContentType } from '@/utils/attachmentType'

/**
 * Mesaj kutusuna dosya girişi: seçici (dosya + GIF), Ctrl+V yapıştırma ve sürükle-bırak.
 *
 * Neden composable: kanal ve DM kutusu aynı dosya alımını kopyalıyordu ve C25 ile dört
 * girişe çıktı (Rule of Three). Burada tek kural seti var: tek dosya, tür kontrolü,
 * düzenleme modunda dosya alma yok, sonuç `composeFile`e yazılır. Bileşenler yalnız bağlar.
 * Tür kontrolü kapı değil erken uyarı; otorite sunucu (R7-nötr).
 */
export function useComposerFileIntake(options: {
  /** Dosya alınacak alan (liste + kutu): paste ve drop bunun üstünde dinlenir. */
  composeFile: Ref<File | null>
  /** True iken hiçbir giriş dosya almaz (düzenleme modu). */
  disabled?: () => boolean
}) {
  const { t } = useI18n()
  const toast = useToastStore()
  const dragging = ref(false)
  let dragDepth = 0 // iç içe öğelerde enter/leave titremesini önler

  const isDisabled = () => options.disabled?.() === true

  /** Tek giriş kapısı: ilk dosyayı al, türü doğrula, ek akışına yaz. */
  function takeFiles(files: ArrayLike<File>) {
    if (files.length === 0 || isDisabled() || options.composeFile.value) return
    const file = files[0]
    if (files.length > 1) toast.info(t('attachment.singleFileOnly'))
    if (!resolveContentType(file.name, file.type)) {
      toast.error(t('attachment.errors.UNSUPPORTED_TYPE'))
      return
    }
    options.composeFile.value = file
  }

  function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement
    const files = input.files ? Array.from(input.files) : []
    input.value = '' // aynı dosyayı tekrar seçmeye izin ver
    takeFiles(files)
  }

  function onPaste(e: ClipboardEvent) {
    const files = e.clipboardData?.files
    if (!files || files.length === 0 || isDisabled()) return // yalnız metin: davranış değişmez
    e.preventDefault()
    takeFiles(Array.from(files))
  }

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files') === true

  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e) || isDisabled()) return
    dragDepth++
    dragging.value = true
  }

  function onDragOver(e: DragEvent) {
    if (!hasFiles(e) || isDisabled()) return
    e.preventDefault() // bırakmaya izin ver
  }

  function onDragLeave(e: DragEvent) {
    if (!hasFiles(e) || isDisabled()) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dragging.value = false
  }

  function onDrop(e: DragEvent) {
    dragDepth = 0
    dragging.value = false
    if (!hasFiles(e) || isDisabled()) return
    e.preventDefault()
    takeFiles(Array.from(e.dataTransfer?.files ?? []))
  }

  // Alan dışına bırakılan dosya Electron'da sayfayı dosyaya götürmesin (desktop/'a dokunmadan).
  function blockStrayFileDrag(e: DragEvent) {
    if (hasFiles(e)) e.preventDefault()
  }
  onMounted(() => {
    window.addEventListener('dragover', blockStrayFileDrag)
    window.addEventListener('drop', blockStrayFileDrag)
  })
  onUnmounted(() => {
    window.removeEventListener('dragover', blockStrayFileDrag)
    window.removeEventListener('drop', blockStrayFileDrag)
  })

  return { dragging, onFileSelected, onPaste, onDragEnter, onDragOver, onDragLeave, onDrop }
}
