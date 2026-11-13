// İlk şifreli mesajda grubu kurma (E1 §2.4): claim → createGroup → POST group → confirmCommit.
import { createGroup } from '@kankaverse/e2ee-core'
import { e2eeErrorCode } from './errors'
import { fromB64, toB64 } from './b64'
import type { E2eeContext } from './context'
import type { E2eeChannelState } from './ports'
import { observeLeaves } from './deviceNotices'
import { MAX_ADD_PER_COMMIT } from './reconcile'
import { devicesOf } from './registry'

export type CreateOutcome = 'created' | 'exists' | 'ineligible'

const GROUP_ID_BYTES = 32

const hasActiveDevice = (m: E2eeChannelState['members'][number]): boolean => m.devices.some((d) => !d.revokedAt)

/**
 * Uygunluk (E2 §2.2): 1-1'de (2 üye) iki üyenin de, grupta (3+) GÖNDEREN DAHİL en az iki üyenin etkin cihazı var.
 * Cihazsız üye grubu engellemez: cihaz kaydedince devices-changed ile eklenir, öncesini görmez (§0).
 */
export function enoughMembersHaveDevice(state: E2eeChannelState): boolean {
  const withDevice = state.members.filter(hasActiveDevice).length
  return state.members.length <= 2 ? withDevice > 0 && withDevice === state.members.length : withDevice >= 2
}

/** Hedef cihazlar üyeler arasında sırayla dizilir: tek claim 20 cihazı geçemez, her üyenin ilk cihazı önce girer. */
function claimTargets(state: E2eeChannelState, ownDeviceId: string | null): string[] {
  const lists = state.members.map((m) =>
    m.devices.filter((d) => !d.revokedAt && d.deviceId !== ownDeviceId).map((d) => d.deviceId),
  )
  const out: string[] = []
  for (let i = 0; out.length < MAX_ADD_PER_COMMIT && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < MAX_ADD_PER_COMMIT) out.push(l[i])
  }
  return out
}

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
  if (!enoughMembersHaveDevice(state)) return 'ineligible'
  const device = await ctx.getDevice()
  const devices = devicesOf(state)
  const { active } = devices
  let claimed
  try {
    claimed = (await ctx.api.claim(channelId, claimTargets(state, device.deviceId))).data
  } catch (e) {
    // İzin listesi dönemi: listede olmayan üye varsa sunucu claim'de 422 atar; grup kurulmaz, düz yola düşülür.
    if (e2eeErrorCode(e) === 'E2EE_NOT_ELIGIBLE') return 'ineligible'
    throw e
  }
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
  await ctx.store.saveJoinedAt(channelId, Date.now())
  await observeLeaves(ctx, channelId, group, devices)
  return 'created'
}

/**
 * KeyPackage'ı alınan cihazlar yeterli mi: 1-1'de karşı tarafın, grupta kendimiz dışında en az bir üyenin
 * cihazı kapsandı. Kapsanamayan üye sonradan reconcile ile eklenir (o cihaz paket yükleyince).
 */
function otherMembersCovered(
  state: E2eeChannelState,
  claimedIds: string[],
  ownDeviceId: string | null,
): boolean {
  const got = new Set(claimedIds)
  const others = state.members.filter((m) => !m.devices.some((d) => d.deviceId === ownDeviceId))
  const covered = others.filter((m) => m.devices.some((d) => got.has(d.deviceId)))
  return state.members.length <= 2 ? covered.length === others.length : covered.length >= 1
}
