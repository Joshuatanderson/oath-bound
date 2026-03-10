import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import {
  UserX,
  UserCheck,
  ShieldOff,
  ShieldCheck,
  TriangleAlert,
  Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ScaleHero from "@/components/scale-hero";
import { CopyCommand } from "@/components/copy-command";

const rows: {
  bad: { icon: LucideIcon; text: string };
  good: { icon: LucideIcon; text: string };
}[] = [
  {
    bad: { icon: UserX, text: "Your agents trust code from strangers" },
    good: {
      icon: UserCheck,
      text: "Every developer verified by government ID",
    },
  },
  {
    bad: {
      icon: ShieldOff,
      text: "No review before execution",
    },
    good: {
      icon: ShieldCheck,
      text: "Independent security audits on every skill",
    },
  },
  {
    bad: {
      icon: TriangleAlert,
      text: "Malicious updates inherit full trust",
    },
    good: {
      icon: Lock,
      text: "Every audit locked to the exact code reviewed.",
    },
  },
];

export default function Home() {
  return (
    <>
      <ScaleHero />

      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col px-6 py-10">
        {/* Hero */}
        <div className="flex flex-col items-center justify-center pt-24 pb-16 text-center sm:pt-32">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              <Image
                src="/oathbound-mid-teal-on-white.svg"
                alt=""
                width={56}
                height={56}
                priority
              />
              <h1 className="text-7xl font-extralight tracking-normal text-teal-4">
                Oathbound
              </h1>
            </div>
            <p className="max-w-md text-lg font-light tracking-normal text-white">
              Verified developers. Audited skills. Cryptographic proof.
            </p>
            <div className="flex gap-3 pt-2">
              <Button asChild size="lg">
                <Link href="/submit">Submit a skill</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/skills">View skills</Link>
              </Button>
            </div>
            <div className="w-full max-w-sm pt-6">
              <CopyCommand command="npx oathbound init" />
            </div>
          </div>
        </div>

        {/* Comparison cards */}
        <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
          <Card className="flex flex-col gap-6 border-white/10 bg-zinc-900/40 p-8 backdrop-blur-md">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              Without Oathbound
            </h2>
            <div className="flex flex-col gap-4">
              {rows.map((row, i) => (
                <div key={i} className="flex min-h-14 items-center gap-4">
                  <row.bad.icon className="h-5 w-5 shrink-0 text-red-400" />
                  <p className="text-sm text-zinc-300">{row.bad.text}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-6 border-white/10 bg-zinc-900/40 p-8 backdrop-blur-md">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
              With Oathbound
            </h2>
            <div className="flex flex-col gap-4">
              {rows.map((row, i) => (
                <div key={i} className="flex min-h-14 items-center gap-4">
                  <row.good.icon className="h-5 w-5 shrink-0 text-teal-3" />
                  <p className="text-sm text-zinc-300">{row.good.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}
