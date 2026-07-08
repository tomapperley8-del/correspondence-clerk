import type { ResourceCategory } from '@/app/actions/resources'

export const RESOURCE_CATEGORIES: { value: ResourceCategory; label: string; badge: string }[] = [
  { value: 'ad_report', label: 'Ad Report', badge: 'bg-blue-50 text-blue-700' },
  { value: 'template', label: 'Template', badge: 'bg-purple-50 text-purple-700' },
  { value: 'sales_sheet', label: 'Sales Sheet', badge: 'bg-green-50 text-green-700' },
  { value: 'rate_card', label: 'Rate Card', badge: 'bg-amber-50 text-amber-700' },
  { value: 'media_pack', label: 'Media Pack', badge: 'bg-pink-50 text-pink-700' },
  { value: 'spreadsheet', label: 'Spreadsheet', badge: 'bg-teal-50 text-teal-700' },
  { value: 'other', label: 'Other', badge: 'bg-gray-100 text-gray-600' },
]

export function categoryMeta(value: string) {
  return (
    RESOURCE_CATEGORIES.find(c => c.value === value) ??
    RESOURCE_CATEGORIES[RESOURCE_CATEGORIES.length - 1]
  )
}

export const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PowerPoint',
  csv: 'CSV',
  txt: 'Text',
  text: 'Text',
  image: 'Image',
  google_sheet: 'Google Sheet',
  google_doc: 'Google Doc',
  google_slides: 'Google Slides',
  google_drive: 'Google Drive',
  link: 'Link',
}

export function fileTypeLabel(fileType: string | null): string {
  if (!fileType) return 'Link'
  return FILE_TYPE_LABELS[fileType] ?? fileType.toUpperCase()
}
