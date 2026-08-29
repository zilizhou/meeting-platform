import { computed, ref } from 'vue'

export type FontScale = 'sm' | 'md' | 'lg' | 'xl'

const STORAGE_KEY = 'qfnu-font-scale'

export const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
  { value: 'xl', label: '特大' },
]

const ZOOM: Record<FontScale, string> = {
  sm: '0.92',
  md: '1',
  lg: '1.18',
  xl: '1.36',
}

function isFontScale(v: string | null): v is FontScale {
  return v === 'sm' || v === 'md' || v === 'lg' || v === 'xl'
}

function readStored(): FontScale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isFontScale(v)) return v
  } catch {
    /* ignore */
  }
  return 'md'
}

function applyDom(scale: FontScale) {
  const root = document.documentElement
  root.dataset.fontScale = scale
  root.style.setProperty('--font-zoom', ZOOM[scale])
}

const scale = ref<FontScale>(readStored())

/** 尽早调用，避免首屏闪一下再变大 */
export function initFontScale() {
  const next = readStored()
  scale.value = next
  applyDom(next)
}

export function useFontScale() {
  const label = computed(
    () => FONT_SCALE_OPTIONS.find((o) => o.value === scale.value)?.label ?? '中',
  )

  function setScale(next: FontScale) {
    scale.value = next
    applyDom(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  return { scale, label, setScale, options: FONT_SCALE_OPTIONS }
}
