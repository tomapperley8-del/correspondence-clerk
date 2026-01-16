'use server'

import { createClient } from '@/lib/supabase/server'
import { parse } from 'csv-parse/sync'
import fs from 'fs/promises'
import path from 'path'

interface MastersheetRow {
  BUSINESS: string
  'RELATIONSHIP TYPE': string
  'PRIMARY CONTACT': string
  'OTHER CONTACTS': string
  EMAIL: string
  PHONE: string
  'BUSINESS CATEGORY': string
  'ON WEBSITE?': string
  'REMINDER FLAG': string
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

          // Collect contacts
          if (row['PRIMARY CONTACT'] && row['PRIMARY CONTACT'].trim()) {
            contacts.push({
              name: row['PRIMARY CONTACT'].trim(),
              email: row.EMAIL || '',
              phone: row.PHONE || '',
            })
          }

          if (row['OTHER CONTACTS'] && row['OTHER CONTACTS'].trim()) {
            // Split by comma or semicolon
            const otherNames = row['OTHER CONTACTS']
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
            !row['PRIMARY CONTACT'] &&
            !row['OTHER CONTACTS'] &&
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
              mastersheet_source_ids: rowNumbers,
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

        for (const contact of uniqueContacts.values()) {
          if (!contact.name) continue

          // Check if contact already exists
          const normalizedEmail = contact.email
            ? normalizeEmail(contact.email)
            : null

          let existingContact = null
          if (normalizedEmail) {
            const { data } = await supabase
              .from('contacts')
              .select('id')
              .eq('business_id', businessId)
              .eq('normalized_email', normalizedEmail)
              .single()
            existingContact = data
          }

          if (!existingContact) {
            // Create new contact
            const { error: contactError } = await supabase
              .from('contacts')
              .insert({
                business_id: businessId,
                name: contact.name,
                email: contact.email || null,
                normalized_email: normalizedEmail,
                phone: contact.phone || null,
              })

            if (contactError) {
              report.warnings.push(
                `Failed to create contact "${contact.name}" for "${name}": ${contactError.message}`
              )
            } else {
              report.contactsCreated++
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
