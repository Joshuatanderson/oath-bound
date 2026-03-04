export interface SkillFile {
  path: string;
  content: string;
}

export interface ValidationCheck {
  passed: boolean;
  message: string;
}

export interface ParsedSkill {
  name: string;
  description: string;
  license: string;
  compatibility: string;
  allowedTools: string;
  body: string;
}

export interface ValidateResult {
  checks: ValidationCheck[];
  parsed: ParsedSkill | null;
  canProceed: boolean;
}

export const VALID_LICENSES = [
  "Apache-2.0",
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "GPL-3.0-only",
  "AGPL-3.0-only",
  "MPL-2.0",
  "ISC",
  "Unlicense",
  "BUSL-1.1",
  "Proprietary",
] as const;

export const ALLOWED_DIRS = ["scripts", "references", "assets"] as const;

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB total upload
export const MAX_FILE_COUNT = 50;

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Directory segments blocked at any depth (matched case-insensitively) */
const BLOCKED_SEGMENTS = ["node_modules", ".git", ".aws", ".ssh"];

/** Exact basenames blocked (matched case-insensitively) */
const BLOCKED_BASENAMES = [".npmrc", ".netrc", ".htpasswd"];

/** Private key file names (matched case-insensitively) */
const PRIVATE_KEY_NAMES = ["id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"];

export function parseFrontmatter(content: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: match[2] };
}

export function serializeFrontmatter(
  meta: Record<string, string>,
  body: string
): string {
  const lines = Object.entries(meta)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

export function validateSkill(files: SkillFile[]): ValidateResult {
  const checks: ValidationCheck[] = [];
  let blocking = false;

  // Empty file list
  if (files.length === 0) {
    checks.push({ passed: false, message: "No files uploaded" });
    return { checks, parsed: null, canProceed: false };
  }

  // File count limit
  if (files.length > MAX_FILE_COUNT) {
    checks.push({
      passed: false,
      message: `Too many files: ${files.length} (maximum ${MAX_FILE_COUNT})`,
    });
    return { checks, parsed: null, canProceed: false };
  }

  // Total size limit
  const totalSize = files.reduce((sum, f) => sum + f.content.length, 0);
  if (totalSize > MAX_UPLOAD_SIZE) {
    checks.push({
      passed: false,
      message: `Upload too large: ${(totalSize / (1024 * 1024)).toFixed(1)} MB (maximum ${MAX_UPLOAD_SIZE / (1024 * 1024)} MB)`,
    });
    return { checks, parsed: null, canProceed: false };
  }

  // Determine root directory
  const rootDir = files[0].path.split("/")[0];

  // Check SKILL.md exists
  const skillFile = files.find((f) => f.path === `${rootDir}/SKILL.md`);
  if (!skillFile) {
    checks.push({ passed: false, message: "Missing required SKILL.md" });
    return { checks, parsed: null, canProceed: false };
  }
  checks.push({ passed: true, message: "SKILL.md found" });

  // Check for unexpected files/dirs at root level
  const seenTopLevel = new Set<string>();
  for (const f of files) {
    const relative = f.path.slice(rootDir.length + 1);
    const topLevel = relative.split("/")[0];
    if (seenTopLevel.has(topLevel)) continue;
    seenTopLevel.add(topLevel);

    if (topLevel !== "SKILL.md" && !ALLOWED_DIRS.includes(topLevel as typeof ALLOWED_DIRS[number])) {
      checks.push({
        passed: false,
        message: `Unexpected entry at root: ${topLevel} (allowed: SKILL.md, ${ALLOWED_DIRS.join(", ")})`,
      });
      blocking = true;
    }
  }
  if (!blocking) {
    checks.push({ passed: true, message: "Directory structure valid" });
  }

  // Check for dangerous paths
  for (const f of files) {
    if (blocking) break;

    const relative = f.path.slice(rootDir.length + 1);
    const segments = relative.split("/");
    const basename = segments[segments.length - 1];
    const lowerBasename = basename.toLowerCase();
    const lowerSegments = segments.map((s) => s.toLowerCase());

    // Path traversal
    if (segments.includes("..")) {
      checks.push({
        passed: false,
        message:
          "Upload contains path traversal (..) — remove paths that navigate outside the skill directory",
      });
      blocking = true;
      break;
    }

    // Blocked directory segments (case-insensitive)
    const blockedSeg = lowerSegments.find((s) => BLOCKED_SEGMENTS.includes(s));
    if (blockedSeg) {
      const messages: Record<string, string> = {
        node_modules:
          "Upload contains node_modules — remove dependencies before uploading",
        ".git":
          "Upload contains a .git directory — remove version control files before uploading",
        ".aws":
          "Upload contains .aws credentials directory — remove before uploading",
        ".ssh":
          "Upload contains .ssh directory — remove before uploading",
      };
      checks.push({
        passed: false,
        message: messages[blockedSeg] ?? `Upload contains blocked directory: ${blockedSeg}`,
      });
      blocking = true;
      break;
    }

    // Environment files (case-insensitive, broad pattern)
    if (
      lowerBasename === ".env" ||
      lowerBasename === ".envrc" ||
      ((lowerBasename.startsWith(".env.") ||
        lowerBasename.startsWith(".env-") ||
        lowerBasename.startsWith(".env_")) &&
        lowerBasename !== ".env.example")
    ) {
      checks.push({
        passed: false,
        message: `Upload contains an environment file (${relative}) — remove to avoid leaking secrets`,
      });
      blocking = true;
      break;
    }

    // Credential files
    if (BLOCKED_BASENAMES.includes(lowerBasename)) {
      checks.push({
        passed: false,
        message: `Upload contains a credentials file (${relative}) — remove to avoid leaking secrets`,
      });
      blocking = true;
      break;
    }

    // Private key files
    if (PRIVATE_KEY_NAMES.includes(lowerBasename)) {
      checks.push({
        passed: false,
        message: `Upload contains a private key file (${relative}) — remove before uploading`,
      });
      blocking = true;
      break;
    }
  }

  // Parse frontmatter
  const { meta, body } = parseFrontmatter(skillFile.content);

  // Check body content — blocking
  if (!body.trim()) {
    checks.push({
      passed: false,
      message: "SKILL.md has no content after frontmatter",
    });
    blocking = true;
  } else {
    checks.push({ passed: true, message: "Skill content present" });
  }

  // Validate name — non-blocking
  const name = meta["name"] ?? "";
  if (!name) {
    checks.push({ passed: false, message: "Frontmatter missing: name" });
  } else if (name.length > 64) {
    checks.push({
      passed: false,
      message: `Name exceeds 64 characters (${name.length})`,
    });
  } else if (!NAME_PATTERN.test(name)) {
    checks.push({
      passed: false,
      message: `Invalid name: "${name}" — lowercase letters, numbers, and hyphens only, must not start or end with a hyphen`,
    });
  } else {
    checks.push({ passed: true, message: `name: ${name}` });
  }

  // Validate description — non-blocking
  const description = meta["description"] ?? "";
  if (!description) {
    checks.push({ passed: false, message: "Frontmatter missing: description" });
  } else if (description.length > 1024) {
    checks.push({
      passed: false,
      message: `Description exceeds 1024 characters (${description.length})`,
    });
  } else {
    checks.push({ passed: true, message: "description present" });
  }

  // Validate license — non-blocking
  const license = meta["license"] ?? "";
  if (!license) {
    checks.push({ passed: false, message: "Frontmatter missing: license" });
  } else if (!VALID_LICENSES.includes(license as typeof VALID_LICENSES[number])) {
    checks.push({
      passed: false,
      message: `Invalid license: "${license}"`,
    });
  } else {
    checks.push({ passed: true, message: `license: ${license}` });
  }

  // Validate optional fields
  const compatibility = meta["compatibility"] ?? "";
  if (compatibility && compatibility.length > 500) {
    checks.push({
      passed: false,
      message: `Compatibility exceeds 500 characters (${compatibility.length})`,
    });
  }

  const allowedTools = meta["allowed-tools"] ?? "";

  const parsed: ParsedSkill = {
    name,
    description,
    license,
    compatibility,
    allowedTools,
    body,
  };

  return {
    checks,
    parsed,
    canProceed: !blocking,
  };
}
