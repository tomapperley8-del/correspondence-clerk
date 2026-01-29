import { useEffect, useRef, useCallback } from 'react'

interface UseModalKeyboardOptions {
  /** Whether to auto-focus the first focusable element when modal opens. Default: true */
  autoFocus?: boolean
}

/**
 * Hook for modal keyboard support: Escape to close, focus trapping, focus return.
 * Attach the returned ref to the modal container element.
 */
export function useModalKeyboard(
  isOpen: boolean,
  onClose: () => void,
  options: UseModalKeyboardOptions = {}
) {
  const { autoFocus = true } = options
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const hasAutoFocused = useRef(false)

  // Capture the trigger element when the modal opens
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement
    }
  }, [isOpen])

  // Handle Escape key and focus trapping
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Focus trapping: Tab cycles within modal
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )

        if (focusableElements.length === 0) return

        const first = focusableElements[0]
        const last = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    },
    [isOpen, onClose]
  )

  // Reset auto-focus tracking when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasAutoFocused.current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)

      // Auto-focus first focusable element in modal (only once per open)
      if (autoFocus && modalRef.current && !hasAutoFocused.current) {
        const firstFocusable = modalRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (firstFocusable) {
          // Delay to allow modal to render
          requestAnimationFrame(() => {
            firstFocusable.focus()
            hasAutoFocused.current = true
          })
        }
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      // Return focus to trigger element when modal closes
      if (!isOpen && triggerRef.current) {
        triggerRef.current.focus()
        triggerRef.current = null
      }
    }
  }, [isOpen, handleKeyDown, autoFocus])

  return modalRef
}
