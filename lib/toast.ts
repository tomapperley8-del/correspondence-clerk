export type ToastVariant = 'success' | 'error' | 'info'

export function toast(message: string, variant: ToastVariant = 'info') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, variant } }))
}

toast.success = (message: string) => toast(message, 'success')
toast.error = (message: string) => toast(message, 'error')
toast.info = (message: string) => toast(message, 'info')
