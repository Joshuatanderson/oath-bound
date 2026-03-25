import { describe, test, expect } from "bun:test";
import {
  validateAgent,
  parseAgentFrontmatter,
  serializeAgentFile,
  agentToMeta,
  MAX_AGENT_FILE_SIZE,
} from "./agent-validator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgentMd(
  frontmatter: Record<string, unknown>,
  body = "You are a helpful agent. Analyze code and provide feedback."
): string {
  const lines = Object.entries(frontmatter).map(([k, v]) => {
    if (typeof v === "object" && v !== null) return `${k}: ${JSON.stringify(v)}`;
    return `${k}: ${v}`;
  });
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const VALID_FM: Record<string, unknown> = {
  name: "code-reviewer",
  description: "Reviews code for quality and best practices",
  license: "MIT",
};

function validAgent(
  overrides: Record<string, unknown> = {},
  body?: string
): string {
  return buildAgentMd({ ...VALID_FM, ...overrides }, body);
}

// ---------------------------------------------------------------------------
// parseAgentFrontmatter
// ---------------------------------------------------------------------------

describe("parseAgentFrontmatter", () => {
  test("parses standard frontmatter", () => {
    const { meta, body } = parseAgentFrontmatter(
      "---\nname: foo\ndescription: bar\n---\nHello"
    );
    expect(meta.name).toBe("foo");
    expect(meta.description).toBe("bar");
    expect(body).toBe("Hello");
  });

  test("returns empty meta when no frontmatter", () => {
    const { meta, body } = parseAgentFrontmatter("Just some text");
    expect(meta).toEqual({});
    expect(body).toBe("Just some text");
  });
});

// ---------------------------------------------------------------------------
// serializeAgentFile — deterministic output
// ---------------------------------------------------------------------------

describe("serializeAgentFile", () => {
  test("produces deterministic output regardless of input key order", () => {
    const meta1 = { name: "test", license: "MIT", description: "A test" };
    const meta2 = { license: "MIT", description: "A test", name: "test" };
    const body = "You are a test agent.";

    expect(serializeAgentFile(meta1, body)).toBe(
      serializeAgentFile(meta2, body)
    );
  });

  test("omits null/undefined/empty values", () => {
    const result = serializeAgentFile(
      { name: "test", description: "A test", tools: null, model: undefined, hooks: "" },
      "Body"
    );
    expect(result).not.toContain("tools");
    expect(result).not.toContain("model");
    expect(result).not.toContain("hooks");
  });

  test("roundtrip: parse then serialize is stable", () => {
    const content = validAgent();
    const { meta, body } = parseAgentFrontmatter(content);
    const serialized = serializeAgentFile(meta, body);
    const { meta: meta2, body: body2 } = parseAgentFrontmatter(serialized);
    const serialized2 = serializeAgentFile(meta2, body2);
    expect(serialized).toBe(serialized2);
  });

  test("uses LF line endings", () => {
    const result = serializeAgentFile({ name: "test" }, "Line 1\nLine 2");
    expect(result).not.toContain("\r\n");
  });

  test("ends with single trailing newline", () => {
    const result = serializeAgentFile({ name: "test" }, "Body");
    expect(result.endsWith("\n")).toBe(true);
    expect(result.endsWith("\n\n")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// agentToMeta
// ---------------------------------------------------------------------------

describe("agentToMeta", () => {
  test("converts parsed agent back to meta object", () => {
    const content = validAgent({ tools: "Read, Grep", model: "sonnet" });
    const result = validateAgent(content);
    expect(result.canProceed).toBe(true);

    const meta = agentToMeta(result.parsed!);
    expect(meta.name).toBe("code-reviewer");
    expect(meta.tools).toBe("Read, Grep");
    expect(meta.model).toBe("sonnet");
  });
});

// ---------------------------------------------------------------------------
// validateAgent — valid agents
// ---------------------------------------------------------------------------

describe("validateAgent — valid agents", () => {
  test("minimal valid agent (name, description, license, body)", () => {
    const result = validateAgent(validAgent());
    expect(result.canProceed).toBe(true);
    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.name).toBe("code-reviewer");
  });

  test("agent with all optional fields", () => {
    const content = `---
name: full-agent
description: An agent with everything
license: Apache-2.0
version: 1.2.3
tools: Read, Grep, Glob
disallowedTools: Write, Edit
model: sonnet
permissionMode: acceptEdits
maxTurns: 10
skills:
  - api-conventions
  - error-handling
memory: project
background: true
effort: high
isolation: worktree
initialPrompt: Start by reading README
compatibility: Requires Node 18+
---
You are a comprehensive agent with all config options set.`;

    const result = validateAgent(content);
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.tools).toBe("Read, Grep, Glob");
    expect(result.parsed!.model).toBe("sonnet");
    expect(result.parsed!.permissionMode).toBe("acceptEdits");
    expect(result.parsed!.maxTurns).toBe(10);
    expect(result.parsed!.memoryScope).toBe("project");
    expect(result.parsed!.background).toBe(true);
    expect(result.parsed!.effort).toBe("high");
    expect(result.parsed!.isolation).toBe("worktree");
    expect(result.parsed!.config.skillsRefs).toEqual([
      "api-conventions",
      "error-handling",
    ]);
    expect(result.parsed!.config.initialPrompt).toBe("Start by reading README");
    expect(result.parsed!.compatibility).toBe("Requires Node 18+");
  });

  test("all valid model aliases", () => {
    for (const model of ["sonnet", "opus", "haiku", "inherit"]) {
      const result = validateAgent(validAgent({ model }));
      expect(result.canProceed).toBe(true);
    }
  });

  test("full model ID accepted", () => {
    const result = validateAgent(
      validAgent({ model: "claude-sonnet-4-6" })
    );
    expect(result.canProceed).toBe(true);
  });

  test("all valid permission modes", () => {
    for (const pm of [
      "default",
      "acceptEdits",
      "dontAsk",
      "bypassPermissions",
      "plan",
    ]) {
      const result = validateAgent(validAgent({ permissionMode: pm }));
      expect(result.canProceed).toBe(true);
    }
  });

  test("all valid effort levels", () => {
    for (const effort of ["low", "medium", "high", "max"]) {
      const result = validateAgent(validAgent({ effort }));
      expect(result.canProceed).toBe(true);
    }
  });

  test("all valid memory scopes", () => {
    for (const memory of ["user", "project", "local"]) {
      const result = validateAgent(validAgent({ memory }));
      expect(result.canProceed).toBe(true);
    }
  });

  test("agent with hooks (object structure)", () => {
    const content = `---
name: db-reader
description: Read-only database queries
license: MIT
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: ./scripts/validate.sh
---
You are a database reader.`;

    const result = validateAgent(content);
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.config.hooks).not.toBeNull();
  });

  test("agent with mcpServers (array)", () => {
    const content = `---
name: browser-tester
description: Tests with Playwright
license: MIT
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args:
        - "-y"
        - "@playwright/mcp@latest"
  - github
---
Use Playwright tools.`;

    const result = validateAgent(content);
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.config.mcpServers).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateAgent — required field errors
// ---------------------------------------------------------------------------

describe("validateAgent — required field errors", () => {
  test("no frontmatter at all", () => {
    const result = validateAgent("Just a markdown file with no frontmatter");
    expect(result.canProceed).toBe(false);
    expect(result.parsed).toBeNull();
  });

  test("missing name", () => {
    const result = validateAgent(
      buildAgentMd({ description: "A thing", license: "MIT" })
    );
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => !c.passed && c.message.includes("name"))
    ).toBe(true);
  });

  test("missing description", () => {
    const result = validateAgent(
      buildAgentMd({ name: "test", license: "MIT" })
    );
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => !c.passed && c.message.includes("description"))
    ).toBe(true);
  });

  test("missing license", () => {
    const result = validateAgent(
      buildAgentMd({ name: "test", description: "A thing" })
    );
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => !c.passed && c.message.includes("license"))
    ).toBe(true);
  });

  test("empty body (no system prompt)", () => {
    const result = validateAgent(validAgent({}, ""));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => !c.passed && c.message.includes("system prompt"))
    ).toBe(true);
  });

  test("whitespace-only body", () => {
    const result = validateAgent(validAgent({}, "   \n  \n  "));
    expect(result.canProceed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAgent — name validation
// ---------------------------------------------------------------------------

describe("validateAgent — name validation", () => {
  test("name too long (65 chars)", () => {
    const result = validateAgent(validAgent({ name: "a".repeat(65) }));
    expect(result.canProceed).toBe(false);
  });

  test("name at max length (64 chars)", () => {
    const result = validateAgent(validAgent({ name: "a".repeat(64) }));
    expect(result.canProceed).toBe(true);
  });

  test("uppercase letters rejected", () => {
    const result = validateAgent(validAgent({ name: "MyAgent" }));
    expect(result.canProceed).toBe(false);
  });

  test("spaces rejected", () => {
    const result = validateAgent(validAgent({ name: "my agent" }));
    expect(result.canProceed).toBe(false);
  });

  test("underscores rejected", () => {
    const result = validateAgent(validAgent({ name: "my_agent" }));
    expect(result.canProceed).toBe(false);
  });

  test("leading hyphen rejected", () => {
    const result = validateAgent(validAgent({ name: "-my-agent" }));
    expect(result.canProceed).toBe(false);
  });

  test("trailing hyphen rejected", () => {
    const result = validateAgent(validAgent({ name: "my-agent-" }));
    expect(result.canProceed).toBe(false);
  });

  test("consecutive hyphens rejected", () => {
    const result = validateAgent(validAgent({ name: "my--agent" }));
    expect(result.canProceed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAgent — reserved names
// ---------------------------------------------------------------------------

describe("validateAgent — reserved names", () => {
  test.each([
    "explore",
    "plan",
    "default",
    "general-purpose",
    "bash",
    "claude",
    "sonnet",
    "opus",
    "haiku",
    "system",
  ])("reserved name '%s' is blocked", (name) => {
    const result = validateAgent(validAgent({ name }));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("Reserved agent name"))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAgent — optional field validation
// ---------------------------------------------------------------------------

describe("validateAgent — optional field validation", () => {
  test("invalid version (not semver)", () => {
    const result = validateAgent(validAgent({ version: "v1" }));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("Invalid version"))
    ).toBe(true);
  });

  test("valid version", () => {
    const result = validateAgent(validAgent({ version: "2.1.0" }));
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.version).toBe("2.1.0");
  });

  test("empty tools string rejected", () => {
    // YAML `tools: ""` parses as empty string (not null like bare `tools:`)
    const content = `---
name: code-reviewer
description: Reviews code
license: MIT
tools: ""
---
You are a code reviewer.`;
    const result = validateAgent(content);
    expect(result.canProceed).toBe(false);
    expect(result.checks.some((c) => c.message.includes("tools field is empty"))).toBe(true);
  });

  test("invalid model", () => {
    const result = validateAgent(validAgent({ model: "gpt-4" }));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("Invalid model"))
    ).toBe(true);
  });

  test("invalid permissionMode", () => {
    const result = validateAgent(validAgent({ permissionMode: "yolo" }));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("Invalid permissionMode"))
    ).toBe(true);
  });

  test("maxTurns must be positive integer", () => {
    const result = validateAgent(validAgent({ maxTurns: -1 }));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("Invalid maxTurns"))
    ).toBe(true);
  });

  test("maxTurns zero rejected", () => {
    const result = validateAgent(validAgent({ maxTurns: 0 }));
    expect(result.canProceed).toBe(false);
  });

  test("maxTurns valid", () => {
    const result = validateAgent(validAgent({ maxTurns: 25 }));
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.maxTurns).toBe(25);
  });

  test("invalid memory scope", () => {
    const result = validateAgent(validAgent({ memory: "global" }));
    expect(result.canProceed).toBe(false);
  });

  test("invalid effort level", () => {
    const result = validateAgent(validAgent({ effort: "extreme" }));
    expect(result.canProceed).toBe(false);
  });

  test("invalid isolation value", () => {
    const result = validateAgent(validAgent({ isolation: "container" }));
    expect(result.canProceed).toBe(false);
  });

  test("invalid license", () => {
    const result = validateAgent(validAgent({ license: "WTFPL" }));
    expect(result.canProceed).toBe(false);
  });

  test("compatibility too long (501)", () => {
    const result = validateAgent(validAgent({ compatibility: "y".repeat(501) }));
    // Not blocking, just a warning
    expect(
      result.checks.some((c) => !c.passed && c.message.includes("501"))
    ).toBe(true);
  });

  test("original-author with non-open-source license blocked", () => {
    const result = validateAgent(
      validAgent({ license: "Proprietary", "original-author": "alice" })
    );
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("original-author"))
    ).toBe(true);
  });

  test("original-author with open-source license allowed", () => {
    const result = validateAgent(
      validAgent({ license: "MIT", "original-author": "alice" })
    );
    expect(result.canProceed).toBe(true);
    expect(result.parsed!.originalAuthor).toBe("alice");
  });
});

// ---------------------------------------------------------------------------
// validateAgent — complex field structure validation
// ---------------------------------------------------------------------------

describe("validateAgent — complex fields", () => {
  test("skills must be array", () => {
    const content = `---
name: test
description: Test
license: MIT
skills: not-an-array
---
Body here.`;
    const result = validateAgent(content);
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("skills must be an array"))
    ).toBe(true);
  });

  test("skills with empty strings rejected", () => {
    const content = `---
name: test
description: Test
license: MIT
skills:
  - valid-skill
  - ""
---
Body here.`;
    const result = validateAgent(content);
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("non-empty strings"))
    ).toBe(true);
  });

  test("mcpServers must be array", () => {
    const content = `---
name: test
description: Test
license: MIT
mcpServers:
  notAnArray: true
---
Body here.`;
    const result = validateAgent(content);
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("mcpServers must be an array"))
    ).toBe(true);
  });

  test("hooks must be object", () => {
    const content = `---
name: test
description: Test
license: MIT
hooks:
  - not-an-object
---
Body here.`;
    const result = validateAgent(content);
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("hooks must be an object"))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAgent — size limit
// ---------------------------------------------------------------------------

describe("validateAgent — size limit", () => {
  test("file exceeding 500KB rejected", () => {
    const result = validateAgent("x".repeat(MAX_AGENT_FILE_SIZE + 1));
    expect(result.canProceed).toBe(false);
    expect(
      result.checks.some((c) => c.message.includes("File too large"))
    ).toBe(true);
  });

  test("file at exactly 500KB accepted (if valid)", () => {
    // Build a valid agent that's large
    const padding = "x".repeat(MAX_AGENT_FILE_SIZE - 200);
    const result = validateAgent(validAgent({}, padding));
    // Should get past size check at minimum
    expect(
      result.checks.every((c) => !c.message.includes("File too large"))
    ).toBe(true);
  });
});
