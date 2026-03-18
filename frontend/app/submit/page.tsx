"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { User } from "@supabase/supabase-js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ExternalLink, ShieldCheck, Lock } from "lucide-react";
import {
  validateSkill,
  VALID_LICENSES,
  MAX_UPLOAD_SIZE,
  MAX_FILE_COUNT,
  isOpenSourceLicense,
  type SkillFile,
  type ValidationCheck,
  type ParsedSkill,
} from "@/lib/skill-validator";
import { getBrowserClient } from "@/lib/supabase.client";

const supabase = getBrowserClient();

// ---------------------------------------------------------------------------
// Upload state persisted across steps
// ---------------------------------------------------------------------------

interface UploadState {
  files: SkillFile[];
  checks: ValidationCheck[];
  canProceed: boolean;
  parsed: ParsedSkill | null;
}

const EMPTY_UPLOAD: UploadState = {
  files: [],
  checks: [],
  canProceed: false,
  parsed: null,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SubmitPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        fetch("/api/verify/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            setVerified(d?.verified ?? false);
            if (d?.bypassAvailable) setBypassAvailable(true);
          })
          .catch(() => setVerified(false))
          .finally(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    });
  }, []);

  // Form fields (step 2)
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [compatibility, setCompatibility] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [skillBody, setSkillBody] = useState("");
  const [originalAuthor, setOriginalAuthor] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const originalAuthorError = originalAuthor.trim() !== "" && license !== "" && !isOpenSourceLicense(license)
    ? "Original author can only be set for open-source licenses"
    : null;

  // ------ File processing ------

  function applyUpload(files: SkillFile[]) {
    const result = validateSkill(files);
    setUpload({
      files,
      checks: result.checks,
      canProceed: result.canProceed,
      parsed: result.parsed,
    });
  }

  function rejectUpload(message: string) {
    setUpload({
      ...EMPTY_UPLOAD,
      checks: [{ passed: false, message }],
    });
  }

  async function processFiles(fileList: FileList) {
    if (fileList.length > MAX_FILE_COUNT) {
      return rejectUpload(`Too many files: ${fileList.length} (maximum ${MAX_FILE_COUNT})`);
    }
    let totalBytes = 0;
    for (let i = 0; i < fileList.length; i++) {
      totalBytes += fileList[i].size;
    }
    if (totalBytes > MAX_UPLOAD_SIZE) {
      return rejectUpload(
        `Upload too large: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB (maximum ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB)`
      );
    }

    const results: SkillFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const content = await file.text();
      const path = file.webkitRelativePath || file.name;
      results.push({ path, content });
    }
    applyUpload(results);
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const items = e.dataTransfer.items;
    if (!items?.length) return;

    const pending: { file: File; path: string }[] = [];

    async function collectEntry(entry: FileSystemEntry, basePath: string) {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) =>
          (entry as FileSystemFileEntry).file(resolve)
        );
        pending.push({ file, path: `${basePath}/${file.name}` });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(resolve)
        );
        for (const child of entries) {
          await collectEntry(child, `${basePath}/${entry.name}`);
        }
      }
    }

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) {
        if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          const entries = await new Promise<FileSystemEntry[]>((resolve) =>
            reader.readEntries(resolve)
          );
          for (const child of entries) {
            await collectEntry(child, entry.name);
          }
        } else {
          const file = items[i].getAsFile();
          if (file) {
            pending.push({ file, path: file.name });
          }
        }
      }
    }

    if (pending.length > MAX_FILE_COUNT) {
      return rejectUpload(`Too many files: ${pending.length} (maximum ${MAX_FILE_COUNT})`);
    }
    const totalBytes = pending.reduce((sum, p) => sum + p.file.size, 0);
    if (totalBytes > MAX_UPLOAD_SIZE) {
      return rejectUpload(
        `Upload too large: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB (maximum ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB)`
      );
    }

    const allFiles: SkillFile[] = [];
    for (const { file, path } of pending) {
      allFiles.push({ path, content: await file.text() });
    }

    applyUpload(allFiles);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  // ------ Navigation ------

  function goToReview() {
    if (!upload.canProceed || !upload.parsed) return;
    const p = upload.parsed;
    setName(p.name);
    setDescription(p.description);
    setLicense(p.license);
    setCompatibility(p.compatibility);
    setAllowedTools(p.allowedTools);
    setSkillBody(p.body);
    setOriginalAuthor(p.originalAuthor || "");
    setStep(2);
  }

  function goBackToUpload() {
    setStep(1);
  }

  function reset() {
    setUpload(EMPTY_UPLOAD);
    setOriginalAuthor("");
    setStep(1);
  }

  // ------ Submit ------

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [suiDigest, setSuiDigest] = useState<string | null>(null);
  const [suiObjectId, setSuiObjectId] = useState<string | null>(null);

  // Founder bypass
  const [bypassAvailable, setBypassAvailable] = useState(false);
  const [bypassPassword, setBypassPassword] = useState("");
  const [bypassLoading, setBypassLoading] = useState(false);
  const [bypassError, setBypassError] = useState<string | null>(null);

  const canSubmit =
    name.trim() !== "" &&
    description.trim() !== "" &&
    license !== "" &&
    !originalAuthorError &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          license,
          compatibility: compatibility || null,
          allowedTools: allowedTools || null,
          originalAuthor: originalAuthor.trim() || null,
          visibility: isPrivate ? "private" : "public",
          files: upload.files,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }

      setSuiDigest(data.suiDigest ?? null);
      setSuiObjectId(data.suiObjectId ?? null);
      setSubmitted(true);
    } catch {
      setSubmitError("Network error — please try again");
    }

    setSubmitting(false);
  }

  // ------ Render ------

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-16 px-6 py-10">
      {/* Loading state */}
      {authLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {/* Verification gate */}
      {!authLoading && !verified && user && (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Identity verification required
          </h2>
          <p className="text-sm text-muted-foreground">
            You need to verify your identity before you can publish skills on
            Oath Bound.
          </p>
          <Button
            size="lg"
            className="w-fit"
            onClick={() => window.location.assign("/verify?returnTo=/submit")}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Verify identity
          </Button>

          {bypassAvailable && (
            <div className="flex flex-col gap-3 border-t pt-6">
              <h2 className="text-sm font-medium">Founder access</h2>
              <p className="text-sm text-muted-foreground">
                If you were given a founder password, enter it here to skip ID
                verification.
              </p>
              {bypassError && (
                <p className="text-sm text-destructive">{bypassError}</p>
              )}
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Password"
                  value={bypassPassword}
                  onChange={(e) => setBypassPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && bypassPassword) {
                      setBypassLoading(true);
                      setBypassError(null);
                      fetch("/api/verify/bypass", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ password: bypassPassword }),
                      })
                        .then((r) => r.json())
                        .then((d) => {
                          if (d.status === "approved") setVerified(true);
                          else setBypassError(d.error ?? "Bypass failed");
                        })
                        .catch(() => setBypassError("Network error"))
                        .finally(() => setBypassLoading(false));
                    }
                  }}
                />
                <Button
                  disabled={!bypassPassword || bypassLoading}
                  onClick={() => {
                    setBypassLoading(true);
                    setBypassError(null);
                    fetch("/api/verify/bypass", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ password: bypassPassword }),
                    })
                      .then((r) => r.json())
                      .then((d) => {
                        if (d.status === "approved") setVerified(true);
                        else setBypassError(d.error ?? "Bypass failed");
                      })
                      .catch(() => setBypassError("Network error"))
                      .finally(() => setBypassLoading(false));
                  }}
                >
                  {bypassLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step indicator */}
      {!submitted && !authLoading && verified && (
        <div className="flex gap-6 text-sm">
          <span className={step === 1 ? "font-bold" : "text-muted-foreground"}>
            1. Upload
          </span>
          <span className={step === 2 ? "font-bold" : "text-muted-foreground"}>
            2. Review & Edit
          </span>
        </div>
      )}

      {/* Step 1: Upload */}
      {!submitted && verified && step === 1 && (
        <div className="flex flex-col gap-6">
          {/* Expected format */}
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight">
              Skill Format
            </h2>
            <pre className="rounded-lg border border-border bg-muted/50 p-4 text-sm font-mono">
{`skill-name/
├── SKILL.md          (required)
├── scripts/          (convention)
├── references/       (convention)
├── assets/           (convention)
└── ...               (additional files/dirs welcome)`}
            </pre>
            <p className="text-sm text-muted-foreground">
              SKILL.md must include frontmatter with{" "}
              <code className="font-mono">name</code>,{" "}
              <code className="font-mono">description</code>, and{" "}
              <code className="font-mono">license</code>.
              Additional directories and frontmatter fields are welcome — the spec is a floor, not a ceiling.
            </p>
          </div>

          {/* Drop zone / file list */}
          {upload.files.length === 0 ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-sm transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <span className="text-muted-foreground">
                Drop your skill directory here
              </span>
              <span className="text-xs text-muted-foreground">or</span>
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                  onChange={(e) => {
                    if (e.target.files?.length) processFiles(e.target.files);
                  }}
                />
                <span className="text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80">
                  Browse for folder
                </span>
              </label>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* File tree */}
              <Card className="bg-muted/50">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-medium">
                    {upload.files.length} file
                    {upload.files.length !== 1 ? "s" : ""}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                  >
                    Clear
                  </Button>
                </div>
                <div className="p-4">
                  <ul className="flex flex-col gap-1 text-sm font-mono">
                    {upload.files.map((f) => (
                      <li key={f.path} className="text-muted-foreground">
                        {f.path}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>

              {/* Validation results */}
              <Card>
                <div className="border-b border-border px-4 py-3">
                  <span className="text-sm font-medium">Validation</span>
                </div>
                <ul className="flex flex-col gap-1 p-4">
                  {upload.checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={
                          c.passed ? "text-success" : "text-destructive"
                        }
                      >
                        {c.passed ? "\u2713" : "\u2717"}
                      </span>
                      <span
                        className={c.passed ? "text-muted-foreground" : ""}
                      >
                        {c.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Continue button */}
              <Button
                type="button"
                size="lg"
                className="w-fit"
                disabled={!upload.canProceed}
                onClick={goToReview}
              >
                {upload.canProceed ? "Continue" : "Fix errors to continue"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Review & Edit */}
      {!submitted && verified && step === 2 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Review & Edit
          </h2>

          {/* Name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-name">Name *</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-skill"
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens. Max 64 characters.
            </p>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-description">Description *</Label>
            <Textarea
              id="skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this skill do?"
              maxLength={1024}
            />
            <p className="text-xs text-muted-foreground">
              Max 1024 characters.
            </p>
          </div>

          {/* License */}
          <div className="flex flex-col gap-2">
            <Label>License *</Label>
            <Select value={license} onValueChange={setLicense}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a license" />
              </SelectTrigger>
              <SelectContent>
                {VALID_LICENSES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Original Author (optional — open-source only) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-original-author">Original Author</Label>
            <Input
              id="skill-original-author"
              value={originalAuthor}
              onChange={(e) => setOriginalAuthor(e.target.value)}
              placeholder="e.g. Anthropic"
            />
            <p className="text-xs text-muted-foreground">
              Credit the original author when publishing an open-source skill you didn't write.
            </p>
            {originalAuthorError && (
              <p className="text-sm text-destructive">{originalAuthorError}</p>
            )}
          </div>

          {/* Compatibility (optional) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-compat">Compatibility</Label>
            <Input
              id="skill-compat"
              value={compatibility}
              onChange={(e) => setCompatibility(e.target.value)}
              placeholder="e.g. Node 18+, Python 3.10"
              maxLength={500}
            />
          </div>

          {/* Allowed Tools (optional) */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="skill-tools">Allowed Tools</Label>
            <Input
              id="skill-tools"
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              placeholder="e.g. bash read write"
            />
            <p className="text-xs text-muted-foreground">
              Space-delimited list (experimental).
            </p>
          </div>

          {/* Private toggle */}
          <div className="flex items-center gap-3">
            <label htmlFor="skill-private" className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                id="skill-private"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Lock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Private skill — Only visible to you</span>
            </label>
          </div>

          {/* Skill body preview */}
          <div className="flex flex-col gap-2">
            <Label>Skill Content</Label>
            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/50 p-4 font-mono text-xs whitespace-pre-wrap">
              {skillBody}
            </pre>
          </div>

          {/* Error */}
          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={goBackToUpload}
              disabled={submitting}
            >
              Back
            </Button>
            {verified ? (
              <Button type="submit" size="lg" disabled={!canSubmit}>
                {submitting ? "Submitting\u2026" : "Submit Skill"}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={() => window.location.assign("/verify?returnTo=/submit")}
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Verify identity to submit
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Success */}
      {submitted && (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Skill Submitted
          </h2>
          <p className="text-muted-foreground">
            &ldquo;{name}&rdquo; has been saved.
          </p>

          {/* On-chain attestation debug panel */}
          {(suiDigest || suiObjectId) && (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-medium">On-Chain Attestation</h3>
              <div className="flex flex-col gap-2">
                {suiDigest && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Transaction:</span>
                    <a
                      href={`https://suiscan.xyz/testnet/tx/${suiDigest}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                    >
                      {suiDigest}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {suiObjectId && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Object:</span>
                    <a
                      href={`https://suiscan.xyz/testnet/object/${suiObjectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                    >
                      {suiObjectId}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-fit"
            onClick={() => {
              setSubmitted(false);
              setSuiDigest(null);
              setSuiObjectId(null);
              reset();
            }}
          >
            Submit another
          </Button>
        </div>
      )}
    </main>
  );
}
