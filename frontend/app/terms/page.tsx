export const metadata = {
  title: "Terms of Service | Oath Bound",
};

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: March 2, 2026
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Oath Bound, you agree to be bound by these
            Terms of Service. If you do not agree, do not use the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Description of Service</h2>
          <p>
            Oath Bound is a skills attestation protocol that allows users to
            upload, validate, and share skills. The service is provided
            &ldquo;as is&rdquo; and may change at any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. User Accounts</h2>
          <p>
            You are responsible for maintaining the security of your account
            credentials and for all activity that occurs under your account. You
            must provide accurate information when creating an account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. User Content</h2>
          <p>
            You retain ownership of content you upload to Oath Bound. By
            uploading content, you grant us a license to store, display, and
            distribute that content as necessary to operate the service. You are
            solely responsible for ensuring your content does not violate any
            laws or third-party rights.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Prohibited Conduct</h2>
          <p>
            You may not use the service to upload malicious code, impersonate
            others, violate any applicable laws, or interfere with the operation
            of the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by law, Oath Bound and its operators
            shall not be liable for any indirect, incidental, special, or
            consequential damages arising from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to the
            service at any time, with or without cause or notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Changes to Terms</h2>
          <p>
            We may modify these terms at any time. Continued use of the service
            after changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Contact</h2>
          <p>
            If you have questions about these terms, please contact us via the
            project repository.
          </p>
        </section>
      </div>
    </main>
  );
}
