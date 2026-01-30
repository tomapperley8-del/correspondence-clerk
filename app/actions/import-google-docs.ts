'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'
import { isAdmin } from '@/lib/admin-check'
import { logAuditEvent, createImportMetadata } from '@/lib/audit-log'

// MCP type definitions
declare global {
  function mcp__google_workspace__listFolderContents(params: {
    folderId: string
    maxResults: number
  }): Promise<{ files: Array<{ id: string; name: string }> }>

  function mcp__google_workspace__readGoogleDoc(params: {
    documentId: string
    format: string
  }): Promise<string>
}

interface GoogleDocsImportReport {
  documentsProcessed: number
  businessesMatched: number
  businessesNotFound: string[]
  contactsCreated: number
  correspondenceCreated: number
  errors: string[]
  warnings: string[]
}

/**
 * Parse British date format (DD/MM/YY or DD/MM/YYYY) to ISO format
 */
function parseDocDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null

  const trimmed = dateStr.trim()

  // Try DD/MM/YY format (e.g., "03/09/25")
  const shortMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (shortMatch) {
    const day = shortMatch[1].padStart(2, '0')
    const month = shortMatch[2].padStart(2, '0')
    let year = shortMatch[3]
    // Convert 2-digit year to 4-digit (assume 20xx for years < 50, 19xx for >= 50)
    year = parseInt(year) < 50 ? `20${year}` : `19${year}`
    return `${year}-${month}-${day}`
  }

  // Try DD/MM/YYYY format
  const longMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0')
    const month = longMatch[2].padStart(2, '0')
    const year = longMatch[3]
    return `${year}-${month}-${day}`
  }

  return null
}

/**
 * Extract business name from document title
 * "ADAM & POTSIE HAIRDRESSER - Merged Contacts & Correspondence 2025" -> "ADAM & POTSIE HAIRDRESSER"
 */
function extractBusinessName(title: string): string {
  return title.replace(/\s*-\s*Merged Contacts & Correspondence \d{4}.*$/i, '').trim()
}

/**
 * Parse correspondence entries from document text
 */
function parseCorrespondenceEntries(text: string): Array<{
  date: string | null
  content: string
}> {
  const entries: Array<{ date: string | null; content: string }> = []

  // Find the Correspondence section
  const correspondenceMatch = text.match(/Correspondence\s*\.{3,}([\s\S]*)/i)
  if (!correspondenceMatch) return entries

  const correspondenceText = correspondenceMatch[1]

  // Split by the separator lines (multiple dots)
  const rawEntries = correspondenceText.split(/\.{3,}/).filter((e) => e.trim())

  for (const rawEntry of rawEntries) {
    const trimmed = rawEntry.trim()
    if (!trimmed) continue

    // Look for date at the start of the entry (DD/MM/YY or DD/MM/YYYY)
    const dateMatch = trimmed.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*-?\s*(.*)$/)

    if (dateMatch) {
      const dateStr = dateMatch[1]
      const content = dateMatch[2].trim()

      entries.push({
        date: parseDocDate(dateStr),
        content: content,
      })
    } else {
      // No date found, add with null date
      entries.push({
        date: null,
        content: trimmed,
      })
    }
  }

  return entries
}

/**
 * Parse contact information from document text
 */
function parseContactInfo(text: string): {
  email: string | null
  phone: string | null
  name: string | null
  role: string | null
} {
  const contact = {
    email: null as string | null,
    phone: null as string | null,
    name: null as string | null,
    role: null as string | null,
  }

  // Extract email
  const emailMatch = text.match(/Email[:\s-]+([^\n]+)/i)
  if (emailMatch) {
    const emails = emailMatch[1].trim().split(/[\/,]/).map((e) => e.trim())
    contact.email = emails[0] || null
  }

  // Extract phone
  const phoneMatch = text.match(/Tel[:\s-]+([^\n]+)/i)
  if (phoneMatch) {
    const phones = phoneMatch[1].trim().split(/[\/,]/).map((p) => p.trim())
    contact.phone = phones[0] || null
  }

  // Extract name and role (format: "Frances Hughes - Owner")
  const nameRoleMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*-\s*([^\n]+)/i)
  if (nameRoleMatch) {
    contact.name = nameRoleMatch[1].trim()
    contact.role = nameRoleMatch[2].trim()
  }

  return contact
}

/**
 * Process documents data and import to database
 */
async function processDocumentsData(
  documentsData: Array<{ documentId: string; title: string; content: string }>
): Promise<GoogleDocsImportReport> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Get user's organization
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    throw new Error('No organization found')
  }

  const report: GoogleDocsImportReport = {
    documentsProcessed: 0,
    businessesMatched: 0,
    businessesNotFound: [],
    contactsCreated: 0,
    correspondenceCreated: 0,
    errors: [],
    warnings: [],
  }

  for (const doc of documentsData) {
    try {
      const businessName = extractBusinessName(doc.title)

      // Find matching business in database (case-insensitive)
      const { data: business } = await supabase
        .from('businesses')
        .select('id, name')
        .ilike('name', businessName)
        .single()

      if (!business) {
        report.businessesNotFound.push(businessName)
        report.warnings.push(`Business not found: ${businessName}`)
        continue
      }

      report.businessesMatched++

      // Parse contact info
      const contactInfo = parseContactInfo(doc.content)

      // Create or find contact if we have enough info
      let contactId: string | null = null
      if (contactInfo.email || contactInfo.name) {
        // Try to find existing contact by email
        if (contactInfo.email) {
          const { data: existingContact } = await supabase
            .from('contacts')
            .select('id')
            .eq('business_id', business.id)
            .ilike('email', contactInfo.email)
            .single()

          if (existingContact) {
            contactId = existingContact.id
          }
        }

        // Create new contact if not found
        if (!contactId && contactInfo.name) {
          const { data: newContact, error: contactError } = await supabase
            .from('contacts')
            .insert({
              business_id: business.id,
              name: contactInfo.name || 'Contact',
              email: contactInfo.email,
              normalized_email: contactInfo.email?.toLowerCase() || null,
              phone: contactInfo.phone,
              role: contactInfo.role,
              organization_id: organizationId,
            })
            .select('id')
            .single()

          if (contactError) {
            report.warnings.push(
              `Failed to create contact for ${businessName}: ${contactError.message}`
            )
          } else {
            contactId = newContact.id
            report.contactsCreated++
          }
        }
      }

      // If still no contact, create a generic one
      if (!contactId) {
        const { data: genericContact } = await supabase
          .from('contacts')
          .insert({
            business_id: business.id,
            name: 'Contact',
            email: contactInfo.email,
            normalized_email: contactInfo.email?.toLowerCase() || null,
            phone: contactInfo.phone,
            organization_id: organizationId,
          })
          .select('id')
          .single()

        if (genericContact) {
          contactId = genericContact.id
          report.contactsCreated++
        }
      }

      if (!contactId) {
        report.warnings.push(`Could not create contact for ${businessName}, skipping correspondence`)
        continue
      }

      // Parse and create correspondence entries
      const entries = parseCorrespondenceEntries(doc.content)

      for (const entry of entries) {
        if (!entry.content || entry.content.length < 10) continue // Skip very short entries

        try {
          const { error: corrError } = await supabase.from('correspondence').insert({
            business_id: business.id,
            contact_id: contactId,
            user_id: user.id,
            entry_date: entry.date || new Date().toISOString(),
            raw_text_original: entry.content,
            formatted_text_original: entry.content,
            formatted_text_current: entry.content,
            type: null, // We don't know the type from the import
            direction: null,
            action_needed: 'none',
            formatting_status: 'formatted', // Mark as already formatted since it's from historical docs
            organization_id: organizationId,
          })

          if (corrError) {
            report.warnings.push(
              `Failed to create correspondence for ${businessName}: ${corrError.message}`
            )
          } else {
            report.correspondenceCreated++
          }
        } catch (err) {
          report.warnings.push(
            `Error creating correspondence for ${businessName}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      // Update business last_contacted_at to most recent entry date
      if (entries.length > 0) {
        const dates = entries.map((e) => e.date).filter((d) => d !== null) as string[]
        if (dates.length > 0) {
          const mostRecent = dates.sort().reverse()[0]
          await supabase
            .from('businesses')
            .update({ last_contacted_at: mostRecent })
            .eq('id', business.id)
        }
      }

      report.documentsProcessed++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      report.errors.push(`Error processing ${doc.title}: ${errorMessage}`)
    }
  }

  return report
}

/**
 * List documents in the Google Drive folder
 */
export async function listGoogleDocsFolder(
  folderId: string
): Promise<{ error: string } | { data: Array<{ id: string; name: string }> }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    const folderContents = await mcp__google_workspace__listFolderContents({
      folderId,
      maxResults: 100,
    })

    if (!folderContents || !folderContents.files) {
      return { error: 'Failed to list folder contents' }
    }

    const documents = folderContents.files.filter((file) =>
      file.name.includes('Merged Contacts & Correspondence')
    )

    return { data: documents }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: errorMessage }
  }
}

/**
 * Read a batch of Google Docs
 */
export async function readGoogleDocsBatch(
  documentIds: Array<{ id: string; name: string }>
): Promise<{
  error: string
} | { data: Array<{ documentId: string; title: string; content: string }> }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    const results = await Promise.all(
      documentIds.map(async (doc) => {
        try {
          const content = await mcp__google_workspace__readGoogleDoc({
            documentId: doc.id,
            format: 'text',
          })

          return {
            documentId: doc.id,
            title: doc.name,
            content: content,
          }
        } catch (err) {
          console.error(`Failed to read document ${doc.name}:`, err)
          return null
        }
      })
    )

    const successfulReads = results.filter((r) => r !== null) as Array<{
      documentId: string
      title: string
      content: string
    }>

    return { data: successfulReads }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: errorMessage }
  }
}

/**
 * Import Google Docs data that has already been fetched
 * This is called from the UI after documents are read
 */
export async function importGoogleDocsData(
  documentsData: Array<{ documentId: string; title: string; content: string }>
): Promise<{ error: string } | { data: GoogleDocsImportReport }> {
  // Require admin role for import operations
  const adminCheck = await isAdmin()
  if (!adminCheck) {
    return { error: 'Unauthorized - admin role required' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  try {
    const report = await processDocumentsData(documentsData)

    // Log successful import
    await logAuditEvent({
      action: 'import_google_docs',
      status: report.errors.length > 0 ? 'partial' : 'success',
      metadata: createImportMetadata(report),
    })

    return { data: report }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    // Log failed import
    await logAuditEvent({
      action: 'import_google_docs',
      status: 'failure',
      metadata: { error: errorMessage, timestamp: new Date().toISOString() },
    })

    return { error: errorMessage }
  }
}
