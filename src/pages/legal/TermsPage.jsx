import { Link } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import { APP_NAME, PLATFORM_FEE_PERCENT } from '../../lib/constants'

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-indigo-600/10">
          <FileText size={24} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Terms of Service</h1>
          <p className="text-sm text-zinc-500">{APP_NAME}</p>
        </div>
      </div>

      <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-sm text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white">1. Acceptance of Terms</h2>
          <p>
            By accessing or using {APP_NAME} ("the Platform"), you agree to be bound by these
            Terms of Service ("Terms"). If you do not agree, you must not use the Platform.
            You must be at least 18 years of age to use this Platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">2. Account Registration</h2>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>You must provide accurate and complete information when creating an account.</li>
            <li>You are responsible for maintaining the confidentiality of your credentials.</li>
            <li>You must not create accounts for anyone under 18 years of age.</li>
            <li>One account per person. Duplicate or fake accounts will be terminated.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">3. Creator Accounts</h2>
          <p>To become a Creator, you must:</p>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Complete identity verification with a valid government-issued photo ID.</li>
            <li>Confirm you are at least 18 years of age.</li>
            <li>Agree to maintain 18 U.S.C. § 2257 compliant records for all content you produce.</li>
            <li>Only upload content you have the legal right to distribute.</li>
            <li>Certify that all individuals depicted in your content are at least 18 years old.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">4. Prohibited Content</h2>
          <p>You must not upload, share, or distribute content that:</p>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Depicts minors in any context.</li>
            <li>Contains non-consensual acts or revenge content.</li>
            <li>Promotes violence, hate, or discrimination.</li>
            <li>Infringes on intellectual property rights of others.</li>
            <li>Contains illegal activity or promotes illegal behavior.</li>
            <li>Violates any applicable local, state, national, or international law.</li>
          </ul>
          <p className="mt-2">
            Violations will result in immediate account termination and may be reported to
            law enforcement.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">5. Payments & Fees</h2>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>The Platform charges a {PLATFORM_FEE_PERCENT}% fee on all creator earnings (subscriptions, tips, PPV).</li>
            <li>Creators receive {100 - PLATFORM_FEE_PERCENT}% of gross revenue.</li>
            <li>All transactions are processed through our third-party payment partner.</li>
            <li>Payouts are subject to minimum thresholds and processing schedules.</li>
            <li>Chargebacks and fraudulent transactions may result in account holds.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">6. Subscriptions & Purchases</h2>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Subscriptions auto-renew unless cancelled before the billing period ends.</li>
            <li>Pay-per-view purchases are one-time and non-refundable once content is accessed.</li>
            <li>Tips are voluntary and non-refundable.</li>
            <li>Refund requests are handled on a case-by-case basis.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">7. Intellectual Property</h2>
          <p>
            Creators retain ownership of their content. By uploading to the Platform, you
            grant {APP_NAME} a non-exclusive, worldwide, royalty-free license to host, display,
            and distribute your content solely in connection with operating the Platform.
            This license terminates when you delete your content or account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">8. DMCA Policy</h2>
          <p>
            We respect intellectual property rights and respond to valid DMCA takedown notices.
            To submit a takedown request, contact <strong className="text-white">compliance@vyxhub.com</strong> with
            the required information as specified under 17 U.S.C. § 512(c).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">9. Termination</h2>
          <p>
            We may suspend or terminate accounts that violate these Terms, at our sole discretion.
            Users may delete their accounts at any time through Settings. Upon termination,
            your right to use the Platform ceases immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">10. Disclaimer of Warranties</h2>
          <p>
            The Platform is provided "as is" and "as available" without warranties of any kind,
            either express or implied. We do not guarantee uninterrupted or error-free service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, {APP_NAME} shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from
            your use of the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">12. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. Continued use of the Platform after
            changes constitutes acceptance. We will notify users of material changes via
            email or in-app notification.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">13. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{' '}
            <strong className="text-white">legal@vyxhub.com</strong>
          </p>
        </section>

        <p className="text-xs text-zinc-600 border-t border-zinc-800/50 pt-4">
          Last updated: February 19, 2026
        </p>
      </div>
    </div>
  )
}
