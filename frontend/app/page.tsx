import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, PenTool, ScanEye, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10">
      {/* Hero + How it works — all above the fold */}
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <Shield className="h-14 w-14 text-primary" />
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Oathbound
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Verifiably safe skills for the agent economy
          </p>
          <div className="flex gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="/submit">Submit a skill</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/skills">View skills</Link>
            </Button>
          </div>
        </div>

        <div className="grid w-full gap-6 sm:grid-cols-3">
          {[
            {
              icon: PenTool,
              title: "Create skills",
              description:
                "Authors publish structured AI skills with clear metadata, licensing, and intent.",
            },
            {
              icon: ScanEye,
              title: "Audit & attest",
              description:
                "Skills are tied to real-world identities and reviewed through formal audits.",
            },
            {
              icon: ShieldCheck,
              title: "Verify at runtime",
              description:
                "Every skill is cryptographically verified before execution — no trust required.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 text-center"
            >
              <Icon className="h-6 w-6 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
