<script setup>
// One collapsible Help section: an accessible heading + toggle button wrapping a
// slotted body. Keeps the chevron and ARIA wiring in a single place instead of
// repeating it for every section.
const props = defineProps({
  title: { type: String, required: true },
  open: { type: Boolean, default: false },
  accent: { type: Boolean, default: false },
})
defineEmits(['toggle'])

// Deterministic, unique-per-title id to link the button to its body for a11y.
const bodyId =
  'acc-' +
  props.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
</script>

<template>
  <section class="acc" :class="{ open, accent }">
    <h2 class="acc-head">
      <button
        class="acc-btn"
        :aria-expanded="open"
        :aria-controls="bodyId"
        @click="$emit('toggle')"
      >
        <span>{{ title }}</span>
        <svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </h2>
    <div v-show="open" :id="bodyId" class="acc-body" role="region">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.acc {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.acc-head {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}
.acc-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  padding: 15px 2px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.acc.accent .acc-btn {
  color: #9ab4ff;
}
.chev {
  flex: none;
  opacity: 0.6;
  transition: transform 0.2s ease;
}
.acc.open .chev {
  transform: rotate(180deg);
}
.acc-body {
  padding: 0 2px 16px;
}
</style>
