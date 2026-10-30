'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * A thin olive line along the top of the window, shown as soon
 * as a link to another page in the app is clicked and finished when the new
 * page arrives. Purely visual (screen readers hear the page skeleton's
 * "Loading …" instead).
 */
export function NavProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const timers = useRef<number[]>([])
  const loading = useRef(false)

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  // Start on a click on an internal link that will change the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      clear()
      loading.current = true
      setState('loading')
      // Safety net: never leave the line showing if the navigation is abandoned.
      timers.current.push(window.setTimeout(() => { loading.current = false; setState('idle') }, 20000))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // The address changes as soon as a loading screen shows, so the line runs on
  // until no loading screen (aria-busy) is left, then runs to the end and fades.
  useEffect(() => {
    if (!loading.current) return
    const finish = () => {
      if (document.querySelector('main [aria-busy="true"]')) return false
      observer.disconnect()
      loading.current = false
      clear()
      setState('done')
      timers.current.push(window.setTimeout(() => setState('idle'), 350))
      return true
    }
    const observer = new MutationObserver(() => { finish() })
    if (!finish()) observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] })
    return () => observer.disconnect()
  }, [pathname, searchParams])

  useEffect(() => clear, [])

  if (state === 'idle') return null
  return (
    <div aria-hidden="true" className="cc-navprogress" data-state={state}>
      <div className="cc-navprogress-bar" />
    </div>
  )
}
