/** C62: gruptan ayrılmış/çıkarılmış sohbet mi. Motor orada Welcome/senkron/açma ağ çağrısı yapmaz. */
export function isDepartedGroup(
  channels: readonly { id: string; type: string; departed?: unknown }[],
  channelId: string,
): boolean {
  const c = channels.find((x) => x.id === channelId);
  return c?.type === 'GROUP_DM' && !!c.departed;
}
