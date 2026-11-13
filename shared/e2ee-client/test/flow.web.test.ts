import { webProvider } from '@kankaverse/e2ee-core'
import { backupSuite } from './backupSuite'
import { transferSuite } from './transferSuite'
import { flowSuite } from './flowSuite'
import { groupSuite } from './groupSuite'
import { rebindSuite } from './rebindSuite'
import { frankingSuite } from './frankingSuite'
import { notificationSuite } from './notificationSuite'

flowSuite('web', webProvider)
frankingSuite('web')
notificationSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
backupSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
transferSuite('web')
groupSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
rebindSuite('web')
