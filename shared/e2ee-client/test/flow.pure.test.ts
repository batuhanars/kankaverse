import { pureProvider } from '@kankaverse/e2ee-core'
import { backupSuite } from './backupSuite'
import { transferSuite } from './transferSuite'
import { flowSuite } from './flowSuite'
import { frankingSuite } from './frankingSuite'
import { notificationSuite } from './notificationSuite'

// Mobil yolu: crypto.subtle'sız saf noble sağlayıcısı aynı akışı geçmeli.
flowSuite('pure', pureProvider)
frankingSuite('pure')
notificationSuite('pure') // beforeEach ve sunucu flowSuite'ten gelir
backupSuite('pure') // beforeEach ve sunucu flowSuite'ten gelir
transferSuite('pure')
