'use server'

import { createClient } from '@/lib/supabase/server'
import { parse } from 'csv-parse/sync'
import fs from 'fs/promises'
import path from 'path'
import { getCurrentUserOrganizationId } from '@/lib/auth-helpers'

interface MastersheetRow {
  BUSINESS: string
  'RELATIONSHIP TYPE': string
  'CONTRACT START': string
  'CONTRACT END': string
  'NOTES/AD DETAILS/FLAG INFO': string
  'PAYMENT STRUCTURE': string
  'AMOUNT (£)': string
  'PRIMARY CONTACT': string
  'OTHER CONTACTS': string
  EMAIL: string
  PHONE: string
  'BUSINESS CATEGORY': string
  'ON WEBSITE?': string
  'REMINDER FLAG': string
  'Primary Contact': string
  'Other Contacts': string
}

interface ImportReport {
  businessesCreated: number
  businessesUpdated: number
  businessesMerged: number
  contactsCreated: number
  errors: string[]
  warnings: string[]
  duplicatesFound: { name: string; types: string[] }[]
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Parse British date format (DD/MM/YYYY) to ISO format (YYYY-MM-DD)
 */
function parseBritishDate(dateStr: string): string | null {
  if (!dateStr || !dateStr.trim()) return null

  const trimmed = dateStr.trim()

  // Try to parse DD/MM/YYYY format
  const britishMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (britishMatch) {
    const day = britishMatch[1].padStart(2, '0')
    const month = britishMatch[2].padStart(2, '0')
    const year = britishMatch[3]
    return `${year}-${month}-${day}`
  }

  // If already in ISO format, return as-is
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return trimmed
  }

  return null
}

/**
 * Parse relationship type into flags
 */
function parseRelationshipType(type: string): {
  isClubCard: boolean
  isAdvertiser: boolean
  status: string
} {
  const typeLower = type.toLowerCase()

  const isClubCard =
    typeLower.includes('club card') && !typeLower.includes('former')
  const isAdvertiser =
    typeLower.includes('advertiser') && !typeLower.includes('former')

  // Determine status
  let status = 'Prospect'
  if (typeLower.includes('former')) {
    status = 'Former'
  } else if (isClubCard || isAdvertiser) {
    status = 'Active'
  }

  return { isClubCard, isAdvertiser, status }
}

/**
 * Import businesses and contacts from Mastersheet.csv
 * Idempotent: can run multiple times safely
 */
export async function importMastersheet(): Promise<
  { error: string } | { data: ImportReport }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  // Get user's organization
  const organizationId = await getCurrentUserOrganizationId()
  if (!organizationId) {
    return { error: 'No organization found' }
  }

  const report: ImportReport = {
    businessesCreated: 0,
    businessesUpdated: 0,
    businessesMerged: 0,
    contactsCreated: 0,
    errors: [],
    warnings: [],
    duplicatesFound: [],
  }

  try {
    // Read CSV file
    const csvPath = path.join(process.cwd(), 'Mastersheet.csv')
    const fileContent = await fs.readFile(csvPath, 'utf-8')

    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as MastersheetRow[]

    // Group businesses by normalized name to detect duplicates
    const businessMap = new Map<
      string,
      {
        name: string
        rows: MastersheetRow[]
        rowNumbers: number[]
      }
    >()

    records.forEach((row, index) => {
      const businessName = row.BUSINESS
      if (!businessName || !businessName.trim()) {
        report.warnings.push(`Row ${index + 2}: Empty business name, skipping`)
        return
      }

      const normalized = normalizeName(businessName)
      const existing = businessMap.get(normalized)

      if (existing) {
        existing.rows.push(row)
        existing.rowNumbers.push(index + 2)
      } else {
        businessMap.set(normalized, {
          name: businessName,
          rows: [row],
          rowNumbers: [index + 2],
        })
      }
    })

    // Process each business
    for (const [normalizedName, businessData] of businessMap.entries()) {
      const { name, rows, rowNumbers } = businessData

      try {
        // Merge all rows for this business
        let isClubCard = false
        let isAdvertiser = false
        let category = ''
        let status = 'Prospect'
        let contractStart: string | null = null
        let contractEnd: string | null = null
        let dealTerms: string | null = null
        let paymentStructure: string | null = null
        let contractAmount: number | null = null
        const contacts: Array<{
          name: string
          email: string
          phone: string
        }> = []

        rows.forEach((row) => {
          const parsed = parseRelationshipType(row['RELATIONSHIP TYPE'] || '')
          if (parsed.isClubCard) isClubCard = true
          if (parsed.isAdvertiser) isAdvertiser = true

          // Use most recent status (last row wins)
          if (parsed.status !== 'Prospect') {
            status = parsed.status
          }

          // Category (first non-empty wins)
          if (!category && row['BUSINESS CATEGORY']) {
            category = row['BUSINESS CATEGORY']
          }

          // Contract dates (most recent non-empty wins)
          if (row['CONTRACT START'] && row['CONTRACT START'].trim()) {
            const parsed = parseBritishDate(row['CONTRACT START'])
            if (parsed) contractStart = parsed
          }
          if (row['CONTRACT END'] && row['CONTRACT END'].trim()) {
            const parsed = parseBritishDate(row['CONTRACT END'])
            if (parsed) contractEnd = parsed
          }

          // Deal terms for advertisers (concatenate if multiple)
          if (row['NOTES/AD DETAILS/FLAG INFO'] && row['NOTES/AD DETAILS/FLAG INFO'].trim()) {
            if (dealTerms) {
              dealTerms += '; ' + row['NOTES/AD DETAILS/FLAG INFO'].trim()
            } else {
              dealTerms = row['NOTES/AD DETAILS/FLAG INFO'].trim()
            }
          }

          // Payment structure (most recent non-empty wins)
          if (row['PAYMENT STRUCTURE'] && row['PAYMENT STRUCTURE'].trim()) {
            paymentStructure = row['PAYMENT STRUCTURE'].trim()
          }

          // Contract amount (most recent non-empty wins)
          if (row['AMOUNT (£)'] && row['AMOUNT (£)'].trim()) {
            const amountStr = row['AMOUNT (£)'].trim().replace(/[£,]/g, '')
            const amount = parseFloat(amountStr)
            if (!isNaN(amount)) {
              contractAmount = amount
            }
          }

          // Collect contacts (handle both uppercase and proper case column names)
          const primaryContact = row['PRIMARY CONTACT'] || row['Primary Contact']
          const otherContacts = row['OTHER CONTACTS'] || row['Other Contacts']

          if (primaryContact && primaryContact.trim()) {
            contacts.push({
              name: primaryContact.trim(),
              email: row.EMAIL || '',
              phone: row.PHONE || '',
            })
          }

          if (otherContacts && otherContacts.trim()) {
            // Split by comma or semicolon
            const otherNames = otherContacts
              .split(/[,;]/)
              .map((n) => n.trim())
              .filter((n) => n)

            otherNames.forEach((contactName) => {
              contacts.push({
                name: contactName,
                email: '',
                phone: '',
              })
            })
          }

          // If no named contact but we have email/phone, create anonymous contact
          if (
            !primaryContact &&
            !otherContacts &&
            (row.EMAIL || row.PHONE)
          ) {
            contacts.push({
              name: 'Contact',
              email: row.EMAIL || '',
              phone: row.PHONE || '',
            })
          }
        })

        // Report duplicates if found
        if (rows.length > 1) {
          report.duplicatesFound.push({
            name,
            types: rows.map((r) => r['RELATIONSHIP TYPE'] || 'Unknown'),
          })
        }

        // Check if business already exists
        const { data: existingBusiness } = await supabase
          .from('businesses')
          .select('id')
          .eq('normalized_name', normalizedName)
          .single()

        let businessId: string

        if (existingBusiness) {
          // Update existing business
          const { data: updated, error: updateError } = await supabase
            .from('businesses')
            .update({
              is_club_card: isClubCard,
              is_advertiser: isAdvertiser,
              category,
              status,
              contract_start: contractStart,
              contract_end: contractEnd,
              deal_terms: dealTerms,
              payment_structure: paymentStructure,
              contract_amount: contractAmount,
              mastersheet_source_ids: rowNumbers,
            })
            .eq('id', existingBusiness.id)
            .select('id')
            .single()

          if (updateError) {
            report.errors.push(
              `Failed to update business "${name}": ${updateError.message}`
            )
            continue
          }

          businessId = updated.id
          report.businessesUpdated++

          if (rows.length > 1) {
            report.businessesMerged++
          }
        } else {
          // Create new business
          const { data: created, error: createError } = await supabase
            .from('businesses')
            .insert({
              name,
              normalized_name: normalizedName,
              is_club_card: isClubCard,
              is_advertiser: isAdvertiser,
              category,
              status,
              contract_start: contractStart,
              contract_end: contractEnd,
              deal_terms: dealTerms,
              payment_structure: paymentStructure,
              contract_amount: contractAmount,
              mastersheet_source_ids: rowNumbers,
              organization_id: organizationId,
            })
            .select('id')
            .single()

          if (createError) {
            report.errors.push(
              `Failed to create business "${name}": ${createError.message}`
            )
            continue
          }

          businessId = created.id
          report.businessesCreated++

          if (rows.length > 1) {
            report.businessesMerged++
          }
        }

        // Create contacts (deduplicate by name+email)
        const uniqueContacts = new Map<string, typeof contacts[0]>()
        contacts.forEach((contact) => {
          const key = `${normalizeName(contact.name)}-${normalizeEmail(contact.email || '')}`
          if (!uniqueContacts.has(key)) {
            uniqueContacts.set(key, contact)
          }
        })

        // Batch: fetch all existing contacts for this business once
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('id, normalized_email, name')
          .eq('business_id', businessId)

        const existingEmailSet = new Set(
          (existingContacts || [])
            .filter(c => c.normalized_email)
            .map(c => c.normalized_email!.toLowerCase())
        )

        for (const contact of uniqueContacts.values()) {
          if (!contact.name) continue

          const normalizedEmail = contact.email
            ? normalizeEmail(contact.email)
            : null

          // Check existence in-memory instead of per-contact query
          if (normalizedEmail && existingEmailSet.has(normalizedEmail)) {
            continue // Already exists
          }

          // Create new contact
          const { error: contactError } = await supabase
            .from('contacts')
            .insert({
              business_id: businessId,
              name: contact.name,
              email: contact.email || null,
              normalized_email: normalizedEmail,
              phone: contact.phone || null,
              organization_id: organizationId,
            })

          if (contactError) {
            report.warnings.push(
              `Failed to create contact "${contact.name}" for "${name}": ${contactError.message}`
            )
          } else {
            report.contactsCreated++
            // Update in-memory set so subsequent contacts in this batch are also deduped
            if (normalizedEmail) {
              existingEmailSet.add(normalizedEmail)
            }
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        report.errors.push(`Error processing business "${name}": ${errorMessage}`)
      }
    }

    return { data: report }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: `Import failed: ${errorMessage}` }
  }
}
