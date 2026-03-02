import { describe, test, expect } from "bun:test";
import {
  parseFrontmatter,
  validateSkill,
  VALID_LICENSES,
  ALLOWED_DIRS,
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
