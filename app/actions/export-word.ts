'use server'

import { createClient } from '@/lib/supabase/server'
import { getBusinessById } from './businesses'
import { getContactsByBusiness } from './contacts'
import { getCorrespondenceByBusiness } from './correspondence'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  BorderStyle,
} from 'docx'

/**
 * Export business correspondence to Word (.docx)
 * Creates a print-ready document with cover page, contacts, and chronological entries
 * Matches Google Docs export structure exactly
 */
export async function exportToWord(businessId: string) {
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

    // Get all correspondence using pagination
    let allCorrespondence: any[] = []
    let offset = 0
    const batchSize = 500
    while (true) {
      const batch = await getCorrespondenceByBusiness(businessId, batchSize, offset)
      const batchData = 'error' in batch ? [] : batch.data || []
      allCorrespondence = allCorrespondence.concat(batchData)
      if (batchData.length < batchSize) break
      offset += batchSize
    }
    const correspondence = allCorrespondence

    // Sort correspondence chronologically (oldest first)
    const sortedEntries = [...correspondence].sort((a, b) => {
      const dateA = new Date(a.entry_date || a.created_at).getTime()
      const dateB = new Date(b.entry_date || b.created_at).getTime()
      return dateA - dateB
    })

    // Build document sections
    const sections: Paragraph[] = []

    // Cover Page
    sections.push(
      new Paragraph({
        text: business.name,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    )

    sections.push(
      new Paragraph({
        text: 'Correspondence File',
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    )

    // Business details
    const detailsLines: string[] = []
    if (business.category) detailsLines.push(`Category: ${business.category}`)
    if (business.status) detailsLines.push(`Status: ${business.status}`)
    if (business.is_club_card) detailsLines.push('Club Card Member')
    if (business.is_advertiser) detailsLines.push('Advertiser')
    detailsLines.push(`Exported: ${new Date().toLocaleDateString('en-GB')}`)

    detailsLines.forEach((line) => {
      sections.push(
        new Paragraph({
          text: line,
          spacing: { after: 100 },
        })
      )
    })

    // Page break after cover
    sections.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    )

    // Contacts Section
    if (contacts.length > 0) {
      sections.push(
        new Paragraph({
          text: 'CONTACTS',
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      )

      contacts.forEach((contact, index) => {
        // Contact name and role
        const nameRuns: TextRun[] = [
          new TextRun({
            text: contact.name,
            bold: true,
          }),
        ]
        if (contact.role) {
          nameRuns.push(
            new TextRun({
              text: ` - ${contact.role}`,
              bold: false,
            })
          )
        }

        sections.push(
          new Paragraph({
            children: nameRuns,
            spacing: { after: 100 },
          })
        )

        // Multiple emails
        if (contact.emails && contact.emails.length > 0) {
          contact.emails.forEach((email: string) => {
            sections.push(
              new Paragraph({
                text: `Email: ${email}`,
                spacing: { after: 50 },
              })
            )
          })
        } else if (contact.email) {
          sections.push(
            new Paragraph({
              text: `Email: ${contact.email}`,
              spacing: { after: 50 },
            })
          )
        }

        // Multiple phones
        if (contact.phones && contact.phones.length > 0) {
          contact.phones.forEach((phone: string) => {
            sections.push(
              new Paragraph({
                text: `Phone: ${phone}`,
                spacing: { after: 50 },
              })
            )
          })
        } else if (contact.phone) {
          sections.push(
            new Paragraph({
              text: `Phone: ${contact.phone}`,
              spacing: { after: 50 },
            })
          )
        }

        // Spacing between contacts
        if (index < contacts.length - 1) {
          sections.push(
            new Paragraph({
              text: '',
              spacing: { after: 200 },
            })
          )
        }
      })

      // Page break after contacts
      sections.push(
        new Paragraph({
          children: [new PageBreak()],
        })
      )
    }

    // Correspondence Section
    sections.push(
      new Paragraph({
        text: 'CORRESPONDENCE',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    )

    if (sortedEntries.length > 0) {
      sortedEntries.forEach((entry, index) => {
        // Entry subject as heading
        if (entry.subject) {
          sections.push(
            new Paragraph({
              text: entry.subject,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 100 },
            })
          )
        }

        // Meta information line
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

        let metaLine = entryDate
        if (direction) metaLine += ` | ${direction}`
        if (type) metaLine += ` | ${type}`
        metaLine += ` | ${entry.contact.name}`
        if (entry.contact.role) metaLine += `, ${entry.contact.role}`

        sections.push(
          new Paragraph({
            children: [
              new TextRun({
                text: metaLine,
                italics: true,
              }),
            ],
            spacing: { after: 200 },
            // Add word-wrap behavior for long metadata lines
            contextualSpacing: true,
          })
        )

        // Entry text (preserve formatting with line breaks)
        const entryText =
          entry.formatted_text_current || entry.formatted_text_original || entry.raw_text_original
        const lines = entryText.split('\n')

        lines.forEach((line: string, lineIndex: number) => {
          sections.push(
            new Paragraph({
              text: line || '', // Empty string for blank lines
              spacing: { after: lineIndex < lines.length - 1 ? 100 : 200 },
            })
          )
        })

        // Action needed
        if (entry.action_needed !== 'none') {
          let actionText = `Action: ${entry.action_needed.replace(/_/g, ' ')}`
          if (entry.due_at) {
            const dueDate = new Date(entry.due_at).toLocaleDateString('en-GB')
            actionText += ` | Due: ${dueDate}`
          }

          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: actionText,
                  bold: true,
                }),
              ],
              spacing: { before: 100, after: 200 },
            })
          )
        }

        // Separator line between entries (except last)
        if (index < sortedEntries.length - 1) {
          sections.push(
            new Paragraph({
              text: '—'.repeat(50),
              spacing: { before: 200, after: 200 },
              border: {
                bottom: {
                  color: 'auto',
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6,
                },
              },
            })
          )
        }
      })
    } else {
      sections.push(
        new Paragraph({
          text: 'No correspondence entries yet.',
          spacing: { after: 200 },
        })
      )
    }

    // Create the document
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch = 1440 twips
                right: 1440,
                bottom: 1440,
                left: 1440,
              },
            },
          },
          children: sections,
        },
      ],
    })

    // Generate buffer
    const buffer = await Packer.toBuffer(doc)

    // Convert to base64 for transmission
    const base64 = buffer.toString('base64')

    return {
      data: {
        businessName: business.name,
        buffer: base64,
        entryCount: sortedEntries.length,
        contactCount: contacts.length,
      },
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return { error: `Export failed: ${errorMessage}` }
  }
}
