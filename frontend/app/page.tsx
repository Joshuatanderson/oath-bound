"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validateSkill,
  VALID_LICENSES,
  ALLOWED_DIRS,
  type SkillFile,
  type ValidationCheck,
  type ParsedSkill,
} from "@/lib/skill-validator";
import { supabase } from "@/lib/supabase";

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
  const [step, setStep] = useState<1 | 2>(1);
  const [upload, setUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [dragging, setDragging] = useState(false);

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

  async function processFiles(fileList: FileList) {
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

    const allFiles: SkillFile[] = [];

    async function readEntry(entry: FileSystemEntry, basePath: string) {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) =>
          (entry as FileSystemFileEntry).file(resolve)
        );
        const content = await file.text();
        allFiles.push({ path: `${basePath}/${file.name}`, content });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const entries = await new Promise<FileSystemEntry[]>((resolve) =>
          reader.readEntries(resolve)
        );
        for (const child of entries) {
          await readEntry(child, `${basePath}/${entry.name}`);
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
            await readEntry(child, entry.name);
          }
        } else {
          const file = items[i].getAsFile();
          if (file) {
            allFiles.push({ path: file.name, content: await file.text() });
          }
        }
      }
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

    const { error } = await supabase.from("skills").insert({
      name,
      description,
      license,
      compatibility: compatibility || null,
      allowed_tools: allowedTools || null,
      body: skillBody,
      files: upload.files,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setSubmitted(true);
  }

  // ------ Render ------

  return (
    <div className="flex min-h-screen items-start justify-center bg-background font-sans">
      <main className="flex w-full max-w-2xl flex-col gap-16 px-6 py-20">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-bold tracking-tight">Oath Bound</h1>
          <p className="text-lg text-muted-foreground">
            Attest your skills on-chain. Build trust through verifiable claims.
          </p>
        </div>

        {/* Step indicator */}
        {!submitted && (
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
        {!submitted && step === 1 && (
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
        {!submitted && step === 2 && (
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
