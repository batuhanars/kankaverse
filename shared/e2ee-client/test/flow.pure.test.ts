import { pureProvider } from '@kankaverse/e2ee-core'
import { backupSuite } from './backupSuite'
import { transferSuite } from './transferSuite'
import { identitySuite } from './identitySuite'
import { localSearchSuite } from './localSearchSuite'
import { flowSuite } from './flowSuite'
import { callSuite } from './callSuite'
import { groupSuite } from './groupSuite'
import { rebindSuite } from './rebindSuite'
import { frankingSuite } from './frankingSuite'
import { notificationSuite } from './notificationSuite'

// Mobil yolu: crypto.subtle'sız saf noble sağlayıcısı aynı akışı geçmeli.
flowSuite('pure', pureProvider)
frankingSuite('pure')
notificationSuite('pure') // beforeEach ve sunucu flowSuite'ten gelir
backupSuite('pure') // beforeEach ve sunucu flowSuite'ten gelir
transferSuite('pure')
groupSuite('pure') // beforeEach ve sunucu flowSuite'ten gelir
rebindSuite('pure')
callSuite('pure') // E8; beforeEach ve sunucu flowSuite'ten gelir
identitySuite('pure') // E7; beforeEach ve sunucu flowSuite'ten gelir
localSearchSuite('pure') // E7 Parça B
