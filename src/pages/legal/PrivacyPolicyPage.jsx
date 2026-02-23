import { Link } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'
import { APP_NAME } from '../../lib/constants'

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-red-600/10">
          <Lock size={24} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Privacy Policy</h1>
          <p className="text-sm text-zinc-500">{APP_NAME}</p>
        </div>
      </div>

      <div className="prose prose-invert prose-zinc max-w-none space-y-6 text-sm text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-white">1. Introduction</h2>
          <p>
            {APP_NAME} ("we", "us", "our") operates the website at heatly.vip (the "Platform").
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information
            when you visit our Platform. By using the Platform, you consent to the data practices
            described in this policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">2. Information We Collect</h2>
          <h3 className="text-base font-semibold text-zinc-200">Personal Information</h3>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Account details: email address, username, display name, password (hashed).</li>
            <li>Profile information: avatar, banner, bio, location (optional).</li>
            <li>Creator verification: legal name, date of birth, government-issued ID, selfie.</li>
            <li>Payment information (processed by third-party payment processors).</li>
          </ul>
          <h3 className="text-base font-semibold text-zinc-200 mt-4">Automatically Collected</h3>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Device and browser information, IP address, access timestamps.</li>
            <li>Usage data: pages viewed, features used, interactions.</li>
            <li>Cookies and similar tracking technologies for authentication and preferences.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">3. How We Use Your Information</h2>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Provide, maintain, and improve the Platform and its features.</li>
            <li>Process creator applications and identity verification.</li>
            <li>Facilitate transactions between creators and subscribers.</li>
            <li>Send notifications, updates, and security alerts.</li>
            <li>Detect, prevent, and address fraud, abuse, and security issues.</li>
            <li>Comply with legal obligations and enforce our Terms of Service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">4. Data Sharing</h2>
          <p>We do not sell your personal information. We may share data with:</p>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li><strong>Service providers:</strong> Supabase (infrastructure), Vercel (hosting), payment processors.</li>
            <li><strong>Legal compliance:</strong> When required by law, regulation, or legal process.</li>
            <li><strong>Safety:</strong> To protect the rights, property, or safety of our users and the public.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">5. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active or as needed to
            provide services. Verification documents are stored securely and retained as required
            by applicable law (including 18 U.S.C. § 2257 record-keeping requirements).
            You may request deletion of your account and associated data at any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">6. Cookies</h2>
          <p>
            We use essential cookies for authentication and session management via Supabase Auth.
            These cookies are necessary for the Platform to function and cannot be disabled.
            We do not use third-party advertising or tracking cookies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-5 space-y-1 text-zinc-400">
            <li>Access, correct, or delete your personal data.</li>
            <li>Object to or restrict processing of your data.</li>
            <li>Data portability (receive your data in a structured format).</li>
            <li>Withdraw consent at any time where processing is based on consent.</li>
          </ul>
          <p className="mt-2">
            <strong className="text-white">GDPR (EU):</strong> EU residents have additional rights under
            the General Data Protection Regulation. Contact us to exercise these rights.
          </p>
          <p>
            <strong className="text-white">CCPA (California):</strong> California residents have the right
            to know what personal information is collected, request deletion, and opt out of sale
            (we do not sell personal information).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">8. Security</h2>
          <p>
            We implement industry-standard security measures including encryption in transit (HTTPS/TLS),
            encrypted storage for sensitive documents, row-level security policies on all database tables,
            and short-lived signed URLs for media access. However, no method of transmission over the
            Internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">9. Children</h2>
          <p>
            This Platform is not intended for anyone under the age of 18. We do not knowingly collect
            personal information from minors. If you believe a minor has provided us with personal
            information, please contact us immediately.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">10. Contact</h2>
          <p>
            For privacy-related questions or to exercise your data rights, contact us at:{' '}
            <strong className="text-white">office@heatly.vip</strong>
          </p>
        </section>

        <p className="text-xs text-zinc-600 border-t border-zinc-800/50 pt-4">
          Last updated: February 19, 2026
        </p>
      </div>
    </div>
  )
}
