/**
 * picker.js — Ekran paylaşımı kaynak seçici renderer
 *
 * pickerBridge (picker-preload.js aracılığıyla) ile haberleşir:
 *   pickerBridge.onSources(sources) → kaynak listesini al
 *   pickerBridge.select(id, withAudio) → seçim gönder
 *   pickerBridge.cancel() → iptal gönder
 */

const content  = document.getElementById('content')
const loading  = document.getElementById('loading')
const btnShare = document.getElementById('btnShare')
const btnCancel = document.getElementById('btnCancel')
const audioCheck = document.getElementById('audioCheck')

let selectedId = null

// İptal butonuna tıkla
btnCancel.addEventListener('click', () => {
  window.pickerBridge.cancel()
})

// Paylaş butonuna tıkla
btnShare.addEventListener('click', () => {
  if (!selectedId) return
  window.pickerBridge.select(selectedId, audioCheck.checked)
})

// main'den kaynak listesi geldiğinde render et
window.pickerBridge.onSources((sources) => {
  loading.remove()

  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => !s.id.startsWith('screen:'))

  renderGroup('Ekranlar', screens)
  renderGroup('Pencereler', windows)
})

/**
 * Bir grubu başlık + grid olarak içeriğe ekler.
 * @param {string} label
 * @param {Array}  sources
 */
function renderGroup(label, sources) {
  const group = document.createElement('div')
  group.className = 'group'

  const title = document.createElement('div')
  title.className = 'group-label'
  title.textContent = label
  group.appendChild(title)

  if (sources.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Kaynak bulunamadı.'
    group.appendChild(empty)
    content.appendChild(group)
    return
  }

  const grid = document.createElement('div')
  grid.className = 'grid'

  sources.forEach((source) => {
    const card = document.createElement('div')
    card.className = 'card'
    card.dataset.id = source.id

    // Thumbnail
    const thumbWrap = document.createElement('div')
    thumbWrap.className = 'thumb-wrap'

    if (source.thumbnail) {
      const img = document.createElement('img')
      img.src = source.thumbnail
      img.alt = source.name
      thumbWrap.appendChild(img)
    } else {
      const icon = document.createElement('span')
      icon.className = 'no-thumb'
      icon.textContent = source.id.startsWith('screen:') ? '🖥' : '🪟'
      thumbWrap.appendChild(icon)
    }

    // Ad
    const name = document.createElement('div')
    name.className = 'card-name'
    name.textContent = source.name || source.id
    name.title = source.name || source.id

    card.appendChild(thumbWrap)
    card.appendChild(name)

    card.addEventListener('click', () => selectCard(card, source.id))

    grid.appendChild(card)
  })

  group.appendChild(grid)
  content.appendChild(group)
}

/** Kartı seç; önceki seçimi temizle. */
function selectCard(card, id) {
  document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'))
  card.classList.add('selected')
  selectedId = id
  btnShare.disabled = false
}
