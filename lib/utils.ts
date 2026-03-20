import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date in British format (DD/MM/YYYY)
 * Per CLAUDE.md design rules: British date format required
 */
export function formatDateGB(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Format a date and time in British format (DD/MM/YYYY HH:MM)
 * Only shows time if the date has a non-midnight time component
 */
export function formatDateTimeGB(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
  if (!hasTime) return formatDateGB(d)
  const datePart = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timePart = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${datePart} ${timePart}`
}

/**
 * Format a date in short British format (e.g., "30 Jan 2026")
 */
export function formatDateShortGB(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
