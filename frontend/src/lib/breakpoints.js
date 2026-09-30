import { useSyncExternalStore } from 'react'

// The only viewport bands the product uses. CSS mirrors the same numbers:
//   phone   <= 767px  (bottom navigation, sheets, list -> detail)
//   tablet  768-1023  (collapsed sidebar by default)
//   desktop >= 1024   (expanded sidebar, popovers, split views)
export const BREAKPOINTS = { phone: 767, tablet: 1023 }

export const MEDIA = {
  phone: `(max-width: ${BREAKPOINTS.phone}px)`,
  tablet: `(min-width: ${BREAKPOINTS.phone + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`,
  compact: `(max-width: ${BREAKPOINTS.tablet}px)`,
  desktop: `(min-width: ${BREAKPOINTS.tablet + 1}px)`,
  finePointer: '(hover: hover) and (pointer: fine)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
}

const subscriptions = new Map()

function subscribeTo(query) {
  if (!subscriptions.has(query)) {
    subscriptions.set(query, onChange => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener?.('change', onChange)
      return () => list.removeEventListener?.('change', onChange)
    })
  }
  return subscriptions.get(query)
}

export function mediaMatches(query) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

// Environments without matchMedia (tests, old browsers) behave as desktop with a fine pointer.
export function useMediaQuery(query) {
  return useSyncExternalStore(subscribeTo(query), () => mediaMatches(query), () => false)
}

export const useIsPhone = () => useMediaQuery(MEDIA.phone)
export const useIsCompact = () => useMediaQuery(MEDIA.compact)
