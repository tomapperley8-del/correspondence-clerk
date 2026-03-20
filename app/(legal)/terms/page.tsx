export const metadata = {
  title: 'Terms of Service - Correspondence Clerk',
  description: 'Terms of Service for Correspondence Clerk',
}

export default function TermsPage() {
  return (
    <div className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString('en-GB')}</p>

      <div className="bg-white border-2 border-gray-800 p-8 space-y-6">
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p className="text-gray-700">
            By accessing or using Correspondence Clerk (&quot;the Service&quot;), you agree to be bound
            by these Terms of Service. If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Service</h2>
          <p className="text-gray-700">
            Correspondence Clerk is a business correspondence management tool that helps users
            organize, format, and store business communications. The Service includes AI-powered
            formatting, email import capabilities, and export features.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">3. User Accounts</h2>
          <p className="text-gray-700 mb-2">
            To use the Service, you must create an account. You are responsible for:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized access</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">4. Acceptable Use</h2>
          <p className="text-gray-700 mb-2">You agree not to:</p>
          <ul className="list-disc list-inside text-gray-700 space-y-1">
            <li>Use the Service for any illegal purpose</li>
            <li>Upload malicious content or code</li>
            <li>Attempt to gain unauthorized access to the Service</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Violate the rights of other users</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">5. Data and Privacy</h2>
          <p className="text-gray-700">
            Your use of the Service is also governed by our Privacy Policy. You retain ownership
            of any data you upload to the Service. We will not access, use, or share your data
            except as described in our Privacy Policy or as required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">6. Subscription and Payment</h2>
          <p className="text-gray-700">
            Some features of the Service require a paid subscription. By subscribing, you agree
            to pay all applicable fees. Subscriptions renew automatically unless cancelled.
            Refund requests are handled according to our refund policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">7. Trial Period</h2>
          <p className="text-gray-700">
            New users may be eligible for a free trial period. During the trial, you will have
            access to the Service with limited features or usage caps. At the end of the trial,
            you must subscribe to continue using the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">8. AI Features</h2>
          <p className="text-gray-700">
            The Service uses artificial intelligence to format correspondence. While we strive
            for accuracy, AI-generated formatting may not always be perfect. You are responsible
            for reviewing and verifying all formatted content before use.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">9. Intellectual Property</h2>
          <p className="text-gray-700">
            The Service, including its design, features, and content (excluding user data), is
            owned by Correspondence Clerk. You may not copy, modify, or distribute any part of
            the Service without our permission.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">10. Limitation of Liability</h2>
          <p className="text-gray-700">
            To the maximum extent permitted by law, Correspondence Clerk shall not be liable for
            any indirect, incidental, special, consequential, or punitive damages arising from
            your use of the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">11. Disclaimer of Warranties</h2>
          <p className="text-gray-700">
            The Service is provided &quot;as is&quot; without warranties of any kind, either express
            or implied. We do not guarantee that the Service will be uninterrupted, error-free,
            or secure.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">12. Termination</h2>
          <p className="text-gray-700">
            We may terminate or suspend your account at any time for violation of these terms.
            You may terminate your account at any time by contacting us. Upon termination, your
            right to use the Service will immediately cease.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">13. Changes to Terms</h2>
          <p className="text-gray-700">
            We may modify these terms at any time. We will notify users of significant changes.
            Your continued use of the Service after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">14. Governing Law</h2>
          <p className="text-gray-700">
            These terms are governed by the laws of England and Wales. Any disputes shall be
            resolved in the courts of England and Wales.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">15. Contact</h2>
          <p className="text-gray-700">
            For questions about these Terms of Service, please contact us at{' '}
            <a
              href="mailto:legal@correspondenceclerk.com"
              className="text-blue-600 hover:underline"
            >
              legal@correspondenceclerk.com
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}
