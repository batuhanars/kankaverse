import { webProvider } from '@kankaverse/e2ee-core'
import { flowSuite } from './flowSuite'
import { notificationSuite } from './notificationSuite'

flowSuite('web', webProvider)
notificationSuite('web') // beforeEach ve sunucu flowSuite'ten gelir
