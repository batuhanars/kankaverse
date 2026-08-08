import { useState } from 'react';
import { Alert } from 'react-native';
import { channelsApi, ChannelType, type ChannelSummaryDto } from '@/api/channels';
import { voiceApi } from '@/api/voice';
import { extractErrorMessage } from '@/api/errors';
import { ConfirmDialog } from '../ConfirmDialog';
import { SelectSheet } from '../guild/SelectSheet';
import { ParticipantModerationSheet } from './ParticipantModerationSheet';
import { t } from '@/i18n';

export interface ModerationParticipant {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

interface Props {
  /** Bağlı olduğumuz ses kanalı (`call.tsx`'in route parametresi) — hedef katılımcı bu kanalda. */
  channelId: string;
  /** `useVoiceStore` `guildId` — yalnız guild araması bu Host'u açar, ama tip yine de nullable
   *  (çağıran taraf `null` iken zaten `participant`'ı hiç set etmiyor). */
  guildId: string | null;
  /** Dokunulan katılımcı; `null` ise panel kapalı (`VoiceChannelSheet`/`ChannelMenuHost` ile aynı desen). */
  participant: ModerationParticipant | null;
  /** MUTE_MEMBERS — `call.tsx`teki `useGuildPermission` sonucu, burada TEKRAR sorgulanmaz. */
  canMute: boolean;
  /** MOVE_MEMBERS — aynı gerekçe. */
  canMove: boolean;
  /** Sözleşme §3 — `serverMutedUserIds`ten `call.tsx`in RENDER ANINDA türettiği değer. */
  isServerMuted: boolean;
  /** Hedefin kamerası şu an gerçekten yayınlıyor mu (`remoteCameraPublications`ten türetilir). */
  isBroadcasting: boolean;
  onClose: () => void;
}

/** Ana panel mi, yoksa üstüne değil YERİNE açılan "Taşı" hedef listesi mi görünüyor (`DmMoreHost` deseni). */
type SubSheet = 'none' | 'move';

/**
 * Sprint M4h — moderasyon panelinin YERLEŞİMİ + gerçek eylem mantığı (uç çağırma, hata gösterimi).
 * `call.tsx` yalnız "hangi katılımcıya dokunuldu" + yetki/durum bayraklarını tutar; bu Host onu
 * alıp `ParticipantModerationSheet`e (saf sunum) besler — `DmMoreHost`/`DmMoreSheet` ayrımının aynısı.
 *
 * 🔴 Sözleşme §3 (D53 tuzağı, web'de bugün yaşandı) — her eylem fonksiyonu (`handleToggleMute` vb.)
 * ihtiyaç duyduğu değeri (`isServerMuted`, `participant.userId`) İLK SATIRDA yerel bir sabite alır,
 * panel ANCAK ONDAN SONRA kapatılır. Web'deki kusur menü kapandıktan SONRA duruma bakmaktan
 * doğuyordu (bayrak sıfırlanmış oluyordu, etiket doğru ama eylem hep "sustur"a gidiyordu); burada
 * okuma sırası tersine çevrilemez çünkü `participant`/`isServerMuted` fonksiyon çağrıldığı anda
 * zaten birer PROP (üst bileşenin o anki render'ı) — `onClose()`/`closeAll()` çağrısı bu yerel
 * sabitleri geriye dönük değiştirmez.
 */
export function ParticipantModerationHost({
  channelId,
  guildId,
  participant,
  canMute,
  canMove,
  isServerMuted,
  isBroadcasting,
  onClose,
}: Props) {
  const [subSheet, setSubSheet] = useState<SubSheet>('none');
  const [moveTargets, setMoveTargets] = useState<ChannelSummaryDto[]>([]);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  function closeAll() {
    setSubSheet('none');
    setDisconnectConfirm(false);
    onClose();
  }

  async function handleToggleMute() {
    if (!participant) return;
    const wasMuted = isServerMuted;
    const userId = participant.userId;
    closeAll();
    try {
      if (wasMuted) await voiceApi.unmute(channelId, userId);
      else await voiceApi.mute(channelId, userId);
    } catch (e) {
      // 🔴 Sessiz başarısızlık yasak (kontrat §5) — sunucunun Türkçe mesajı gösterilir.
      Alert.alert(extractErrorMessage(e));
    }
  }

  async function handleStopBroadcast() {
    if (!participant) return;
    const userId = participant.userId;
    closeAll();
    try {
      await voiceApi.stopBroadcast(channelId, userId);
    } catch (e) {
      Alert.alert(extractErrorMessage(e));
    }
  }

  async function openMove() {
    if (!guildId) return;
    setSubSheet('move');
    try {
      const channels = await channelsApi.listByGuild(guildId);
      // Sözleşme §4 — hedef listesi aynı ortamın DİĞER ses kanalları (mevcut kanal hariç).
      setMoveTargets(
        channels.filter((c) => c.type === ChannelType.GUILD_VOICE && c.id !== channelId),
      );
    } catch (e) {
      Alert.alert(extractErrorMessage(e));
      setSubSheet('none');
    }
  }

  async function handleMoveTo(targetChannelId: string) {
    if (!participant) return;
    const userId = participant.userId;
    closeAll();
    try {
      await voiceApi.move(channelId, userId, targetChannelId);
    } catch (e) {
      // Sözleşme §4 — dolu kanal / yaş kapısı / izin: sunucunun Türkçe mesajı olduğu gibi gösterilir.
      Alert.alert(extractErrorMessage(e));
    }
  }

  async function handleDisconnect() {
    if (!participant) return;
    const userId = participant.userId;
    setDisconnectConfirm(false);
    onClose();
    try {
      await voiceApi.disconnectParticipant(channelId, userId);
    } catch (e) {
      Alert.alert(extractErrorMessage(e));
    }
  }

  return (
    <>
      <ParticipantModerationSheet
        visible={!!participant && subSheet === 'none' && !disconnectConfirm}
        username={participant?.username ?? ''}
        avatarUrl={participant?.avatarUrl ?? null}
        canMute={canMute}
        canMove={canMove}
        isServerMuted={isServerMuted}
        isBroadcasting={isBroadcasting}
        onClose={closeAll}
        onToggleMute={handleToggleMute}
        onStopBroadcast={handleStopBroadcast}
        onMove={openMove}
        onDisconnect={() => setDisconnectConfirm(true)}
      />

      {subSheet === 'move' && (
        <SelectSheet
          title={t('voice.moveTo')}
          options={moveTargets.map((c) => ({
            value: c.id,
            label: c.name ?? '',
            icon: 'volume-medium-outline' as const,
          }))}
          selected=""
          onSelect={handleMoveTo}
          onClose={() => setSubSheet('none')}
        />
      )}

      {/* Sözleşme §5 — odadan çıkarma yıkıcı, mevcut `ConfirmDialog` ile onay ister. */}
      {disconnectConfirm && participant && (
        <ConfirmDialog
          message={t('voice.disconnectConfirm', { username: participant.username })}
          confirmLabel={t('voice.disconnectUser')}
          onConfirm={handleDisconnect}
          onCancel={() => setDisconnectConfirm(false)}
        />
      )}
    </>
  );
}
