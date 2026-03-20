'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Template {
  id: string
  title: string
  description: string
  category: string
  content: string
}

const TEMPLATES: Template[] = [
  {
    id: 'follow-up',
    title: 'Follow-up after meeting',
    description: 'Thank someone for their time and confirm next steps',
    category: 'General',
    content: `Dear [Name],

Thank you for taking the time to meet with me [today/yesterday/on DATE].

I appreciated the opportunity to discuss [TOPIC]. As we agreed, the next steps are:

[LIST AGREED ACTIONS]

Please let me know if you have any questions or if anything needs clarifying.

Best regards,
[Your name]`,
  },
  {
    id: 'project-update',
    title: 'Project status update',
    description: 'Update a client on project progress',
    category: 'Client',
    content: `Dear [Name],

I wanted to update you on the progress of [PROJECT NAME].

Current status:
[BRIEF SUMMARY OF PROGRESS]

Completed since last update:
- [ITEM 1]
- [ITEM 2]

Next steps:
- [ITEM 1]
- [ITEM 2]

Please let me know if you have any questions or would like to discuss further.

Best regards,
[Your name]`,
  },
  {
    id: 'invoice-reminder',
    title: 'Invoice payment reminder',
    description: 'Politely chase an overdue payment',
    category: 'Finance',
    content: `Dear [Name],

I hope this finds you well.

I'm writing regarding invoice [NUMBER] dated [DATE] for [AMOUNT]. According to our records, this invoice is now [X] days overdue.

I understand that payments can sometimes be delayed, so I wanted to check whether there are any issues with this invoice.

If you have already arranged payment, please disregard this message. Otherwise, I would be grateful if you could arrange payment at your earliest convenience.

Please don't hesitate to contact me if you have any queries.

Best regards,
[Your name]`,
  },
  {
    id: 'scope-change',
    title: 'Scope change request',
    description: 'Document a change to agreed work',
    category: 'Client',
    content: `Dear [Name],

Following our conversation on [DATE], I'm writing to confirm the requested changes to [PROJECT/WORK DESCRIPTION].

Original scope:
[BRIEF DESCRIPTION]

Requested changes:
[LIST CHANGES]

Impact:
- Timeline: [IMPACT]
- Cost: [IMPACT]

Please confirm you're happy to proceed on this basis by replying to this email.

Best regards,
[Your name]`,
  },
  {
    id: 'introduction',
    title: 'Introduction email',
    description: 'Introduce yourself to a new contact',
    category: 'General',
    content: `Dear [Name],

[MUTUAL CONTACT] suggested I get in touch with you.

I'm [YOUR NAME], [BRIEF DESCRIPTION OF WHAT YOU DO]. [MUTUAL CONTACT] mentioned you might be [REASON FOR INTRODUCTION].

I'd welcome the opportunity to [SUGGESTED ACTION - e.g., have a brief call / meet for coffee / discuss how we might work together].

Would you have time for a [DURATION] [call/meeting] in the next couple of weeks?

Best regards,
[Your name]`,
  },
  {
    id: 'thank-you',
    title: 'Thank you letter',
    description: 'Express gratitude professionally',
    category: 'General',
    content: `Dear [Name],

I wanted to take a moment to thank you for [SPECIFIC REASON].

[BRIEF EXPLANATION OF WHY IT MATTERED/IMPACT]

I really appreciate [WHAT YOU APPRECIATE].

Best regards,
[Your name]`,
  },
  {
    id: 'complaint-response',
    title: 'Response to complaint',
    description: 'Acknowledge and address a client complaint',
    category: 'Client',
    content: `Dear [Name],

Thank you for bringing [ISSUE] to my attention.

I'm sorry to hear about [BRIEF ACKNOWLEDGMENT OF PROBLEM]. I understand this must have been [frustrating/disappointing/inconvenient].

[EXPLANATION IF APPROPRIATE - but avoid making excuses]

To resolve this, I will [PROPOSED SOLUTION/NEXT STEPS].

I value your business and want to ensure you're satisfied with [OUR WORK/SERVICE]. Please don't hesitate to contact me directly if you have any further concerns.

Best regards,
[Your name]`,
  },
  {
    id: 'contract-terms',
    title: 'Confirming contract terms',
    description: 'Summarise agreed terms before starting work',
    category: 'Client',
    content: `Dear [Name],

Following our discussions, I'm writing to confirm the terms of our agreement before we proceed.

Scope of work:
[DESCRIPTION]

Timeline:
[KEY DATES/MILESTONES]

Fees:
[AMOUNT AND PAYMENT TERMS]

Additional terms:
[ANY OTHER AGREED TERMS]

Please confirm you're happy with the above by replying to this email. Once confirmed, I'll [NEXT STEP].

Best regards,
[Your name]`,
  },
]

export default function LetterTemplatesPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [email, setEmail] = useState('')
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!selectedTemplate) return

    try {
      await navigator.clipboard.writeText(selectedTemplate.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textArea = document.createElement('textarea')
      textArea.value = selectedTemplate.content
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    try {
      await fetch('/api/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'letter_templates',
        }),
      })
    } catch {
      // Silent fail
    }
    setEmailSubmitted(true)
  }

  const categories = [...new Set(TEMPLATES.map((t) => t.category))]

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-lg font-medium">
              Correspondence Clerk
            </Link>
            <Link
              href="/signup"
              className="text-sm bg-gray-900 text-white px-4 py-2 hover:bg-gray-800"
            >
              Try free
            </Link>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-medium text-gray-900 mb-2">
            Letter Templates
          </h1>
          <p className="text-gray-600 mb-8">
            Free templates for common business correspondence. Copy and customise.
          </p>

          {!selectedTemplate ? (
            // Template list
            <div className="space-y-8">
              {categories.map((category) => (
                <div key={category}>
                  <h2 className="text-sm font-medium text-gray-500 mb-3">
                    {category}
                  </h2>
                  <div className="space-y-2">
                    {TEMPLATES.filter((t) => t.category === category).map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className="w-full text-left p-4 border border-gray-200 hover:border-gray-400"
                      >
                        <h3 className="font-medium text-gray-900">
                          {template.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {template.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Selected template
            <div>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-sm text-gray-600 hover:text-gray-900 mb-4"
              >
                ← Back to templates
              </button>

              <h2 className="text-xl font-medium text-gray-900 mb-2">
                {selectedTemplate.title}
              </h2>
              <p className="text-gray-600 mb-6">
                {selectedTemplate.description}
              </p>

              <div className="p-4 bg-gray-50 border border-gray-200 whitespace-pre-wrap font-mono text-sm mb-4">
                {selectedTemplate.content}
              </div>

              <button
                onClick={handleCopy}
                className="bg-gray-900 text-white px-4 py-2 hover:bg-gray-800"
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>

              {/* Email capture */}
              {!emailSubmitted && (
                <div className="mt-8 p-4 bg-gray-50 border border-gray-200">
                  <p className="text-sm text-gray-700 mb-3">
                    Want to save your correspondence somewhere searchable? Correspondence Clerk keeps all your important client emails organised.
                  </p>
                  <form onSubmit={handleEmailSubmit} className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email"
                      className="flex-1 px-3 py-2 border border-gray-300 text-sm focus:border-gray-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800"
                    >
                      Try free
                    </button>
                  </form>
                  <p className="text-xs text-gray-400 mt-2">
                    14-day trial. No card required.
                  </p>
                </div>
              )}

              {emailSubmitted && (
                <div className="mt-8 p-4 bg-green-50 border border-green-200">
                  <p className="text-sm text-green-800">
                    Thanks! Check your email to get started.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-100 mt-12">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-sm text-gray-400">
          <span>Correspondence Clerk</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-gray-600">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
