export const metadata = {
  title: 'Privacy Policy - Correspondence Clerk',
  description: 'Privacy Policy for Correspondence Clerk',
}

export default function PrivacyPage() {
  return (
    <div className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString('en-GB')}</p>

      <div className="bg-white border-2 border-gray-800 p-8 space-y-6">
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">1. Introduction</h2>
          <p className="text-gray-700">
            Correspondence Clerk (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting
            your privacy. This Privacy Policy explains how we collect, use, and protect your
            personal information when you use our service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">2. Information We Collect</h2>
          <p className="text-gray-700 mb-3">We collect the following types of information:</p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">Account Information</h3>
          <ul className="list-disc list-inside text-gray-700 space-y-1 mb-3">
            <li>Email address</li>
            <li>Display name</li>
            <li>Organization name</li>
            <li>Password (encrypted)</li>
          </ul>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">Correspondence Data</h3>
          <ul className="list-disc list-inside text-gray-700 space-y-1 mb-3">
            <li>Business names and contact information you enter</li>
            <li>Correspondence content you upload or paste</li>
            <li>Formatted versions of your correspondence</li>
            <li>Notes and metadata you add</li>
          </ul>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">Usage Data</h3>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>IP address</li>
            <li>Browser type and version</li>
            <li>Pages visited and features used</li>
            <li>Date and time of access</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">3. How We Use Your Information</h2>
          <p className="text-gray-700 mb-2">We use your information to:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Provide and maintain the Service</li>
            <li>Process your correspondence using AI formatting</li>
            <li>Communicate with you about your account</li>
            <li>Send billing and payment notifications</li>
            <li>Improve and optimize the Service</li>
            <li>Detect and prevent fraud or abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">4. AI Processing</h2>
          <p className="text-gray-700">
            When you use our AI formatting feature, your correspondence content is sent to
            our AI provider (Anthropic) for processing. This data is used solely to generate
            formatted output and is not used to train AI models. We select providers with
            strong privacy commitments and data processing agreements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">5. Data Storage and Security</h2>
          <p className="text-gray-700 mb-2">
            Your data is stored securely using industry-standard measures:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Data is encrypted in transit (TLS/SSL)</li>
            <li>Data is encrypted at rest</li>
            <li>Access is controlled through authentication</li>
            <li>Regular security audits and updates</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">6. Data Sharing</h2>
          <p className="text-gray-700 mb-2">
            We do not sell your personal information. We may share data with:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Service providers who help operate the Service (hosting, payment processing)</li>
            <li>AI providers for correspondence formatting (Anthropic)</li>
            <li>Law enforcement when required by law</li>
            <li>Other parties with your explicit consent</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">7. Data Retention</h2>
          <p className="text-gray-700">
            We retain your data for as long as your account is active. If you delete your
            account, we will delete your data within 30 days, except where we are required
            to retain it for legal or compliance purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">8. Your Rights</h2>
          <p className="text-gray-700 mb-2">Under applicable data protection laws, you have the right to:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your data (&quot;right to be forgotten&quot;)</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict certain processing</li>
            <li>Withdraw consent where processing is based on consent</li>
          </ul>
          <p className="text-gray-700 mt-2">
            To exercise these rights, contact us at{' '}
            <a
              href="mailto:privacy@correspondenceclerk.com"
              className="text-blue-600 hover:underline"
            >
              privacy@correspondenceclerk.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">9. Cookies</h2>
          <p className="text-gray-700">
            We use essential cookies to maintain your session and preferences. We do not
            use tracking or advertising cookies. By using the Service, you consent to our
            use of essential cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">10. International Transfers</h2>
          <p className="text-gray-700">
            Your data may be transferred to and processed in countries outside your country
            of residence. We ensure appropriate safeguards are in place for such transfers,
            including standard contractual clauses where required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">11. Children&apos;s Privacy</h2>
          <p className="text-gray-700">
            The Service is not intended for users under the age of 16. We do not knowingly
            collect personal information from children. If we learn we have collected such
            information, we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">12. Changes to This Policy</h2>
          <p className="text-gray-700">
            We may update this Privacy Policy from time to time. We will notify you of
            significant changes by email or through the Service. Your continued use after
            changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">13. Contact Us</h2>
          <p className="text-gray-700">
            For questions about this Privacy Policy or our data practices, contact us at:{' '}
            <a
              href="mailto:privacy@correspondenceclerk.com"
              className="text-blue-600 hover:underline"
            >
              privacy@correspondenceclerk.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">14. Data Protection Officer</h2>
          <p className="text-gray-700">
            For GDPR-related inquiries, you may contact our Data Protection Officer at:{' '}
            <a
              href="mailto:dpo@correspondenceclerk.com"
              className="text-blue-600 hover:underline"
            >
              dpo@correspondenceclerk.com
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
