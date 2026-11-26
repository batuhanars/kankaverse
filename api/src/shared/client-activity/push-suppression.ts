// C76 §2.3 — aktif masaüstü/web varken telefona push gidip gitmeyeceğinin TEK kaynağı.
// Yeni bir push türü (data.type) eklenince buraya da eklenmeli: listede olmayan tür bastırılmaz
// (eski davranış korunur) ve sunucu bunu bir kez uyarı olarak loglar ki karar görünür olsun.

/** Aktif masaüstü/web varken alıcıya GÖNDERİLMEZ (zil kaydı yine yazılır). */
export const PUSH_SUPPRESSED_WHEN_DESKTOP_ACTIVE = [
  'DM_MESSAGE',
  'CHANNEL_MESSAGE',
  'MENTION',
  'REACTION',
  'MESSAGE_REQUEST',
  'FRIEND_REQUEST',
  'FRIEND_ACCEPT',
  'GUILD_INVITE',
  'EVENT_CREATED',
  'AI_VIDEO_READY',
  'AI_VIDEO_FAILED',
] as const;

/** Her cihazda çalmaya devam eder: aramalar ve güvenlik bildirimi. */
export const PUSH_ALWAYS_DELIVERED = [
  'incoming_call', // 1-1 arama zili
  'E2EE_TRANSFER', // güvenlik bildirimi, kapatılamaz
] as const;

const SUPPRESSED = new Set<string>(PUSH_SUPPRESSED_WHEN_DESKTOP_ACTIVE);
const ALWAYS = new Set<string>(PUSH_ALWAYS_DELIVERED);

export type PushSuppressionDecision = 'suppress' | 'deliver' | 'unclassified';

export function classifyPushType(type: string | undefined): PushSuppressionDecision {
  if (!type) return 'unclassified';
  if (ALWAYS.has(type)) return 'deliver';
  if (SUPPRESSED.has(type)) return 'suppress';
  return 'unclassified';
}
