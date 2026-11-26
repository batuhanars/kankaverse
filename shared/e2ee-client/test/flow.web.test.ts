import { webProvider } from '@kankaverse/e2ee-core'
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
import { welcomeQueueSuite } from './welcomeQueueSuite'

flowSuite('web', webProvider)
frankingSuite('web')
notificationSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
backupSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
transferSuite('web')
groupSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
rebindSuite('web')
callSuite('web') // E8; beforeEach ve sunucu flowSuite'ten gelir
identitySuite('web') // E7; beforeEach ve sunucu flowSuite'ten gelir
localSearchSuite('web') // E7 Parça B
welcomeQueueSuite('web') // C77; beforeEach ve sunucu flowSuite'ten gelir
