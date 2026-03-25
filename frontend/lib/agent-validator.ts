import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { isValidSemver } from "./semver";
import { VALID_LICENSES, isOpenSourceLicense, type ValidationCheck } from "./skill-validator";

export interface ParsedAgent {
  name: string;
  description: string;
  license: string;
  version: string | null;

  // Agent-specific config (queryable)
  tools: string | null;
  disallowedTools: string | null;
  model: string | null;
  permissionMode: string | null;
  maxTurns: number | null;
  memoryScope: string | null;
  background: boolean;
  effort: string | null;
  isolation: string | null;

  // Agent config (opaque/complex -> goes in config jsonb)
  config: {
    hooks: unknown | null;
    mcpServers: unknown | null;
    skillsRefs: string[] | null;
    initialPrompt: string | null;
  };

  // Oathbound metadata
  compatibility: string | null;
  originalAuthor: string | null;

  // System prompt (markdown body)
  systemPrompt: string;
}

export interface AgentValidateResult {
  checks: ValidationCheck[];
  parsed: ParsedAgent | null;
  canProceed: boolean;
}

export const MAX_AGENT_FILE_SIZE = 500 * 1024; // 500 KB

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const RESERVED_AGENT_NAMES = [
  "explore",
  "plan",
  "default",
  "general-purpose",
  "bash",
  "statusline-setup",
  "claude-code-guide",
  "system",
  "claude",
  "opus",
  "sonnet",
  "haiku",
] as const;

const VALID_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "dontAsk",
  "bypassPermissions",
  "plan",
] as const;

const VALID_MEMORY_SCOPES = ["user", "project", "local"] as const;
const VALID_EFFORT_LEVELS = ["low", "medium", "high", "max"] as const;
const MODEL_ID_PATTERN = /^claude-[a-z0-9][a-z0-9.-]*$/;
const VALID_MODEL_ALIASES = ["sonnet", "opus", "haiku", "inherit"] as const;

/**
 * Defined key order for canonical frontmatter serialization.
 * Keys are emitted in this order; keys not present are omitted.
 */
const FRONTMATTER_KEY_ORDER = [
  "name",
  "description",
  "license",
  "version",
  "tools",
  "disallowedTools",
  "model",
  "permissionMode",
  "maxTurns",
  "skills",
  "mcpServers",
  "hooks",
  "memory",
  "background",
  "effort",
  "isolation",
  "initialPrompt",
  "compatibility",
  "original-author",
] as const;

/** Parse YAML frontmatter from an agent .md file. */
export function parseAgentFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const parsed = yamlParse(match[1]);
  const meta: Record<string, unknown> =
    parsed && typeof parsed === "object" ? parsed : {};
  return { meta, body: match[2] };
}

/**
 * Serialize agent frontmatter + body into canonical .md format.
 * Deterministic key ordering for reproducible content hashing.
 */
export function serializeAgentFile(
  meta: Record<string, unknown>,
  body: string
): string {
  // Build ordered meta object — only include keys that have values
  const ordered: Record<string, unknown> = {};
  for (const key of FRONTMATTER_KEY_ORDER) {
    if (meta[key] != null && meta[key] !== "") {
      ordered[key] = meta[key];
    }
  }

  const yaml = yamlStringify(ordered, { lineWidth: 0 }).trim();
  // Normalize: LF line endings, single newline between frontmatter and body, trailing newline
  const normalized = `---\n${yaml}\n---\n${body.trimEnd()}\n`;
  return normalized.replace(/\r\n/g, "\n");
}

/** Build frontmatter meta object from a ParsedAgent. */
export function agentToMeta(agent: ParsedAgent): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
    license: agent.license,
  };
  if (agent.version) meta.version = agent.version;
  if (agent.tools) meta.tools = agent.tools;
  if (agent.disallowedTools) meta.disallowedTools = agent.disallowedTools;
  if (agent.model) meta.model = agent.model;
  if (agent.permissionMode) meta.permissionMode = agent.permissionMode;
  if (agent.maxTurns) meta.maxTurns = agent.maxTurns;
  if (agent.config.skillsRefs?.length) meta.skills = agent.config.skillsRefs;
  if (agent.config.mcpServers) meta.mcpServers = agent.config.mcpServers;
  if (agent.config.hooks) meta.hooks = agent.config.hooks;
  if (agent.memoryScope) meta.memory = agent.memoryScope;
  if (agent.background) meta.background = agent.background;
  if (agent.effort) meta.effort = agent.effort;
  if (agent.isolation) meta.isolation = agent.isolation;
  if (agent.config.initialPrompt) meta.initialPrompt = agent.config.initialPrompt;
  if (agent.compatibility) meta.compatibility = agent.compatibility;
  if (agent.originalAuthor) meta["original-author"] = agent.originalAuthor;
  return meta;
}

/** Validate an agent .md file content. */
export function validateAgent(content: string): AgentValidateResult {
  const checks: ValidationCheck[] = [];
  let blocking = false;

  // Size check
  if (content.length > MAX_AGENT_FILE_SIZE) {
    checks.push({
      passed: false,
      message: `File too large: ${(content.length / 1024).toFixed(0)} KB (maximum ${MAX_AGENT_FILE_SIZE / 1024} KB)`,
    });
    return { checks, parsed: null, canProceed: false };
  }

  // Parse frontmatter
  const { meta, body } = parseAgentFrontmatter(content);

  if (Object.keys(meta).length === 0) {
    checks.push({
      passed: false,
      message: "No YAML frontmatter found — agent files require --- delimited frontmatter",
    });
    return { checks, parsed: null, canProceed: false };
  }

  // --- Required fields ---

  // name
  const name = String(meta.name ?? "");
  if (!name) {
    checks.push({ passed: false, message: "Frontmatter missing: name" });
    blocking = true;
  } else if (name.length > 64) {
    checks.push({
      passed: false,
      message: `Name exceeds 64 characters (${name.length})`,
    });
    blocking = true;
  } else if (!NAME_PATTERN.test(name)) {
    checks.push({
      passed: false,
      message: `Invalid name: "${name}" — lowercase letters, numbers, and hyphens only`,
    });
    blocking = true;
  } else if (
    (RESERVED_AGENT_NAMES as readonly string[]).includes(name)
  ) {
    checks.push({
      passed: false,
      message: `Reserved agent name: "${name}" — conflicts with a Claude Code built-in agent`,
    });
    blocking = true;
  } else {
    checks.push({ passed: true, message: `name: ${name}` });
  }

  // description
  const description = String(meta.description ?? "");
  if (!description) {
    checks.push({ passed: false, message: "Frontmatter missing: description" });
    blocking = true;
  } else if (description.length > 1024) {
    checks.push({
      passed: false,
      message: `Description exceeds 1024 characters (${description.length})`,
    });
    blocking = true;
  } else {
    checks.push({ passed: true, message: "description present" });
  }

  // license
  const license = String(meta.license ?? "");
  if (!license) {
    checks.push({ passed: false, message: "Frontmatter missing: license" });
    blocking = true;
  } else if (
    !VALID_LICENSES.includes(license as (typeof VALID_LICENSES)[number])
  ) {
    checks.push({ passed: false, message: `Invalid license: "${license}"` });
    blocking = true;
  } else {
    checks.push({ passed: true, message: `license: ${license}` });
  }

  // body (system prompt)
  if (!body.trim()) {
    checks.push({
      passed: false,
      message: "No system prompt (markdown body) after frontmatter",
    });
    blocking = true;
  } else {
    checks.push({ passed: true, message: "System prompt present" });
  }

  // --- Optional fields (type/format validation) ---

  // version
  let version: string | null = null;
  if (meta.version != null) {
    const vStr = String(meta.version);
    if (!isValidSemver(vStr)) {
      checks.push({
        passed: false,
        message: `Invalid version: "${meta.version}" — must be semver (e.g. 1.0.0)`,
      });
      blocking = true;
    } else {
      version = vStr;
    }
  }

  // tools
  const tools = meta.tools != null ? String(meta.tools) : null;
  if (tools !== null && tools.trim() === "") {
    checks.push({
      passed: false,
      message: "tools field is empty — omit it to inherit all tools",
    });
    blocking = true;
  }

  // disallowedTools
  const disallowedTools =
    meta.disallowedTools != null ? String(meta.disallowedTools) : null;

  // model
  const model = meta.model != null ? String(meta.model) : null;
  if (
    model !== null &&
    !(VALID_MODEL_ALIASES as readonly string[]).includes(model) &&
    !MODEL_ID_PATTERN.test(model)
  ) {
    checks.push({
      passed: false,
      message: `Invalid model: "${model}" — use sonnet, opus, haiku, inherit, or a model ID like claude-sonnet-4-6`,
    });
    blocking = true;
  }

  // permissionMode
  const permissionMode =
    meta.permissionMode != null ? String(meta.permissionMode) : null;
  if (
    permissionMode !== null &&
    !(VALID_PERMISSION_MODES as readonly string[]).includes(permissionMode)
  ) {
    checks.push({
      passed: false,
      message: `Invalid permissionMode: "${permissionMode}" — must be one of: ${VALID_PERMISSION_MODES.join(", ")}`,
    });
    blocking = true;
  }

  // maxTurns
  let maxTurns: number | null = null;
  if (meta.maxTurns != null) {
    const n = Number(meta.maxTurns);
    if (!Number.isInteger(n) || n <= 0) {
      checks.push({
        passed: false,
        message: `Invalid maxTurns: "${meta.maxTurns}" — must be a positive integer`,
      });
      blocking = true;
    } else {
      maxTurns = n;
    }
  }

  // memory
  const memoryScope = meta.memory != null ? String(meta.memory) : null;
  if (
    memoryScope !== null &&
    !(VALID_MEMORY_SCOPES as readonly string[]).includes(memoryScope)
  ) {
    checks.push({
      passed: false,
      message: `Invalid memory: "${memoryScope}" — must be one of: ${VALID_MEMORY_SCOPES.join(", ")}`,
    });
    blocking = true;
  }

  // background
  const background =
    meta.background != null ? Boolean(meta.background) : false;

  // effort
  const effort = meta.effort != null ? String(meta.effort) : null;
  if (
    effort !== null &&
    !(VALID_EFFORT_LEVELS as readonly string[]).includes(effort)
  ) {
    checks.push({
      passed: false,
      message: `Invalid effort: "${effort}" — must be one of: ${VALID_EFFORT_LEVELS.join(", ")}`,
    });
    blocking = true;
  }

  // isolation
  const isolation = meta.isolation != null ? String(meta.isolation) : null;
  if (isolation !== null && isolation !== "worktree") {
    checks.push({
      passed: false,
      message: `Invalid isolation: "${isolation}" — must be "worktree"`,
    });
    blocking = true;
  }

  // compatibility
  const compatibility =
    meta.compatibility != null ? String(meta.compatibility) : null;
  if (compatibility && compatibility.length > 500) {
    checks.push({
      passed: false,
      message: `Compatibility exceeds 500 characters (${compatibility.length})`,
    });
  }

  // original-author
  const originalAuthor =
    meta["original-author"] != null ? String(meta["original-author"]) : null;
  if (originalAuthor && !isOpenSourceLicense(license)) {
    checks.push({
      passed: false,
      message: "original-author can only be set for open-source licenses",
    });
    blocking = true;
  }

  // --- Complex/opaque fields (structure validation only) ---

  // skills (array of strings)
  let skillsRefs: string[] | null = null;
  if (meta.skills != null) {
    if (!Array.isArray(meta.skills)) {
      checks.push({
        passed: false,
        message: "skills must be an array of strings",
      });
      blocking = true;
    } else {
      const invalid = meta.skills.find(
        (s: unknown) => typeof s !== "string" || !s.trim()
      );
      if (invalid !== undefined) {
        checks.push({
          passed: false,
          message: "skills must contain only non-empty strings",
        });
        blocking = true;
      } else {
        skillsRefs = meta.skills as string[];
      }
    }
  }

  // mcpServers (array of strings or objects)
  let mcpServers: unknown | null = null;
  if (meta.mcpServers != null) {
    if (!Array.isArray(meta.mcpServers)) {
      checks.push({
        passed: false,
        message: "mcpServers must be an array",
      });
      blocking = true;
    } else {
      mcpServers = meta.mcpServers;
    }
  }

  // hooks (object with event name keys)
  let hooks: unknown | null = null;
  if (meta.hooks != null) {
    if (typeof meta.hooks !== "object" || Array.isArray(meta.hooks)) {
      checks.push({
        passed: false,
        message: "hooks must be an object",
      });
      blocking = true;
    } else {
      hooks = meta.hooks;
    }
  }

  // initialPrompt
  const initialPrompt =
    meta.initialPrompt != null ? String(meta.initialPrompt) : null;

  const parsed: ParsedAgent = {
    name,
    description,
    license,
    version,
    tools,
    disallowedTools,
    model,
    permissionMode,
    maxTurns,
    memoryScope,
    background,
    effort,
    isolation,
    config: {
      hooks,
      mcpServers,
      skillsRefs,
      initialPrompt,
    },
    compatibility,
    originalAuthor,
    systemPrompt: body,
  };

  return { checks, parsed, canProceed: !blocking };
}
