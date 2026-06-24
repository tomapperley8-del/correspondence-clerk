export const CATEGORY_COLORS: Record<string, { pill: string; dot: string; bg: string; text: string; border: string }> = {
  gray:    { pill: 'bg-gray-100 text-gray-700',       dot: 'bg-gray-400',    bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-300' },
  red:     { pill: 'bg-red-100 text-red-700',          dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-300' },
  orange:  { pill: 'bg-orange-100 text-orange-700',    dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-600',  border: 'border-orange-300' },
  amber:   { pill: 'bg-amber-100 text-amber-800',      dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-300' },
  green:   { pill: 'bg-green-100 text-green-700',      dot: 'bg-green-500',   bg: 'bg-green-50',   text: 'text-green-600',   border: 'border-green-300' },
  teal:    { pill: 'bg-teal-100 text-teal-700',        dot: 'bg-teal-500',    bg: 'bg-teal-50',    text: 'text-teal-600',    border: 'border-teal-300' },
  blue:    { pill: 'bg-blue-100 text-blue-700',        dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-300' },
  indigo:  { pill: 'bg-indigo-100 text-indigo-700',    dot: 'bg-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-600',  border: 'border-indigo-300' },
  violet:  { pill: 'bg-violet-100 text-violet-700',    dot: 'bg-violet-500',  bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-300' },
  pink:    { pill: 'bg-pink-100 text-pink-700',        dot: 'bg-pink-500',    bg: 'bg-pink-50',    text: 'text-pink-600',    border: 'border-pink-300' },
  rose:    { pill: 'bg-rose-100 text-rose-700',        dot: 'bg-rose-500',    bg: 'bg-rose-50',    text: 'text-rose-600',    border: 'border-rose-300' },
  sky:     { pill: 'bg-sky-100 text-sky-700',          dot: 'bg-sky-500',     bg: 'bg-sky-50',     text: 'text-sky-600',     border: 'border-sky-300' },
}

export const COLOR_OPTIONS = Object.keys(CATEGORY_COLORS)

export function getCategoryColor(color: string | undefined | null) {
  return CATEGORY_COLORS[color || 'gray'] || CATEGORY_COLORS.gray
}
