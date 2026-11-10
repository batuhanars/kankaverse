// Başkalarının commit'lerini sırayla işler (geride kalmışsak eksikleri sunucudan çeker).
import {
  DeviceKeyMismatchError,
  SenderMismatchError,
  UnknownDeviceError,
  type Group,
} from '@kankaverse/e2ee-core'
import type { E2eeCommitRow } from './ports'
import { fromB64 } from './b64'
import type { E2eeContext } from './context'
import { devicesOf, type ChannelDevices } from './registry'

/** Çalışan işlemin elindeki kanal cihaz listesi; conflict/yenileme sonrası tazelenir. */
export interface ChannelView {
  devices: ChannelDevices
}

export const isUntrusted = (e: unknown): boolean =>
  e instanceof UnknownDeviceError ||
  e instanceof DeviceKeyMismatchError ||
  e instanceof SenderMismatchError

export async function refreshView(ctx: E2eeContext, channelId: string, view: ChannelView) {
  view.devices = devicesOf((await ctx.api.channelState(channelId)).data)
}

/**
 * Güvenlik kapısı: tanınmayan cihaz / anahtar uyuşmazlığı / gönderen uyuşmazlığı görülürse kullanıcıya
 * uyarı çıkar ve hatayı yukarı at. Mesajlaşma durur, "sessizce devam" yok (§3.3).
 */
export async function guardUntrusted<T>(
  ctx: E2eeContext,
  channelId: string,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task()
  } catch (e) {
    if (isUntrusted(e)) ctx.warn(channelId, 'unknown-device')
    throw e
  }
}

/** Tek commit: tanınmayan cihaz hatasında kayıt listesini bir kez tazeleyip yeniden dener (yeni kayıt olabilir). */
async function applyRow(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  row: E2eeCommitRow,
  view: ChannelView,
) {
  const commit = fromB64(row.commit)
  try {
    return await group.processCommit(commit, view.devices.registered)
  } catch (e) {
    if (!isUntrusted(e)) throw e
    await refreshView(ctx, channelId, view)
    return group.processCommit(commit, view.devices.registered)
  }
}

/** Grubu sunucunun epoch'una getirir; her adım sonrası durum diske yazılır. */
export async function catchUp(
  ctx: E2eeContext,
  channelId: string,
  group: Group,
  view: ChannelView,
) {
  while (group.isActive) {
    const { data } = await ctx.api.commits(channelId, group.epoch)
    // İlk satır tam bizim epoch'umuz olmalı; boşluk varsa (geçmiş eksik) uydurma yapma, dur.
    if (data.length === 0 || data[0].epoch !== group.epoch) return
    for (const row of data) {
      if (row.epoch !== group.epoch) break
      const { removed } = await applyRow(ctx, channelId, group, row, view)
      await ctx.store.saveGroup(channelId, group)
      if (removed) return ctx.warn(channelId, 'removed')
    }
  }
}
