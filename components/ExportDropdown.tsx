'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { exportToGoogleDocs } from '@/app/actions/export-google-docs'
import { exportToWord } from '@/app/actions/export-word'
import { getPdfExportData } from '@/app/actions/export-pdf-data'
import { jsPDF } from 'jspdf'

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
      // @ts-ignore - MCP tools are injected at runtime
      if (typeof mcp__google_workspace__createDocument === 'undefined') {
        setError('Google Workspace integration not available. Please ensure MCP is configured.')
        setExporting(false)
        return
      }

      // @ts-ignore
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

      // Create PDF
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 20
      // Maximum safe content width: A4 is 210mm, with 20mm margins on each side
      // jsPDF's splitTextToSize is imprecise with italic fonts, so use very conservative width
      // 210mm - 40mm (margins) - 25mm (safety buffer) = 145mm safe area
      const contentWidth = pageWidth - margin * 2 - 25
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

      // Helper function to add text with wrapping
      const addWrappedText = (text: string, fontSize: number, isBold: boolean = false) => {
        doc.setFontSize(fontSize)
        if (isBold) {
          doc.setFont('helvetica', 'bold')
        } else {
          doc.setFont('helvetica', 'normal')
        }

        const lines = doc.splitTextToSize(text, contentWidth)
        lines.forEach((line: string) => {
          checkPageBreak(fontSize / 2 + 2)
          doc.text(line, margin, yPos)
          yPos += fontSize / 2 + 2
        })
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

        contacts.forEach((contact: any) => {
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
        entries.forEach((entry: any, index: number) => {
          checkPageBreak(40)

          // Subject
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          const subjectLines = doc.splitTextToSize(entry.subject, contentWidth)
          subjectLines.forEach((line: string) => {
            doc.text(line, margin, yPos)
            yPos += 8
          })

          // Meta line
          doc.setFontSize(10)
          doc.setFont('helvetica', 'italic')
          let metaLine = entry.date
          if (entry.direction) metaLine += ` | ${entry.direction}`
          if (entry.type) metaLine += ` | ${entry.type}`
          metaLine += ` | ${entry.contactName}`
          if (entry.contactRole) metaLine += `, ${entry.contactRole}`

          const metaLines = doc.splitTextToSize(metaLine, contentWidth)
          metaLines.forEach((line: string) => {
            checkPageBreak(6)
            doc.text(line, margin, yPos)
            yPos += 5
          })
          yPos += 5

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
