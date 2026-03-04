import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Shield,
  UserX,
  UserCheck,
  ShieldOff,
  ShieldCheck,
  RefreshCw,
  Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const rows: {
  bad: { icon: LucideIcon; text: string };
  good: { icon: LucideIcon; text: string };
}[] = [
  {
    bad: { icon: UserX, text: "Pseudonymous authors behind usernames" },
    good: { icon: UserCheck, text: "Every author verified by government ID" },
  },
  {
    bad: {
      icon: ShieldOff,
      text: "No review before your agent executes a skill",
    },
    good: {
      icon: ShieldCheck,
      text: "Independent skill security audits",
    },
  },
  {
    bad: {
      icon: RefreshCw,
      text: "A version bump silently inherits all prior trust",
    },
    good: {
      icon: Lock,
      text: "Change one byte, the audit no longer applies",
    },
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col px-6 py-10">
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

        {/* Comparison cards */}
        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Today card */}
          <Card className="flex flex-col gap-6 p-8">
            <h2 className="text-2xl font-bold tracking-tight">
              Without Oathbound
            </h2>
            <div className="flex flex-col gap-4">
              {rows.map((row, i) => (
                <div key={i} className="flex min-h-14 items-center gap-4">
                  <row.bad.icon className="h-5 w-5 shrink-0 text-red-500" />
                  <p className="text-sm">{row.bad.text}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* With Oathbound card */}
          <Card className="flex flex-col gap-6 p-8">
            <h2 className="text-2xl font-bold tracking-tight">
              With Oathbound
            </h2>
            <div className="flex flex-col gap-4">
              {rows.map((row, i) => (
                <div key={i} className="flex min-h-14 items-center gap-4">
                  <row.good.icon className="h-5 w-5 shrink-0 text-teal-5" />
                  <p className="text-sm">{row.good.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
