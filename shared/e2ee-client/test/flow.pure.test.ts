import { pureProvider } from '@kankaverse/e2ee-core'
import { flowSuite } from './flowSuite'

// Mobil yolu: crypto.subtle'sız saf noble sağlayıcısı aynı akışı geçmeli.
flowSuite('pure', pureProvider)
