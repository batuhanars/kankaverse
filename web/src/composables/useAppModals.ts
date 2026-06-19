import { ref } from 'vue'

/**
 * Uygulama-geneli modal durumu (singleton). AppShell modalları render eder;
 * herhangi bir view/sidebar açıcıları çağırır. Cross-view modal için event yerine paylaşılan state.
 */
type ServerModalStep = 'choose' | 'create' | 'join'

const showServerModal = ref(false)
const serverModalStep = ref<ServerModalStep>('choose')
const showAddFriendModal = ref(false)
// Birleşik kullanıcı ayarları modalı — UserCard + UserCardPopover (kendi profili) açar.
const showUserSettings = ref(false)
const userSettingsSection = ref<string | undefined>(undefined)

export function useAppModals() {
  function openUserSettings(section?: string) {
    userSettingsSection.value = section
    showUserSettings.value = true
  }
  function closeUserSettings() {
    showUserSettings.value = false
  }
  function openServerModal(step: ServerModalStep) {
    serverModalStep.value = step
    showServerModal.value = true
  }
  function closeServerModal() {
    showServerModal.value = false
  }
  function openAddFriend() {
    showAddFriendModal.value = true
  }
  function closeAddFriend() {
    showAddFriendModal.value = false
  }
  return {
    showServerModal,
    serverModalStep,
    showAddFriendModal,
    showUserSettings,
    userSettingsSection,
    openServerModal,
    closeServerModal,
    openAddFriend,
    closeAddFriend,
    openUserSettings,
    closeUserSettings,
  }
}
