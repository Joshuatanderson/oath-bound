# oathbound

Install, verify, and publish Claude Code skills and agents from the [Oath Bound](https://oathbound.ai) registry.

Skills and agents are downloaded as tarballs from the registry and verified using SHA-256 content hashing. Every session start and every tool invocation can be checked against the registry to detect tampering.

## Installation

```sh
npm install -g oathbound
```

Or via npx (no install required):

```sh
npx oathbound <command>
```

## Quick start

```sh
oathbound init
```

The `init` wizard sets up Claude Code hooks (globally and in the current project) so that skills are verified on every session start and tool invocation.

## Commands

### Skills

```sh
oathbound pull <namespace/skill[@version]> [--global]   # Download & verify a skill
oathbound push [path] [--private]                        # Publish a skill to the registry
oathbound search [query]                                 # Search skills in the registry
oathbound list                                           # List all public skills
```

`pull` (aliases: `install`, `i`) downloads the latest version of a skill from the registry, verifies the tarball hash, and extracts it into `.claude/skills/`. Pin a specific version with `@1.2.3`. Use `--global` to install into `~/.claude/skills/` instead of the project directory.

### Agents

```sh
oathbound agent pull <namespace/name[@version]>   # Download an agent
oathbound agent push [path] [--private]            # Publish an agent .md file
oathbound agent search [query]                     # Search agents in the registry
oathbound agent list                               # List all public agents
```

### Verification (hooks)

```sh
oathbound verify          # SessionStart hook — verify all installed skills
oathbound verify --check  # PreToolUse hook — check skill integrity mid-session
```

### Auth

```sh
oathbound login    # Authenticate with oathbound.ai
oathbound logout   # Clear stored credentials
oathbound whoami   # Show current user
```

### Setup

```sh
oathbound init [--global|--local]   # Interactive setup wizard
oathbound setup                     # Non-interactive (runs via npm prepare hook)
```

`init` configures Claude Code hooks in your settings. By default it sets up both global (`~/.claude/settings.json`) and local (`.claude/settings.json`) hooks. Pass `--global` or `--local` to configure only one scope.

`setup` is meant to run automatically via the `prepare` script when someone installs your project's dependencies. It reads `.oathbound.jsonc` and merges hooks into `.claude/settings.json` without prompts.

## Hook integration

oathbound is designed to run as [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks). The easiest way to set this up is `oathbound init`, which adds the hooks to your `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "oathbound verify"
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "oathbound verify --check"
      }
    ]
  }
}
```

## How it works

1. **Pull**: Downloads a skill tarball from the registry, verifies the SHA-256 hash of the tarball, and extracts the skill into `.claude/skills/`.

2. **SessionStart verification**: Walks each subdirectory in `.claude/skills/`, collects all files (excluding `node_modules`, lockfiles, and `.DS_Store`), sorts them by path, hashes each file with SHA-256, then hashes the combined manifest. The resulting content hash is compared against the registry. Verified hashes are written to a temporary session state file.

3. **PreToolUse verification**: Re-hashes the skill directory on disk and compares it against the hash saved at session start. If the content has changed since verification, the tool invocation is denied. This detects mid-session tampering.

The content hash algorithm is deterministic: files are sorted lexicographically by relative path, each file is individually hashed, and the concatenated `path\0hash` lines are hashed together. The same algorithm runs on both the registry and the CLI to guarantee parity.

## License

MIT
