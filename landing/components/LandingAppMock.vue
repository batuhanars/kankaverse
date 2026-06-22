<script setup lang="ts">
// Hero görsel maketi — gerçek üründen ekran görüntüsü çıkana dek temsili app görünümü.
// Tamamen CSS/HTML (keskin, responsive, token-temalı). Dekoratif → aria-hidden.
</script>

<template>
  <div class="mock" aria-hidden="true">
    <!-- Sunucu rayı -->
    <div class="rail">
      <div class="hex active">kv</div>
      <div class="hex">VK</div>
      <div class="hex">EA</div>
      <div class="hex add">+</div>
    </div>

    <!-- Kanal paneli -->
    <div class="side">
      <div class="side-head">Valorant Kankalar</div>
      <div class="side-body">
        <div class="cat">Metin Kanalları</div>
        <div class="ch"><span class="hash">#</span> sohbet</div>
        <div class="ch active"><span class="hash">#</span> maç-arama</div>
        <div class="ch"><span class="hash">#</span> klipler</div>
      </div>
      <div class="usercard">
        <span class="avatar sm online">BA</span>
        <span class="uname">batuhan</span>
      </div>
    </div>

    <!-- Mesaj alanı -->
    <div class="main">
      <div class="main-head"><span class="hash">#</span> maç-arama</div>
      <div class="msgs">
        <div class="msg">
          <span class="avatar">EK</span>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="author">emre</span>
              <span class="time">bugün 21.14</span>
            </div>
            <div class="msg-text">2 kişi lazım, gece turnuvası için kadro kuruyoruz</div>
          </div>
        </div>
        <div class="msg">
          <span class="avatar">BA</span>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="author">batuhan</span>
              <span class="badge">Doğrulanmış</span>
              <span class="time">bugün 21.15</span>
            </div>
            <div class="msg-text">ben varım kanka, sesli kanala geçelim mi</div>
          </div>
        </div>
      </div>
      <div class="composer"><span>#maç-arama kanalına mesaj yaz</span></div>
    </div>
  </div>
</template>

<style scoped>
.mock {
  display: flex;
  height: 400px;
  border-radius: var(--kv-radius-lg);
  border: 1px solid var(--kv-border-strong);
  background: var(--kv-bg-content);
  overflow: hidden;
  font-size: 13px;
}

/* ── Ray ── */
.rail {
  width: 64px;
  flex-shrink: 0;
  background: var(--kv-bg-rail);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 14px 0;
  border-right: 1px solid var(--kv-border-subtle);
}
.hex {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--kv-text-secondary);
  background: var(--kv-bg-elevated);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.hex.active {
  color: #fff;
  background: linear-gradient(160deg, var(--kv-accent-400), var(--kv-accent-600));
}
.hex.add {
  color: var(--kv-accent-500);
  font-size: 24px;
  font-weight: 400;
  line-height: 1;
}

/* ── Kanal paneli ── */
.side {
  width: 168px;
  flex-shrink: 0;
  background: var(--kv-bg-sidebar);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--kv-border-subtle);
}
.side-head {
  padding: 0 16px;
  height: 52px;
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--kv-text-primary);
  border-bottom: 1px solid var(--kv-border-subtle);
}
.side-body {
  flex: 1;
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cat {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--kv-text-muted);
  padding: 0 8px 4px;
}
.ch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-radius: var(--kv-radius-sm);
  color: var(--kv-text-secondary);
}
.ch.active {
  background: var(--kv-bg-elevated);
  color: var(--kv-accent-400);
  box-shadow: inset 2px 0 0 var(--kv-accent-500);
}
.hash {
  color: var(--kv-text-muted);
  font-weight: 600;
}
.ch.active .hash {
  color: var(--kv-accent-400);
}
.usercard {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px;
  padding: 8px;
  border-radius: var(--kv-radius-md);
  background: var(--kv-bg-elevated);
}
.uname {
  font-size: 13px;
  font-weight: 600;
  color: var(--kv-text-primary);
}

/* ── Avatar ── */
.avatar {
  position: relative;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--kv-text-primary);
  background: var(--kv-bg-elevated);
}
.avatar.sm {
  width: 28px;
  height: 28px;
  font-size: 10px;
  background: var(--kv-bg-sidebar);
}
.avatar.online::after {
  content: '';
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--kv-online);
  border: 2px solid var(--kv-bg-elevated);
}

/* ── Mesaj alanı ── */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.main-head {
  height: 52px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  font-size: 14px;
  font-weight: 700;
  color: var(--kv-text-primary);
  border-bottom: 1px solid var(--kv-border-subtle);
}
.msgs {
  flex: 1;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: hidden;
}
.msg {
  display: flex;
  gap: 12px;
}
.msg-body {
  min-width: 0;
}
.msg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}
.author {
  font-size: 14px;
  font-weight: 600;
  color: var(--kv-text-primary);
}
.badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--kv-accent-400);
  background: var(--kv-accent-subtle);
  padding: 2px 6px;
  border-radius: var(--kv-radius-sm);
}
.time {
  font-size: 11px;
  color: var(--kv-text-muted);
}
.msg-text {
  font-size: 14px;
  color: var(--kv-text-body);
}
.composer {
  margin: 0 16px 16px;
  padding: 12px 16px;
  border-radius: var(--kv-radius-md);
  background: var(--kv-bg-elevated);
  color: var(--kv-text-muted);
  font-size: 13px;
}
</style>
