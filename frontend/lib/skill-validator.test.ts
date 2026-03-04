import { describe, test, expect } from "bun:test";
import {
  parseFrontmatter,
  serializeFrontmatter,
  validateSkill,
  VALID_LICENSES,
  ALLOWED_DIRS,
  MAX_UPLOAD_SIZE,
  MAX_FILE_COUNT,
  type SkillFile,
} from "./skill-validator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSkillMd(
  frontmatter: Record<string, string>,
  body = "# My Skill\n\nDo the thing."
): string {
  const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function validSkillFiles(
  overrides: {
    frontmatter?: Record<string, string>;
    body?: string;
    extraFiles?: SkillFile[];
    dirName?: string;
  } = {}
): SkillFile[] {
  const dir = overrides.dirName ?? "my-skill";
  const fm = {
    name: "my-skill",
    description: "A useful skill",
    license: "Apache-2.0",
    ...overrides.frontmatter,
  };
  return [
    { path: `${dir}/SKILL.md`, content: buildSkillMd(fm, overrides.body) },
    ...(overrides.extraFiles ?? []),
  ];
}

// ---------------------------------------------------------------------------
// serializeFrontmatter
// ---------------------------------------------------------------------------

describe("serializeFrontmatter", () => {
  test("roundtrip: parse then serialize produces equivalent output", () => {
    const original = "---\nname: my-skill\ndescription: A useful skill\nlicense: MIT\n---\n# My Skill\n\nDo the thing.";
    const { meta, body } = parseFrontmatter(original);
    const result = serializeFrontmatter(meta, body);
    expect(result).toBe(original);
  });

  test("preserves extra metadata fields", () => {
    const original = "---\nname: test\nauthor: someone\nversion: 1.0.0\n---\nBody";
    const { meta, body } = parseFrontmatter(original);
    meta["name"] = "updated";
    const result = serializeFrontmatter(meta, body);
    expect(result).toContain("name: updated");
    expect(result).toContain("author: someone");
    expect(result).toContain("version: 1.0.0");
  });

  test("omits fields with empty string values", () => {
    const result = serializeFrontmatter(
      { name: "test", compatibility: "", license: "MIT" },
      "Body"
    );
    expect(result).not.toContain("compatibility");
    expect(result).toContain("name: test");
    expect(result).toContain("license: MIT");
  });
});

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  test("parses standard frontmatter", () => {
    const { meta, body } = parseFrontmatter(
      "---\nname: foo\ndescription: bar\n---\nHello"
    );
    expect(meta.name).toBe("foo");
    expect(meta.description).toBe("bar");
    expect(body).toBe("Hello");
  });

  test("returns empty meta when no frontmatter", () => {
    const { meta, body } = parseFrontmatter("Just some text");
    expect(meta).toEqual({});
    expect(body).toBe("Just some text");
  });

  test("handles description containing colons", () => {
    const { meta } = parseFrontmatter(
      "---\ndescription: does things: many things\n---\nBody"
    );
    expect(meta.description).toBe("does things: many things");
  });

  test("handles empty value for a key", () => {
    const { meta } = parseFrontmatter("---\nlicense:\n---\nBody");
    expect(meta.license).toBe("");
  });
});

// ---------------------------------------------------------------------------
// validateSkill — valid uploads
// ---------------------------------------------------------------------------

describe("validateSkill — valid uploads", () => {
  test("complete skill with all fields and optional dirs", () => {
    const result = validateSkill(
      validSkillFiles({
        frontmatter: {
          name: "my-skill",
          description: "A useful skill",
          license: "MIT",
          compatibility: "Node 18+",
          "allowed-tools": "bash read",
        },
        extraFiles: [
          { path: "my-skill/scripts/run.sh", content: "#!/bin/bash" },
          { path: "my-skill/references/doc.md", content: "# Ref" },
          { path: "my-skill/assets/logo.png", content: "binary" },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
    expect(result.parsed).not.toBeNull();
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  test("skill without license is a valid upload (canProceed = true)", () => {
    const result = validateSkill(
      validSkillFiles({
        frontmatter: {
          name: "my-skill",
          description: "A useful skill",
          license: undefined as unknown as string,
        },
      })
    );
    // Remove the license key from frontmatter
    const files = validSkillFiles();
    files[0].content = buildSkillMd(
      { name: "my-skill", description: "A useful skill" },
      "# Body"
    );
    const r = validateSkill(files);
    expect(r.canProceed).toBe(true);
    expect(r.parsed).not.toBeNull();
    expect(r.parsed!.license).toBe("");
    // Should have a failing check for missing license
    expect(r.checks.some((c) => !c.passed && c.message.includes("license"))).toBe(true);
  });

  test("minimal skill (only name + description)", () => {
    const files = validSkillFiles();
    files[0].content = buildSkillMd(
      { name: "minimal", description: "Minimal skill" },
      "# Content"
    );
    const result = validateSkill(files);
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.name).toBe("minimal");
  });

  test.each(VALID_LICENSES.map((l) => [l]))("accepts license: %s", (license) => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { license } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => c.message.includes(license))).toBe(true);
  });

  test("name at 64 characters", () => {
    const name = "a".repeat(64);
    // 64 chars of 'a' doesn't contain hyphens so it matches the pattern
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.name).toBe(name);
  });

  test("description at 1024 characters", () => {
    const description = "x".repeat(1024);
    const result = validateSkill(
      validSkillFiles({ frontmatter: { description } })
    );
    expect(result.canProceed).toBe(true);
  });

  test("compatibility at 500 characters", () => {
    const compatibility = "y".repeat(500);
    const result = validateSkill(
      validSkillFiles({ frontmatter: { compatibility } })
    );
    expect(result.canProceed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSkill — invalid structure (canProceed = false)
// ---------------------------------------------------------------------------

describe("validateSkill — structure errors (canProceed = false)", () => {
  test("empty file list", () => {
    const result = validateSkill([]);
    expect(result.canProceed).toBe(false);
    expect(result.parsed).toBeNull();
  });

  test("missing SKILL.md", () => {
    const result = validateSkill([
      { path: "my-skill/readme.txt", content: "hello" },
    ]);
    expect(result.canProceed).toBe(false);
    expect(result.parsed).toBeNull();
    expect(result.checks.some((c) => c.message.includes("Missing required SKILL.md"))).toBe(true);
  });

  test("unexpected file at root level", () => {
    const result = validateSkill([
      ...validSkillFiles(),
      { path: "my-skill/random.txt", content: "nope" },
    ]);
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("Unexpected entry"))).toBe(true);
  });

  test("unexpected directory at root level", () => {
    const result = validateSkill([
      ...validSkillFiles(),
      { path: "my-skill/other-dir/file.txt", content: "nope" },
    ]);
    expect(result.canProceed).toBe(false);
  });

  test("empty body after frontmatter", () => {
    const files = validSkillFiles({ body: "" });
    // Rebuild with truly empty body
    files[0].content = buildSkillMd(
      { name: "test", description: "Test", license: "MIT" },
      ""
    );
    const result = validateSkill(files);
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("no content"))).toBe(true);
  });

  // -- Path traversal --

  test("path traversal with .. rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/../../etc/passwd", content: "root:x:0:0" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("path traversal"))).toBe(true);
  });

  // -- node_modules --

  test("node_modules inside scripts/", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/node_modules/foo/index.js", content: "module.exports = {}" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("node_modules"))).toBe(true);
  });

  test("NODE_MODULES (case-insensitive) rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/NODE_MODULES/foo/index.js", content: "module.exports = {}" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("node_modules"))).toBe(true);
  });

  test("node_modules at root level", () => {
    const result = validateSkill([
      ...validSkillFiles(),
      { path: "my-skill/node_modules/foo/index.js", content: "module.exports = {}" },
    ]);
    expect(result.canProceed).toBe(false);
  });

  // -- .env variants --

  test(".env file inside assets/", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/assets/.env", content: "SECRET=abc" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("environment file"))).toBe(true);
  });

  test(".env.local file rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.env.local", content: "SECRET=abc" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  test(".ENV (case-insensitive) rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.ENV", content: "SECRET=abc" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  test(".envrc (direnv) rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.envrc", content: "export SECRET=abc" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  test(".env-local rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.env-local", content: "SECRET=abc" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  test(".env_production rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.env_production", content: "SECRET=abc" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  test(".env.example file allowed", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.env.example", content: "SECRET=" },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
  });

  // -- .git directory --

  test(".git directory rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.git/config", content: "[remote]" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes(".git"))).toBe(true);
  });

  // -- Credential files --

  test(".npmrc rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.npmrc", content: "//registry.npmjs.org/:_authToken=secret" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("credentials"))).toBe(true);
  });

  test(".netrc rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/.netrc", content: "machine github.com" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  // -- Private key files --

  test("id_rsa rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/id_rsa", content: "-----BEGIN RSA PRIVATE KEY-----" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("private key"))).toBe(true);
  });

  test("id_ed25519 rejected", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/assets/id_ed25519", content: "-----BEGIN OPENSSH PRIVATE KEY-----" },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
  });

  // -- False positives (should pass) --

  test("file with env in name passes (not a dotenv)", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/setup-env.sh", content: "#!/bin/bash" },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
  });

  test("node_modules-guide.md passes (not a directory segment)", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/references/node_modules-guide.md", content: "# Guide" },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
  });

  test("environment.env passes (not a dotenv)", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/references/environment.env", content: "docs" },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
  });

  test("bare SKILL.md with no folder", () => {
    const result = validateSkill([
      { path: "SKILL.md", content: buildSkillMd({ name: "test", description: "A skill", license: "MIT" }, "# Body") },
    ]);
    expect(result.canProceed).toBe(false);
  });

  test("wrong casing: skill.md", () => {
    const result = validateSkill([
      { path: "my-skill/skill.md", content: buildSkillMd({ name: "test", description: "A skill", license: "MIT" }, "# Body") },
    ]);
    expect(result.canProceed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSkill — field errors (canProceed = true)
// ---------------------------------------------------------------------------

describe("validateSkill — field errors (canProceed = true)", () => {
  test("missing name", () => {
    const files = validSkillFiles();
    files[0].content = buildSkillMd(
      { description: "A skill", license: "MIT" },
      "# Body"
    );
    const result = validateSkill(files);
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("name"))).toBe(true);
  });

  test("missing description", () => {
    const files = validSkillFiles();
    files[0].content = buildSkillMd(
      { name: "test", license: "MIT" },
      "# Body"
    );
    const result = validateSkill(files);
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("description"))).toBe(true);
  });

  test("name too long", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "a".repeat(65) } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("65"))).toBe(true);
  });

  test("name with uppercase letters", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "MySkill" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid name"))).toBe(true);
  });

  test("name with spaces", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "my skill" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid name"))).toBe(true);
  });

  test("name with underscores", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "my_skill" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid name"))).toBe(true);
  });

  test("name with leading hyphen", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "-my-skill" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid name"))).toBe(true);
  });

  test("name with trailing hyphen", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "my-skill-" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid name"))).toBe(true);
  });

  test("description too long", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { description: "x".repeat(1025) } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("1025"))).toBe(true);
  });

  test("unrecognized license string", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { license: "WTFPL" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid license"))).toBe(true);
  });

  test("name with consecutive hyphens", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { name: "my--skill" } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("Invalid name"))).toBe(true);
  });

  test("compatibility too long (501)", () => {
    const result = validateSkill(
      validSkillFiles({ frontmatter: { compatibility: "y".repeat(501) } })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.some((c) => !c.passed && c.message.includes("501"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("validateSkill — edge cases", () => {
  test("extra unknown frontmatter fields are ignored (valid)", () => {
    const result = validateSkill(
      validSkillFiles({
        frontmatter: {
          name: "test",
          description: "A skill",
          license: "MIT",
          author: "someone",
          version: "1.0.0",
        },
      })
    );
    expect(result.canProceed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  test("description containing colons parses correctly", () => {
    const result = validateSkill(
      validSkillFiles({
        frontmatter: {
          name: "test",
          description: "does things: many things: even more",
          license: "MIT",
        },
      })
    );
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.description).toBe(
      "does things: many things: even more"
    );
  });

  test.each(ALLOWED_DIRS.map((d) => [d]))("allowed dir in isolation: %s", (dir) => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [{ path: `my-skill/${dir}/file.txt`, content: "content" }],
      })
    );
    expect(result.canProceed).toBe(true);
  });

  test("deeply nested files in allowed dirs are valid", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/sub/deep/run.sh", content: "#!/bin/bash" },
          {
            path: "my-skill/references/a/b/c/d.md",
            content: "deep ref",
          },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateSkill — upload size limits
// ---------------------------------------------------------------------------

describe("validateSkill — upload size limits", () => {
  test("rejects when file count exceeds limit", () => {
    const files: SkillFile[] = validSkillFiles();
    for (let i = 0; i < MAX_FILE_COUNT; i++) {
      files.push({ path: `my-skill/scripts/file-${i}.sh`, content: "#!/bin/bash" });
    }
    const result = validateSkill(files);
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("Too many files"))).toBe(true);
  });

  test("accepts file count at limit", () => {
    const files: SkillFile[] = validSkillFiles();
    for (let i = 0; i < MAX_FILE_COUNT - 1; i++) {
      files.push({ path: `my-skill/scripts/file-${i}.sh`, content: "#!/bin/bash" });
    }
    expect(files.length).toBe(MAX_FILE_COUNT);
    const result = validateSkill(files);
    expect(result.canProceed).toBe(true);
  });

  test("rejects total upload exceeding size limit", () => {
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/big.sh", content: "x".repeat(MAX_UPLOAD_SIZE + 1) },
        ],
      })
    );
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("Upload too large"))).toBe(true);
  });

  test("accepts total upload at size limit", () => {
    // SKILL.md takes some bytes, so fill remaining space
    const skillContent = buildSkillMd(
      { name: "my-skill", description: "A useful skill", license: "Apache-2.0" },
      "# My Skill\n\nDo the thing."
    );
    const remaining = MAX_UPLOAD_SIZE - skillContent.length;
    const result = validateSkill(
      validSkillFiles({
        extraFiles: [
          { path: "my-skill/scripts/fill.sh", content: "x".repeat(remaining) },
        ],
      })
    );
    expect(result.canProceed).toBe(true);
  });
});
