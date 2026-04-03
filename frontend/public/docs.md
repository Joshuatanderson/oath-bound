# Oathbound Documentation

Oathbound is the trust and verification layer for Claude Code skills and agents. It lets you install, verify, and publish skills from a public registry, with cryptographic integrity checks on every session start and tool invocation.

## Getting started

### Install

```sh
npm install -g oathbound
```

Or run directly with npx (no install required):

```sh
npx oathbound <command>
```

### Initialize

```sh
oathbound init
```

The `init` wizard sets up Claude Code hooks (globally and in the current project) so that skills are verified on every session start and tool invocation.

It will:

1. Create a `.oathbound.jsonc` config file in your project root
2. Add verification hooks to `.claude/settings.json` (local) and `~/.claude/settings.json` (global)
3. Prompt you to choose an enforcement level

Pass `--global` or `--local` to configure only one scope.

## Command reference

### Skills

```sh
oathbound pull <namespace/skill[@version]> [--global]   # Download & verify a skill
oathbound push [path] [--private]                        # Publish a skill to the registry
oathbound search [query]                                 # Search skills in the registry
oathbound list                                           # List all public skills
```

**pull** (aliases: `install`, `i`) downloads the latest version of a skill from the registry, verifies the tarball hash, and extracts it into `.claude/skills/`. Pin a specific version with `@1.2.3`. Use `--global` to install into `~/.claude/skills/` instead.

### Agents

```sh
oathbound agent pull <namespace/name[@version]>   # Download an agent
oathbound agent push [path] [--private]            # Publish an agent .md file
oathbound agent search [query]                     # Search agents in the registry
oathbound agent list                               # List all public agents
```

### Auth

```sh
oathbound login    # Authenticate with oathbound.ai
oathbound logout   # Clear stored credentials
oathbound whoami   # Show current user
```

### Setup (CI / automation)

```sh
oathbound setup
```

Non-interactive setup meant to run via the npm `prepare` script. Reads `.oathbound.jsonc` and merges hooks into `.claude/settings.json` without prompts. Add it to your `package.json`:

```json
{
  "scripts": {
    "prepare": "oathbound setup"
  }
}
```

## Configuration {#config}

Oathbound is configured via a `.oathbound.jsonc` file in your project root. The `init` command creates this file for you.

### Schema

```jsonc
// .oathbound.jsonc
{
  "$schema": "https://oathbound.ai/schemas/config-v1.json",
  "version": 1,
  "enforcement": "warn",
  "org": null
}
```

### Enforcement levels

The `enforcement` field controls what happens when a skill fails verification:

| Level | Behavior |
|---|---|
| `warn` | Log a warning but allow the session to continue. Skills that are not in the registry are flagged but not blocked. Good for getting started. |
| `registered` | Block skills that are not registered in the Oathbound registry. Every skill must have a matching registry entry with a valid content hash. |
| `audited` | Block skills that have not been audited by a verified third party. This is the strictest level — only skills with a completed audit pass verification. |

Start with `warn` to see what's happening, then move to `registered` or `audited` once your team is ready.

### Config fields

| Field | Type | Description |
|---|---|---|
| `$schema` | `string` | JSON Schema URL for editor autocompletion |
| `version` | `number` | Config format version (currently `1`) |
| `enforcement` | `"warn" \| "registered" \| "audited"` | Verification strictness level |
| `org` | `string \| null` | Organization scope (reserved for future use) |

## Hook integration

Oathbound runs as [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks). The `init` command adds these hooks to your `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "npx oathbound verify" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          { "type": "command", "command": "npx oathbound verify --check" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "npx oathbound verify --check" }
        ]
      }
    ]
  }
}
```

- **SessionStart**: Runs `oathbound verify` at the beginning of every Claude Code session. Walks each skill directory, hashes all files, and compares against the registry.
- **PreToolUse**: Runs `oathbound verify --check` before specific tool invocations. Re-hashes the skill directory and compares against the hash saved at session start to detect mid-session tampering.

## How verification works

1. **Pull**: Downloads a skill tarball from the registry, verifies the SHA-256 hash of the tarball, and extracts the skill into `.claude/skills/`.

2. **SessionStart verification**: Walks each subdirectory in `.claude/skills/`, collects all files (excluding `node_modules`, lockfiles, and `.DS_Store`), sorts them by path, hashes each file with SHA-256, then hashes the combined manifest. The resulting content hash is compared against the registry.

3. **PreToolUse verification**: Re-hashes the skill directory on disk and compares it against the hash saved at session start. If the content has changed since verification, the tool invocation is denied.

The content hash algorithm is deterministic: files are sorted lexicographically by relative path, each file is individually hashed, and the concatenated `path\0hash` lines are hashed together. The same algorithm runs on both the registry and the CLI to guarantee parity.

## Publishing

### Publishing a skill

```sh
oathbound push [path]
```

Publishes the skill at the given path (defaults to `.claude/skills/<name>`) to the registry. The skill must have a valid `skill.md` frontmatter with `name`, `description`, and `license` fields.

Add `--private` to publish as a private skill (only visible to you).

### Publishing an agent

```sh
oathbound agent push [path]
```

Publishes an agent markdown file to the registry. The agent file must have valid frontmatter with the required fields.

## License

MIT
