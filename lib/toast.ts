export type ToastVariant = 'success' | 'error' | 'info'

export type ToastAction = { label: string; onClick: () => void }

export function toast(message: string, variant: ToastVariant = 'info', action?: ToastAction) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, variant, action } }))
}

toast.success = (message: string) => toast(message, 'success')
toast.error = (message: string) => toast(message, 'error')
toast.info = (message: string) => toast(message, 'info')
/** A success toast with an Undo button (Stage 14a v2: Delete). It stays a little longer. */
toast.undo = (message: string, onUndo: () => void) => toast(message, 'success', { label: 'Undo', onClick: onUndo })
