import { webProvider } from '@kankaverse/e2ee-core'
import { backupSuite } from './backupSuite'
import { flowSuite } from './flowSuite'
import { frankingSuite } from './frankingSuite'
import { notificationSuite } from './notificationSuite'

flowSuite('web', webProvider)
frankingSuite('web')
notificationSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
backupSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
