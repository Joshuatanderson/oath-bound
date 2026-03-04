"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AuditForm({ skillId }: { skillId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [passed, setPassed] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a PDF file");
      return;
    }
    if (passed === null) {
      setError("Please select a pass or fail verdict");
      return;
    }

    setSubmitting(true);

    const formData = new FormData();
    formData.append("skill_id", skillId);
    formData.append("passed", String(passed));
    formData.append("file", file);

    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setSubmitting(false);

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      setSuccess(true);
      setPassed(null);
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
      return;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Audit report (PDF)</Label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && file.type !== "application/pdf") {
              setError("Only PDF files are accepted");
              e.target.value = "";
              setFileName(null);
              return;
            }
            setError(null);
            setFileName(file?.name ?? null);
          }}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Verdict</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={passed === true ? "default" : "outline"}
            onClick={() => setPassed(true)}
          >
            Pass
          </Button>
          <Button
            type="button"
            size="sm"
            variant={passed === false ? "destructive" : "outline"}
            onClick={() => setPassed(false)}
          >
            Fail
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className="text-sm text-success">
          Audit submitted and pinned to IPFS.
        </p>
      )}

      <Button type="submit" disabled={submitting || !fileName || passed === null}>
        {submitting ? "Uploading..." : "Submit Audit"}
      </Button>
    </form>
  );
}
