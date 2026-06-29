<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import EmergencyFeedbackModal from '@/components/shared/EmergencyFeedbackModal.vue'
import EmergencyAlertBanner from '@/components/shared/EmergencyAlertBanner.vue'
</script>

<template>
  <RouterView />
  <ToastContainer />
  <!-- A4: mağdur geri-bildirim modalı global katmanda (ses çubuğu unmount olsa da yaşar) -->
  <EmergencyFeedbackModal />
  <!-- A4 alıcı tarafı: platform güvenliğine gelen acil alarm bantları (global) -->
  <EmergencyAlertBanner />
</template>
