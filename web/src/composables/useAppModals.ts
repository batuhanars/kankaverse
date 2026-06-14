import { ref } from 'vue'

/**
 * Uygulama-geneli modal durumu (singleton). AppShell modalları render eder;
 * herhangi bir view/sidebar açıcıları çağırır. Cross-view modal için event yerine paylaşılan state.
 */
type ServerModalStep = 'choose' | 'create' | 'join'

const showServerModal = ref(false)
const serverModalStep = ref<ServerModalStep>('choose')
const showAddFriendModal = ref(false)

export function useAppModals() {
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
    openServerModal,
    closeServerModal,
    openAddFriend,
    closeAddFriend,
  }
}
