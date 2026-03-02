"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@supabase/supabase-js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, Loader2 } from "lucide-react";
import {
  validateSkill,
  VALID_LICENSES,
  ALLOWED_DIRS,
  MAX_UPLOAD_SIZE,
  MAX_FILE_COUNT,
  type SkillFile,
  type ValidationCheck,
  type ParsedSkill,
} from "@/lib/skill-validator";
import { getBrowserClient } from "@/lib/supabase.client";
import { USERNAME_RE } from "@/lib/username";

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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [dragging, setDragging] = useState(false);

  // Username gate state
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameClaiming, setUsernameClaiming] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthLoading(false);
      if (data.user) {
        setUsernameLoading(true);
        fetch("/api/username")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.username) setUsername(d.username);
          })
          .finally(() => setUsernameLoading(false));
      }
    });
  }, []);

  // Debounced username availability check
  useEffect(() => {
    setUsernameAvailable(null);
    setUsernameError(null);

    const trimmed = usernameInput.trim().toLowerCase();
    if (trimmed.length < 3 || !USERNAME_RE.test(trimmed)) return;

    setUsernameChecking(true);
    const timer = setTimeout(() => {
      fetch(`/api/username/check?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((d) => setUsernameAvailable(d.available ?? false))
        .catch(() => setUsernameAvailable(null))
        .finally(() => setUsernameChecking(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      setUsernameChecking(false);
    };
  }, [usernameInput]);

  async function claimUsername() {
    const trimmed = usernameInput.trim().toLowerCase();
    if (!USERNAME_RE.test(trimmed) || !usernameAvailable) return;

    setUsernameClaiming(true);
    setUsernameError(null);

    try {
      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setUsernameError(data.error ?? "Failed to claim username");
        setUsernameClaiming(false);
        return;
      }

      setUsername(data.username);
    } catch {
      setUsernameError("Network error — please try again");
    }

    setUsernameClaiming(false);
  }

  const needsUsername = user && !username && !usernameLoading;

  // Form fields (step 2)
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [license, setLicense] = useState("");
  const [compatibility, setCompatibility] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [skillBody, setSkillBody] = useState("");

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

    // Phase 1: collect File objects with paths (without reading content)
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

    // Phase 2: validate sizes before reading content
    if (pending.length > MAX_FILE_COUNT) {
      return rejectUpload(`Too many files: ${pending.length} (maximum ${MAX_FILE_COUNT})`);
    }
    const totalBytes = pending.reduce((sum, p) => sum + p.file.size, 0);
    if (totalBytes > MAX_UPLOAD_SIZE) {
      return rejectUpload(
        `Upload too large: ${(totalBytes / (1024 * 1024)).toFixed(1)} MB (maximum ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB)`
      );
    }

    // Phase 3: read content
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
    setStep(2);
  }

  function goBackToUpload() {
    setStep(1);
  }

  function reset() {
    setUpload(EMPTY_UPLOAD);
    setStep(1);
  }

  // ------ Submit ------

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    name.trim() !== "" &&
    description.trim() !== "" &&
    license !== "" &&
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
          files: upload.files,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setSubmitError("Network error — please try again");
    }

    setSubmitting(false);
  }

  // ------ Render ------

  return (
    <div className="flex min-h-screen items-start justify-center bg-background font-sans">
      <main className="flex w-full max-w-2xl flex-col gap-16 px-6 py-20">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-bold tracking-tight">Oath Bound</h1>
            {user ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setUser(null);
                  }}
                >
                  Sign out
                </Button>
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    src={user.user_metadata?.avatar_url}
                    alt={user.user_metadata?.full_name ?? "User"}
                  />
                  <AvatarFallback>
                    {user.email?.charAt(0).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <a href="/login">Sign in</a>
              </Button>
            )}
          </div>
          <p className="text-lg text-muted-foreground">
            Attest your skills on-chain. Build trust through verifiable claims.
          </p>
        </div>

        {/* Loading state */}
        {(authLoading || usernameLoading) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {/* Username setup gate */}
        {needsUsername && (
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Choose a username
            </h2>
            <p className="text-sm text-muted-foreground">
              Your username is your namespace for publishing skills. It can&apos;t
              be changed later.
            </p>

            <div className="flex flex-col gap-2">
              <Label htmlFor="username-input">Username</Label>
              <div className="relative">
                <Input
                  id="username-input"
                  value={usernameInput}
                  onChange={(e) =>
                    setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="my-username"
                  maxLength={64}
                  className="pr-10"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameChecking && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!usernameChecking && usernameAvailable === true && (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                  {!usernameChecking && usernameAvailable === false && (
                    <X className="h-4 w-4 text-destructive" />
                  )}
                </div>
              </div>
              {usernameAvailable === false && (
                <p className="text-xs text-destructive">Username taken</p>
              )}
              {usernameInput.length > 0 &&
                usernameInput.length < 3 && (
                  <p className="text-xs text-muted-foreground">
                    Must be at least 3 characters
                  </p>
                )}
              {usernameInput.length >= 3 &&
                !USERNAME_RE.test(usernameInput) && (
                  <p className="text-xs text-destructive">
                    Must start with a letter and contain only lowercase letters,
                    numbers, and hyphens
                  </p>
                )}
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens. 3–64 characters.
              </p>
            </div>

            {usernameError && (
              <p className="text-sm text-destructive">{usernameError}</p>
            )}

            <Button
              size="lg"
              className="w-fit"
              disabled={
                !USERNAME_RE.test(usernameInput) ||
                !usernameAvailable ||
                usernameClaiming
              }
              onClick={claimUsername}
            >
              {usernameClaiming ? "Claiming…" : "Claim username"}
            </Button>
          </div>
        )}

        {/* Step indicator */}
        {!submitted && !needsUsername && !authLoading && !usernameLoading && (
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
        {!submitted && !needsUsername && step === 1 && (
          <div className="flex flex-col gap-6">
            {/* Expected format */}
            <div className="flex flex-col gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                Skill Format
              </h2>
              <pre className="rounded-lg border border-border bg-muted/50 p-4 text-sm font-mono">
{`skill-name/
├── SKILL.md          (required)
├── scripts/          (optional)
├── references/       (optional)
└── assets/           (optional)`}
              </pre>
              <p className="text-sm text-muted-foreground">
                SKILL.md must include frontmatter with{" "}
                <code className="font-mono">name</code>,{" "}
                <code className="font-mono">description</code>, and{" "}
                <code className="font-mono">license</code>.
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
                <div className="rounded-lg border border-border bg-muted/50">
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
                </div>

                {/* Validation results */}
                <div className="rounded-lg border border-border">
                  <div className="border-b border-border px-4 py-3">
                    <span className="text-sm font-medium">Validation</span>
                  </div>
                  <ul className="flex flex-col gap-1 p-4">
                    {upload.checks.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span
                          className={
                            c.passed ? "text-green-600" : "text-destructive"
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
                </div>

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
        {!submitted && !needsUsername && step === 2 && (
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
              <Button type="submit" size="lg" disabled={!canSubmit}>
                {submitting ? "Submitting\u2026" : "Submit Skill"}
              </Button>
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
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-fit"
              onClick={() => {
                setSubmitted(false);
                reset();
              }}
            >
              Submit another
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
