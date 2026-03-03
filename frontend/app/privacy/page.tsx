export const metadata = {
  title: "Privacy Policy | Oathbound",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: March 2, 2026
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">
            1. Information We Collect
          </h2>
          <p>
            When you use Oathbound, we may collect information you provide
            directly, such as your name, email address, and any content you
            upload or submit. We also collect basic usage data such as pages
            visited and actions taken within the application.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            2. How We Use Your Information
          </h2>
          <p>
            We use the information we collect to operate and improve Oathbound,
            authenticate users, and communicate with you about the service. We
            do not sell your personal information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Data Storage</h2>
          <p>
            Your data is stored securely using industry-standard practices. We
            use third-party services (such as Supabase) for authentication and
            data storage, which maintain their own security and privacy
            practices.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Cookies</h2>
          <p>
            We use cookies and similar technologies to maintain your session and
            preferences. These are essential for the application to function
            properly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            5. Third-Party Services
          </h2>
          <p>
            We may use third-party services for authentication (e.g., Google
            Sign-In). These services have their own privacy policies governing
            the use of your information.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Your Rights</h2>
          <p>
            You may request access to, correction of, or deletion of your
            personal data at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            7. Changes to This Policy
          </h2>
          <p>
            We may update this privacy policy from time to time. We will notify
            you of any material changes by posting the updated policy on this
            page.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Contact</h2>
          <p>
            If you have questions about this privacy policy, please contact us
            via the project repository.
          </p>
        </section>
      </div>
    </main>
  );
}
