'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportToGoogleDocs } from '@/app/actions/export-google-docs'
import { exportToWord } from '@/app/actions/export-word'
import { getPdfExportData } from '@/app/actions/export-pdf-data'
// jsPDF is lazy-loaded when PDF export is triggered (see handlePdfExport)

// Types for PDF export data
interface PdfContact {
  name: string
  role: string
  emails: string[]
  phones: string[]
}

interface PdfEntry {
  subject: string
  date: string
  direction: string
  type: string
  contactName: string
  contactRole: string
  text: string
  action: string | null
}

export function ExportDropdown({ businessId }: { businessId: string }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const handleGoogleDocsExport = async () => {
    setShowDropdown(false)
    setExporting(true)
    setError(null)
    setSuccess(null)

    try {
      // Get formatted content from server
      const result = await exportToGoogleDocs(businessId)

      if ('error' in result) {
        setError(result.error || 'Export failed')
        setExporting(false)
        return
      }

      const { businessName, content } = result.data

      // Create Google Doc using MCP
      // @ts-expect-error - MCP tools are injected at runtime
      if (typeof mcp__google_workspace__createDocument === 'undefined') {
        setError('Google Workspace integration not available. Please ensure MCP is configured.')
        setExporting(false)
        return
      }

      // @ts-expect-error - MCP tools are injected at runtime
      const createResult = await mcp__google_workspace__createDocument({
        title: `${businessName} - Correspondence`,
        initialContent: content,
      })

      if (createResult && createResult.documentId) {
        const url = `https://docs.google.com/document/d/${createResult.documentId}/edit`
        setSuccess('Google Doc created successfully!')

        // Open in new tab
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        setError('Failed to create Google Doc')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export failed'
      setError(errorMessage)
    }

    setExporting(false)
  }

  const handleWordExport = async () => {
    setShowDropdown(false)
    setExporting(true)
    setError(null)
    setSuccess(null)

    try {
      // Get Word document from server
      const result = await exportToWord(businessId)

      if ('error' in result) {
        setError(result.error || 'Export failed')
        setExporting(false)
        return
      }

      const { businessName, buffer } = result.data

      // Convert base64 to blob
      const binaryString = atob(buffer)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${businessName} - Correspondence.docx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      setSuccess('Word document downloaded successfully!')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export failed'
      setError(errorMessage)
    }

    setExporting(false)
  }

  const handlePdfExport = async () => {
    setShowDropdown(false)
    setExporting(true)
    setError(null)
    setSuccess(null)

    try {
      // Get data for PDF
      const result = await getPdfExportData(businessId)

      if ('error' in result) {
        setError(result.error || 'Export failed')
        setExporting(false)
        return
      }

      const { business, contacts, entries, exportDate } = result.data

      // Lazy-load jsPDF only when needed
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      // Safe content width with buffer for jsPDF measurement imprecision
      // We manually split metadata lines, so splitTextToSize only used for body text
      const contentWidth = pageWidth - margin * 2 - 10 // 160mm safe area
      let yPos = margin

      // Helper function to add new page if needed
      const checkPageBreak = (requiredSpace: number) => {
        if (yPos + requiredSpace > pageHeight - margin) {
          doc.addPage()
          yPos = margin
          return true
        }
        return false
      }

      // Cover Page
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      const titleLines = doc.splitTextToSize(business.name, contentWidth)
      titleLines.forEach((line: string) => {
        doc.text(line, pageWidth / 2, yPos, { align: 'center', maxWidth: contentWidth })
        yPos += 12
      })

      yPos += 10
      doc.setFontSize(18)
      doc.text('Correspondence File', pageWidth / 2, yPos, { align: 'center' })
      yPos += 20

      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      if (business.category) {
        doc.text(`Category: ${business.category}`, margin, yPos)
        yPos += 7
      }
      if (business.status) {
        doc.text(`Status: ${business.status}`, margin, yPos)
        yPos += 7
      }
      if (business.isClubCard) {
        doc.text('Club Card Member', margin, yPos)
        yPos += 7
      }
      if (business.isAdvertiser) {
        doc.text('Advertiser', margin, yPos)
        yPos += 7
      }
      doc.text(`Exported: ${exportDate}`, margin, yPos)
      yPos += 10

      // Contacts Section
      if (contacts.length > 0) {
        doc.addPage()
        yPos = margin

        doc.setFontSize(18)
        doc.setFont('helvetica', 'bold')
        doc.text('CONTACTS', margin, yPos)
        yPos += 15

        contacts.forEach((contact: PdfContact) => {
          checkPageBreak(30)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          let contactHeader = contact.name
          if (contact.role) contactHeader += ` - ${contact.role}`
          doc.text(contactHeader, margin, yPos)
          yPos += 7

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(11)

          contact.emails.forEach((email: string) => {
            const emailLines = doc.splitTextToSize(`Email: ${email}`, contentWidth)
            emailLines.forEach((line: string) => {
              checkPageBreak(6)
              doc.text(line, margin, yPos)
              yPos += 6
            })
          })

          contact.phones.forEach((phone: string) => {
            const phoneLines = doc.splitTextToSize(`Phone: ${phone}`, contentWidth)
            phoneLines.forEach((line: string) => {
              checkPageBreak(6)
              doc.text(line, margin, yPos)
              yPos += 6
            })
          })

          yPos += 8
        })
      }

      // Correspondence Section
      doc.addPage()
      yPos = margin

      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('CORRESPONDENCE', margin, yPos)
      yPos += 15

      if (entries.length > 0) {
        entries.forEach((entry: PdfEntry, index: number) => {
          checkPageBreak(40)

          // Subject
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          const subjectLines = doc.splitTextToSize(entry.subject, contentWidth)
          subjectLines.forEach((line: string) => {
            doc.text(line, margin, yPos)
            yPos += 8
          })

          // Meta information - split into multiple lines to avoid overflow
          // jsPDF's splitTextToSize is unreliable, so we manually split the metadata
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')

          // Line 1: Date | Direction | Type
          let metaLine1 = entry.date
          if (entry.direction) metaLine1 += ` | ${entry.direction}`
          if (entry.type) metaLine1 += ` | ${entry.type}`

          checkPageBreak(6)
          doc.text(metaLine1, margin, yPos)
          yPos += 5

          // Line 2: Contact Name, Role
          let metaLine2 = entry.contactName
          if (entry.contactRole) metaLine2 += `, ${entry.contactRole}`

          checkPageBreak(6)
          doc.text(metaLine2, margin, yPos)
          yPos += 6

          // Entry text
          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')
          const textLines = doc.splitTextToSize(entry.text, contentWidth)
          textLines.forEach((line: string) => {
            checkPageBreak(6)
            doc.text(line, margin, yPos)
            yPos += 6
          })
          yPos += 5

          // Action
          if (entry.action) {
            checkPageBreak(8)
            doc.setFont('helvetica', 'bold')
            const actionLines = doc.splitTextToSize(entry.action, contentWidth)
            actionLines.forEach((line: string) => {
              doc.text(line, margin, yPos)
              yPos += 6
            })
            yPos += 5
          }

          // Separator
          if (index < entries.length - 1) {
            checkPageBreak(5)
            doc.setDrawColor(150, 150, 150)
            doc.line(margin, yPos, pageWidth - margin, yPos)
            yPos += 10
          }
        })
      } else {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'normal')
        doc.text('No correspondence entries yet.', margin, yPos)
      }

      // Save PDF
      doc.save(`${business.name} - Correspondence.pdf`)
      setSuccess('PDF downloaded successfully!')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Export failed'
      setError(errorMessage)
    }

    setExporting(false)
  }

  return (
    <div className="relative">
      <div className="flex gap-2 items-center">
        <Button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={exporting}
          className="bg-green-600 text-white hover:bg-green-700 px-6 py-3 font-semibold"
        >
          {exporting ? 'Exporting...' : 'Export ▼'}
        </Button>
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-1 bg-white border-2 border-gray-300 shadow-lg z-10 min-w-[220px]">
          <button
            onClick={handlePdfExport}
            disabled={exporting}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm font-medium border-b border-gray-300"
          >
            📕 Export to PDF
          </button>
          <button
            onClick={handleWordExport}
            disabled={exporting}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm font-medium border-b border-gray-300"
          >
            📝 Export to Word (.docx)
          </button>
          <button
            onClick={handleGoogleDocsExport}
            disabled={exporting}
            className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm font-medium"
          >
            📄 Export to Google Docs
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-50 border-2 border-red-600 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-3 bg-green-50 border-2 border-green-600 p-3">
          <p className="text-sm text-green-900 font-semibold">✓ {success}</p>
        </div>
      )}
    </div>
  )
}
