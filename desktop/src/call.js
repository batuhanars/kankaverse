// C74 — gelen arama penceresi. Yalnız gelen veriyi çizer ve basılan butonu bildirir; karar web'de.
// Metinler web'den çevrilmiş gelir (i18n tek kaynak); bu dosyada kullanıcıya görünen metin yok.
// Hepsi textContent ile yazılır (innerHTML yok): ad kullanıcı girdisi.

const $ = (id) => document.getElementById(id)

function showInitial(initial) {
  const avatar = $('avatar')
  avatar.replaceChildren()
  avatar.textContent = initial
}

window.callWindow.onData((d) => {
  $('name').textContent = d.name
  $('subtitle').textContent = d.subtitle

  if (d.avatarUrl) {
    const img = document.createElement('img')
    img.alt = ''
    img.onerror = () => showInitial(d.initial) // CDN'e ulaşılamazsa baş harf
    img.src = d.avatarUrl
    $('avatar').replaceChildren(img)
  } else {
    showInitial(d.initial)
  }

  for (const [id, label] of [['accept', d.acceptLabel], ['reject', d.rejectLabel]]) {
    $(id).title = label
    $(id).setAttribute('aria-label', label)
  }

  $('card').classList.add('ready')
})

// Çift tıklamada iki IPC gitmesin: ilk basışta ikisi de kilitlenir (pencere zaten kapanacak).
let done = false
function press(fn) {
  if (done) return
  done = true
  fn()
}
$('accept').addEventListener('click', () => press(window.callWindow.accept))
$('reject').addEventListener('click', () => press(window.callWindow.reject))
