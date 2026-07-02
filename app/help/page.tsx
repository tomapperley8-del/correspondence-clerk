import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help | Correspondence Clerk',
  description: 'How to use Correspondence Clerk',
}

export default function HelpPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold text-brand-dark mb-6">Help</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-brand-dark mb-3">Inbox</h2>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          The inbox shows inbound emails that have been forwarded to Correspondence Clerk. Each item can be filed to a business and contact, or dismissed if not relevant.
        </p>
        <ul className="text-sm text-gray-700 space-y-2 list-disc ml-5">
          <li>Emails arrive automatically when forwarded to your inbound address (see Settings &gt; Email)</li>
          <li>Click an item to see the full content, then file it to the right business and contact</li>
          <li>Once filed, the email appears on that business&apos;s page as correspondence</li>
          <li>You can also add correspondence manually via + New Entry</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-brand-dark mb-3">To-dos</h2>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          The To-dos page is the main dashboard. It has four views you can switch between:
        </p>
        <ul className="text-sm text-gray-700 space-y-2 list-disc ml-5">
          <li><strong>Tasks</strong> &mdash; your to-do list. Add tasks with a title and optional due date. Overdue tasks appear at the top. You can also create tasks directly from correspondence on a business page.</li>
          <li><strong>Calendar</strong> &mdash; a calendar view of your tasks by due date.</li>
          <li><strong>CC/Advertising</strong> &mdash; the renewals pipeline. Shows businesses with Club Card or Advertiser contracts, organised by renewal stage. Drag cards between stages or use the dropdown. You can add businesses and track contract expiry dates.</li>
          <li><strong>Outreach</strong> &mdash; the outreach pipeline for prospecting new businesses. Add prospects, then move them through stages from Identified to Won. Businesses that reach Invoice Paid are promoted to the CC/Advertising pipeline.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-brand-dark mb-3">Pipeline dates</h2>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          Both pipelines track when each business entered its current stage. A days counter shows how long they&apos;ve been there (highlights amber after 30 days). Click the date on a card to edit it manually.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-brand-dark mb-3">Business pages</h2>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          Each business has a detail page showing all correspondence, contacts, files, and pipeline status. From here you can:
        </p>
        <ul className="text-sm text-gray-700 space-y-2 list-disc ml-5">
          <li>Add the business to the outreach or CC/Advertising pipeline</li>
          <li>See and change the current pipeline stage</li>
          <li>Add correspondence, contacts, and files</li>
          <li>Create tasks linked to specific correspondence</li>
        </ul>
      </section>
    </div>
  )
}
