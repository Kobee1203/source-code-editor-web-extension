<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useWorkbenchBootstrap } from '@/composables/useWorkbenchBootstrap';

const workbenchHost = ref<HTMLDivElement | null>(null);
const { initWorkbench, disposeWorkbench } = useWorkbenchBootstrap();

onMounted(() => {
  if (workbenchHost.value) {
    void initWorkbench(workbenchHost.value);
  }
});

onBeforeUnmount(() => {
  disposeWorkbench();
});
</script>

<template>
  <main class="workbench-shell" data-testid="workbench-shell">
    <div
      id="workbenchHost"
      ref="workbenchHost"
      class="workbench-container"
      data-testid="workbench-container"
      aria-label="Native VS Code Workbench"
    ></div>
  </main>
</template>

<style scoped>
.workbench-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  padding: 0;
  margin: 0;
  overflow: hidden;
  background-color: #1e1e1e;
}

.workbench-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  overflow: hidden;
}
</style>
