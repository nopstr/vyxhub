import { Link } from 'react-router-dom'
import { ArrowLeft, Shield } from 'lucide-react'
import { APP_NAME } from '../../lib/constants'

export default function CompliancePage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-indigo-600/10">
          <Shield size={24} className="text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">18 U.S.C. § 2257 Compliance Notice</h1>
          <p className="text-sm text-zinc-500">Record-Keeping Requirements Statement</p>
        </div>
      </div>

      <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-sm text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white">Compliance Statement</h2>
          <p>
            All visual content appearing on {APP_NAME} (the "Platform") is produced by third-party
            content creators ("Creators") who are required, as a condition of using the Platform,
            to comply with the record-keeping requirements of 18 U.S.C. § 2257 and the regulations
            promulgated thereunder (28 C.F.R. Part 75).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Creator Responsibilities</h2>
          <p>
            Each Creator is the "producer" of their own content as defined by 18 U.S.C. § 2257.
            Each Creator certifies that:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-zinc-400">
            <li>All performers depicted were at least 18 years of age at the time of production.</li>
            <li>Valid government-issued photo identification was verified for each performer before content creation.</li>
            <li>Required age verification records are maintained by the Creator as mandated by law.</li>
            <li>The Creator assumes full legal responsibility for maintaining 2257-compliant records.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Platform Verification</h2>
          <p>
            {APP_NAME} requires all Creators to complete identity verification with a valid
            government-issued photo ID before publishing any content. This verification
            process includes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-zinc-400">
            <li>Upload and review of a government-issued photo ID (passport, driver's license, or national ID).</li>
            <li>A selfie with the ID document to confirm identity.</li>
            <li>Date of birth verification confirming the Creator is at least 18 years old.</li>
            <li>Records are stored securely and retained as required by applicable law.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Custodian of Records</h2>
          <p>
            Records required pursuant to 18 U.S.C. § 2257 and 28 C.F.R. Part 75 for
            content appearing on this Platform are maintained by the respective content
            Creators who produced such content.
          </p>
          <p>
            Platform-level verification records are maintained by:
          </p>
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 mt-3">
            <p className="font-medium text-white">{APP_NAME} — Custodian of Records</p>
            <p className="text-zinc-500 text-xs mt-1">
              Contact: compliance@vyxhub.com
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Exemptions</h2>
          <p>
            Content that does not depict actual or simulated sexually explicit conduct
            (as defined by 18 U.S.C. § 2256) is exempt from the record-keeping
            requirements of 18 U.S.C. § 2257.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">DMCA / Content Removal</h2>
          <p>
            To request removal of content you believe violates your rights, or to
            report content that may not comply with applicable law, please contact
            our compliance team at <strong className="text-white">compliance@vyxhub.com</strong>.
          </p>
        </section>

        <p className="text-xs text-zinc-600 border-t border-zinc-800/50 pt-4">
          Last updated: February 19, 2026
        </p>
      </div>
    </div>
  )
}
