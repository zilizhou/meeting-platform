import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 与侧栏断点一致：默认 query 为 max-width: 1023px 时 matches=true */
export function useMediaQuery(query: string) {
  const matches = ref(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  let mql: MediaQueryList | null = null
  const sync = () => {
    matches.value = !!mql?.matches
  }

  onMounted(() => {
    mql = window.matchMedia(query)
    sync()
    mql.addEventListener('change', sync)
  })

  onBeforeUnmount(() => {
    mql?.removeEventListener('change', sync)
    mql = null
  })

  return matches
}
