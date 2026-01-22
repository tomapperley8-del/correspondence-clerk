'use server'

import { createClient } from '@/lib/supabase/server'
import { getBusinessById } from './businesses'
import { getContactsByBusiness } from './contacts'
import { getCorrespondenceByBusiness } from './correspondence'

/**
 * Get data for PDF export
 * Returns structured data that will be converted to PDF on client side
 */
export async function getPdfExportData(businessId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    // Get business data
    const businessResult = await getBusinessById(businessId)
    if ('error' in businessResult || !businessResult.data) {
      return { error: 'Business not found' }
    }
    const business = businessResult.data

    // Get contacts
    const contactsResult = await getContactsByBusiness(businessId)
    const contacts = 'error' in contactsResult ? [] : contactsResult.data || []

    // Get all correspondence (no limit)
    const correspondenceResult = await getCorrespondenceByBusiness(businessId, 1000, 0)
    const correspondence = 'error' in correspondenceResult ? [] : correspondenceResult.data || []

    // Sort correspondence chronologically (oldest first)
    const sortedEntries = [...correspondence].sort((a, b) => {
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return dateA - dateB
    })

    // Format entries for PDF
    const formattedEntries = sortedEntries.map((entry) => {
      const entryDate = entry.entry_date
        ? new Date(entry.entry_date).toLocaleDateString('en-GB')
        : 'No date'
      const direction =
        entry.direction === 'sent'
          ? '→ Sent'
          : entry.direction === 'received'
            ? '← Received'
            : ''
      const type = entry.type || ''
      const entryText =
        entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original

      let actionText = null
      if (entry.action_needed !== 'none') {
        actionText = `Action: ${entry.action_needed.replace(/_/g, ' ')}`
        if (entry.due_at) {
          const dueDate = new Date(entry.due_at).toLocaleDateString('en-GB')
          actionText += ` | Due: ${dueDate}`
        }
      }

      return {
        subject: entry.subject || 'No subject',
        date: entryDate,
        direction,
        type,
        contactName: entry.contact.name,
        contactRole: entry.contact.role || '',
        text: entryText,
        action: actionText,
      }
    })

    // Format contacts for PDF
    const formattedContacts = contacts.map((contact) => {
      const emails =
        contact.emails && contact.emails.length > 0
          ? contact.emails
          : contact.email
            ? [contact.email]
            : []

      const phones =
        contact.phones && contact.phones.length > 0
          ? contact.phones
          : contact.phone
            ? [contact.phone]
            : []

      return {
        name: contact.name,
        role: contact.role || '',
        emails,
        phones,
      }
    })

    return {
      data: {
        business: {
          name: business.name,
          category: business.category || '',
          status: business.status || '',
          isClubCard: business.is_club_card,
          isAdvertiser: business.is_advertiser,
        },
        contacts: formattedContacts,
        entries: formattedEntries,
        exportDate: new Date().toLocaleDateString('en-GB'),
      },
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: `Export failed: ${errorMessage}` }
  }
}
