# oathbound

Install and verify Claude Code skills from the [Oath Bound](https://oathbound.ai) registry.

Skills are downloaded as tarballs from the registry and verified using SHA-256 content hashing. Every session start and every tool invocation can be checked against the registry to detect tampering.

## Installation

Requires the [Bun](https://bun.sh) runtime.

```sh
bun add -g oathbound
```

Or via npm:

```sh
npm install -g oathbound
```

## Usage

### Install a skill

```sh
oathbound pull <namespace/skill-name>
oathbound install <namespace/skill-name>
```

Downloads the latest version of a skill from the registry, verifies the tarball hash, and extracts it into your `.claude/skills/` directory.

### Verify all installed skills (SessionStart hook)

```sh
oathbound verify
```

Reads session context from stdin, hashes every skill directory under `.claude/skills/`, and compares each hash against the registry. Writes a session state file so subsequent checks are fast. Exits non-zero if any skill fails verification.

### Check a skill before tool execution (PreToolUse hook)

```sh
oathbound verify --check
```

Reads tool invocation context from stdin, re-hashes the relevant skill directory, and compares it against the hash recorded at session start. If the skill was modified after verification, the hook denies execution.

## Hook integration

oathbound is designed to run as [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks). Add it to your `.claude/settings.json`:

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

1. **Pull**: Downloads a skill tarball from Supabase storage, verifies the SHA-256 hash of the tarball against the registry, and extracts the skill into `.claude/skills/`.

2. **SessionStart verification**: Walks each subdirectory in `.claude/skills/`, collects all files (excluding `node_modules`, lockfiles, and `.DS_Store`), sorts them by path, hashes each file with SHA-256, then hashes the combined manifest. The resulting content hash is compared against the registry. Verified hashes are written to a temporary session state file.

3. **PreToolUse verification**: Re-hashes the skill directory on disk and compares it against the hash saved at session start. If the content has changed since verification, the tool invocation is denied. This detects mid-session tampering.

The content hash algorithm is deterministic: files are sorted lexicographically by relative path, each file is individually hashed, and the concatenated `path\0hash` lines are hashed together. The same algorithm runs on both the registry (frontend) and the CLI to guarantee parity.

## License

Apache 2.0
