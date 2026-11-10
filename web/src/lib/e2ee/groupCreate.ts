// İlk şifreli mesajda grubu kurma (E1 §2.4): claim → createGroup → POST group → confirmCommit.
import { createGroup } from '@kankaverse/e2ee-core'
import { e2eeErrorCode, type E2eeChannelState } from '@/api/e2ee'
import { fromB64, toB64 } from './b64'
import type { E2eeContext } from './context'
import { devicesOf } from './registry'

export type CreateOutcome = 'created' | 'exists' | 'ineligible'

const GROUP_ID_BYTES = 32

/** Her üyenin en az bir etkin cihazı var mı (§2.2 uygunluk). */
export const everyMemberHasDevice = (state: E2eeChannelState): boolean =>
  state.members.length > 0 && state.members.every((m) => m.devices.some((d) => !d.revokedAt))

/**
 * Grubu bu cihaz kurar. 'exists': yarışı başkası kazandı, onun Welcome'ı beklenir (pending atılır, yerel
 * durum ilerlemedi). 'ineligible': karşı tarafın KeyPackage'ı yok; DM şifresiz kalır, geri düşme DEĞİL
 * çünkü grup hiç kurulmadı (§1.5 yalnız bir kez şifreli olmuş DM için).
 */
export async function createChannelGroup(
  ctx: E2eeContext,
  channelId: string,
  state: E2eeChannelState,
): Promise<CreateOutcome> {
  if (!everyMemberHasDevice(state)) return 'ineligible'
  const device = await ctx.getDevice()
  const { active } = devicesOf(state)
  const targets = active.map((d) => d.deviceId).filter((id) => id !== device.deviceId)
  const { data: claimed } = await ctx.api.claim(channelId, targets)
  if (
    !otherMembersCovered(
      state,
      claimed.map((c) => c.deviceId),
      device.deviceId,
    )
  )
    return 'ineligible'

  const groupId = crypto.getRandomValues(new Uint8Array(GROUP_ID_BYTES))
  const { group, pending } = await createGroup(device, {
    groupId,
    members: active,
    keyPackages: claimed.map((c) => fromB64(c.keyPackage)),
  })
  const welcomes = pending.welcomes.map((w) => ({
    deviceId: w.deviceId,
    welcome: toB64(w.welcome),
  }))
  try {
    await ctx.api.createGroup(channelId, toB64(groupId), toB64(pending.commit), welcomes)
  } catch (e) {
    const code = e2eeErrorCode(e)
    if (code === 'E2EE_GROUP_EXISTS') return 'exists'
    if (code === 'E2EE_NOT_ELIGIBLE') return 'ineligible'
    throw e
  }
  group.confirmCommit(pending)
  await ctx.store.saveGroup(channelId, group)
  return 'created'
}

/** Kendimiz dışındaki her üyenin en az bir cihazı için KeyPackage alındı mı. */
function otherMembersCovered(
  state: E2eeChannelState,
  claimedIds: string[],
  ownDeviceId: string | null,
): boolean {
  const got = new Set(claimedIds)
  return state.members.every((m) => {
    const mine = m.devices.some((d) => d.deviceId === ownDeviceId)
    return mine || m.devices.some((d) => got.has(d.deviceId))
  })
}
