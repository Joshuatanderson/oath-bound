"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuditForm({ skillId }: { skillId: string }) {
  const [auditorName, setAuditorName] = useState("");
  const [reportPath, setReportPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    const res = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skill_id: skillId,
        auditor_name: auditorName,
        report_path: reportPath || undefined,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }

    setSuccess(true);
    setAuditorName("");
    setReportPath("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="auditorName">Auditor name</Label>
        <Input
          id="auditorName"
          value={auditorName}
          onChange={(e) => setAuditorName(e.target.value)}
          placeholder="e.g. your name or org"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="reportPath">Report URL (optional)</Label>
        <Input
          id="reportPath"
          value={reportPath}
          onChange={(e) => setReportPath(e.target.value)}
          placeholder="https://..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-green-600">Audit submitted successfully.</p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit Audit"}
      </Button>
    </form>
  );
}
