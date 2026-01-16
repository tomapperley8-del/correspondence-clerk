'use server'

import { createClient } from '@/lib/supabase/server'
import { getBusinessById } from './businesses'
import { getContactsByBusiness } from './contacts'
import { getCorrespondenceByBusiness } from './correspondence'

/**
 * Export business correspondence to Google Docs
 * Creates a print-ready document with cover page, contacts, and chronological entries
 */
export async function exportToGoogleDocs(businessId: string) {
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

    // Build document content
    let documentContent = ''

    // Cover Page
    documentContent += `${business.name}\n`
    documentContent += `Correspondence File\n\n`

    if (business.category) {
      documentContent += `Category: ${business.category}\n`
    }
    if (business.status) {
      documentContent += `Status: ${business.status}\n`
    }
    if (business.is_club_card) {
      documentContent += `Club Card Member\n`
    }
    if (business.is_advertiser) {
      documentContent += `Advertiser\n`
    }
    documentContent += `\nExported: ${new Date().toLocaleDateString('en-GB')}\n\n`

    // Contacts Section
    if (contacts.length > 0) {
      documentContent += `\n--- CONTACTS ---\n\n`
      contacts.forEach((contact) => {
        documentContent += `${contact.name}`
        if (contact.role) {
          documentContent += ` - ${contact.role}`
        }
        documentContent += `\n`
        if (contact.email) {
          documentContent += `Email: ${contact.email}\n`
        }
        if (contact.phone) {
          documentContent += `Phone: ${contact.phone}\n`
        }
        documentContent += `\n`
      })
    }

    // Correspondence Section
    if (sortedEntries.length > 0) {
      documentContent += `\n--- CORRESPONDENCE ---\n\n`

      sortedEntries.forEach((entry, index) => {
        // Entry header
        if (entry.subject) {
          documentContent += `${entry.subject}\n`
        }

        // Meta information
        const entryDate = entry.entry_date ? new Date(entry.entry_date).toLocaleDateString('en-GB') : 'No date'
        const direction = entry.direction === 'sent' ? '→ Sent' : entry.direction === 'received' ? '← Received' : ''
        const type = entry.type || ''

        documentContent += `${entryDate}`
        if (direction) documentContent += ` | ${direction}`
        if (type) documentContent += ` | ${type}`
        documentContent += ` | ${entry.contact.name}`
        if (entry.contact.role) documentContent += `, ${entry.contact.role}`
        documentContent += `\n\n`

        // Entry text (use formatted_text_current as per PRD)
        const entryText = entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
        documentContent += `${entryText}\n`

        // Action needed
        if (entry.action_needed !== 'none') {
          documentContent += `\nAction: ${entry.action_needed.replace(/_/g, ' ')}`
          if (entry.due_at) {
            const dueDate = new Date(entry.due_at).toLocaleDateString('en-GB')
            documentContent += ` | Due: ${dueDate}`
          }
          documentContent += `\n`
        }

        // Separator between entries (except last)
        if (index < sortedEntries.length - 1) {
          documentContent += `\n${'—'.repeat(50)}\n\n`
        }
      })
    } else {
      documentContent += `\n--- CORRESPONDENCE ---\n\nNo correspondence entries yet.\n`
    }

    // Return the formatted content
    // Note: The actual MCP integration will be called from the client component
    return {
      data: {
        businessName: business.name,
        content: documentContent,
        entryCount: sortedEntries.length,
        contactCount: contacts.length
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: `Export failed: ${errorMessage}` }
  }
}
