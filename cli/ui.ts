// --- ANSI (respect NO_COLOR standard: https://no-color.org) ---
export const USE_COLOR = process.env.NO_COLOR === undefined && process.stderr.isTTY;
export const TEAL = USE_COLOR ? '\x1b[38;2;63;168;164m' : ''; // brand teal #3fa8a4
export const GREEN = USE_COLOR ? '\x1b[32m' : '';
export const RED = USE_COLOR ? '\x1b[31m' : '';
export const YELLOW = USE_COLOR ? '\x1b[33m' : '';
export const DIM = USE_COLOR ? '\x1b[2m' : '';
export const BOLD = USE_COLOR ? '\x1b[1m' : '';
export const RESET = USE_COLOR ? '\x1b[0m' : '';

export const BRAND = `${TEAL}${BOLD}🛡️ oathbound${RESET}`;

export function usage(exitCode = 1): never {
  console.log(`
${BOLD}oathbound${RESET} — install and verify skills

${DIM}Usage:${RESET}
  oathbound init                ${DIM}Setup wizard — configure project${RESET}
  oathbound pull <namespace/skill-name>
  oathbound install <namespace/skill-name>
  oathbound verify              ${DIM}SessionStart hook — verify all skills${RESET}
  oathbound verify --check      ${DIM}PreToolUse hook — check skill integrity${RESET}

${DIM}Options:${RESET}
  --help, -h      Show this help message
  --version, -v   Show version
`);
  process.exit(exitCode);
}

export function fail(message: string, detail?: string): never {
  console.log(`\n${BOLD}${RED} ✗ ${message}${RESET}`);
  if (detail) {
    console.log(`${RED}   ${detail}${RESET}`);
  }
  process.exit(1);
}

export function spinner(text: string): { stop: () => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  process.stdout.write(`${TEAL} ${frames[0]} ${text}${RESET}`);
  const interval = setInterval(() => {
    i = (i + 1) % frames.length;
    process.stdout.write(`\r${TEAL} ${frames[i]} ${text}${RESET}`);
  }, 80);
  return {
    stop() {
      clearInterval(interval);
      process.stdout.write(USE_COLOR ? '\r\x1b[2K' : '\n');
    },
  };
}
