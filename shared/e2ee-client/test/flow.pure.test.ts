import { pureProvider } from '@kankaverse/e2ee-core'
import { flowSuite } from './flowSuite'
import { notificationSuite } from './notificationSuite'

// Mobil yolu: crypto.subtle'sız saf noble sağlayıcısı aynı akışı geçmeli.
flowSuite('pure', pureProvider)
notificationSuite('pure') // beforeEach ve sunucu flowSuite'ten gelir
