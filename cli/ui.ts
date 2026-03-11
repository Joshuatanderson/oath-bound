// --- ANSI (respect NO_COLOR standard: https://no-color.org) ---
export const USE_COLOR = process.env.NO_COLOR === undefined && process.stderr.isTTY;
export const TEAL = USE_COLOR ? '\x1b[38;2;63;168;164m' : ''; // brand teal #3fa8a4
export const GREEN = USE_COLOR ? '\x1b[32m' : '';
export const RED = USE_COLOR ? '\x1b[31m' : '';
export const YELLOW = USE_COLOR ? '\x1b[33m' : '';
export const DIM = USE_COLOR ? '\x1b[2m' : '';
export const BOLD = USE_COLOR ? '\x1b[1m' : '';
export const RESET = USE_COLOR ? '\x1b[0m' : '';

const BRAND_MARKS = ['✦', '✧', '✿', '⬡'];

export function brand(): string {
  return `${TEAL}${BOLD}⬡ oathbound${RESET}`;
}

export const BRAND = brand();

export function usage(exitCode = 1): never {
  console.log(`
${BOLD}oathbound${RESET} — install, verify, and publish skills

${DIM}Usage:${RESET}
  oathbound init                ${DIM}Setup wizard — configure project${RESET}
  oathbound pull <namespace/skill-name[@version]>
  oathbound install <namespace/skill-name[@version]>
  oathbound push [path]         ${DIM}Publish a skill to the registry${RESET}
  oathbound login               ${DIM}Authenticate with oathbound.ai${RESET}
  oathbound logout              ${DIM}Clear stored credentials${RESET}
  oathbound whoami              ${DIM}Show current user${RESET}
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
  let i = 0;
  const render = () => `\r${TEAL}${BOLD} ${BRAND_MARKS[i % BRAND_MARKS.length]} ${RESET}${TEAL}${text}${RESET}`;
  process.stdout.write(render());
  const interval = setInterval(() => {
    i++;
    process.stdout.write(render());
  }, 150);
  return {
    stop() {
      clearInterval(interval);
      process.stdout.write(USE_COLOR ? '\r\x1b[2K' : '\n');
    },
  };
}
