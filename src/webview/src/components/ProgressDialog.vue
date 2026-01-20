<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="isVisible" class="progress-overlay" @click.self="hide">
        <div class="progress-container" @click.stop>
          <div class="progress-header">
            <h3 class="progress-title">Session Progress</h3>
            <button class="close-button" @click="hide" aria-label="Close">
              <i class="codicon codicon-close" />
            </button>
          </div>

          <div class="progress-body">
            <div class="meta">
              <div class="meta-row">
                <span class="meta-key">Status</span>
                <span class="meta-value">{{ progress?.running ? 'running' : 'idle' }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-key">Agent</span>
                <span class="meta-value">{{ progress?.agent || '-' }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-key">Model</span>
                <span class="meta-value">{{ progress?.model || '-' }}</span>
              </div>
              <div class="meta-row">
                <span class="meta-key">Session</span>
                <span class="meta-value">{{ progress?.sessionId || '-' }}</span>
              </div>
            </div>

            <div class="events">
              <div class="events-title">Recent events</div>
              <div v-if="!progress || progress.lastEvents.length === 0" class="events-empty">
                No recent events
              </div>
              <div v-else class="events-list">
                <div v-for="(e, idx) in progress.lastEvents" :key="idx" class="event-row">
                  <span class="event-type">{{ e.type }}</span>
                  <span class="event-summary">{{ e.summary }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="progress-actions">
            <button class="btn" @click="hide">Close</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface ProgressSnapshot {
  channelId?: string;
  sessionId?: string;
  running: boolean;
  agent?: string;
  model?: string;
  lastEvents: Array<{ ts: number; type: string; summary: string }>;
}

const props = defineProps<{ progress?: ProgressSnapshot }>();

const isVisible = ref(false);

function show() {
  isVisible.value = true;
}

function hide() {
  isVisible.value = false;
}

defineExpose({ show, hide });
</script>

<style scoped>
.progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.progress-container {
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 12px;
  border-bottom: 1px solid var(--vscode-editorGroup-border);
}

.progress-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.close-button {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--vscode-foreground);
  opacity: 0.8;
}

.close-button:hover {
  opacity: 1;
}

.progress-body {
  padding: 12px;
  overflow: auto;
}

.meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 12px;
}

.meta-row {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.meta-key {
  opacity: 0.7;
  min-width: 56px;
}

.meta-value {
  font-family: var(--vscode-editor-font-family);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.events-title {
  font-size: 12px;
  font-weight: 600;
  margin: 8px 0;
}

.events-empty {
  opacity: 0.7;
  font-size: 12px;
}

.events-list {
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  overflow: hidden;
}

.event-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 8px;
  padding: 8px 10px;
  border-top: 1px solid var(--vscode-editorGroup-border);
}

.event-row:first-child {
  border-top: none;
}

.event-type {
  font-family: var(--vscode-editor-font-family);
  opacity: 0.8;
}

.event-summary {
  font-family: var(--vscode-editor-font-family);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-actions {
  padding: 10px 12px;
  border-top: 1px solid var(--vscode-editorGroup-border);
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--vscode-button-border, transparent);
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
}

.btn:hover {
  background: var(--vscode-button-hoverBackground);
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.15s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
