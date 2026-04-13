<script setup lang="ts">
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { ref, watch } from 'vue'

dayjs.extend(customParseFormat)

const FMT = 'YYYY-MM-DD HH:mm:ss'
const API_FMT = 'YYYY-MM-DDTHH:mm:ss'

const props = withDefaults(
  defineProps<{
    start: string
    end: string
    startPlaceholder?: string
    endPlaceholder?: string
  }>(),
  {
    start: '',
    end: '',
    startPlaceholder: '开始日期',
    endPlaceholder: '结束日期'
  }
)

const emit = defineEmits<{
  'update:start': [v: string]
  'update:end': [v: string]
}>()

const pickerVal = ref<[Dayjs, Dayjs] | null>(null)

function parseToDayjs(s: string): Dayjs | null {
  const t = s.trim()
  if (!t) return null
  const a = dayjs(t, API_FMT, true)
  if (a.isValid()) return a
  const b = dayjs(t.replace('T', ' '), FMT, true)
  if (b.isValid()) return b
  const c = dayjs(t)
  return c.isValid() ? c : null
}

function syncFromProps() {
  const { start, end } = props
  if (!start?.trim() || !end?.trim()) {
    pickerVal.value = null
    return
  }
  const a = parseToDayjs(start)
  const b = parseToDayjs(end)
  if (!a || !b) {
    pickerVal.value = null
    return
  }
  const cur = pickerVal.value
  if (cur && cur[0].valueOf() === a.valueOf() && cur[1].valueOf() === b.valueOf()) return
  pickerVal.value = [a, b]
}

watch(() => [props.start, props.end], syncFromProps, { immediate: true })

watch(
  pickerVal,
  (v) => {
    if (!v || !v[0] || !v[1]) {
      if (props.start || props.end) {
        emit('update:start', '')
        emit('update:end', '')
      }
      return
    }
    const s = v[0].format(API_FMT)
    const e = v[1].format(API_FMT)
    if (s !== props.start) emit('update:start', s)
    if (e !== props.end) emit('update:end', e)
  },
  { deep: true }
)

function popupContainer(trigger: HTMLElement) {
  return (trigger.closest('.admin-layout') as HTMLElement | null) ?? document.body
}
</script>

<template>
  <a-range-picker
    v-model:value="pickerVal"
    class="admin-datetime-range-picker"
    show-time
    :format="FMT"
    :placeholder="[startPlaceholder, endPlaceholder]"
    allow-clear
    :get-popup-container="popupContainer"
  />
</template>
