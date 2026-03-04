Less is more. Complexity breeds bugs. State should only be used when necessary, and stateless code is better.

- self-improve. When you run into an issue that you must remember in the next instance of yourself, note here, briefly.

- always consult when you hit a decision point, or are considering a destructive action. You don't need to consult when you are simply following a plan or executing a task where there is one clear right path.

- always use simple, dry code. Less is more. Bring up edge cases, but worry about the core case primarily.
- Never write code that silences failures from the user. Instead, provide clear error messages and consult with the user on how to handle unclear fail cases - this is important to not sweep issues under the rug.
- Test our own code when possible. Don't test truisms, or try to test third party code.

# Database
Whenever you will have to read or write to the database, NEVER assume you know structure. always look at our frontend/lib/database.types.ts file first, and read the relevant types

## Supabase CLI
- All migrations live in `frontend/supabase/migrations/` — always run `supabase` commands from `frontend/`, not the repo root.
- Use port **5432** (direct connection) for `supabase db push`. Port 6543 (transaction pooler) does not support prepared statements and will fail.
- If `supabase link` didn't capture the DB password, pass `--db-url` explicitly.

## Design
- always use shadcn and lucide as a base. Consult the user before pulling in any other packages.
- Before building any UI component (cards, dialogs, tables, etc.), always check if shadcn already provides one. Use the shadcn component — never recreate it with raw divs. If unsure whether a shadcn component exists, consult the user.
- Always design mobile first. Design for the smallest screen size first, then scale up.

## Architecture
- battle tested > exciting new implementation.
- Avoid dependencies for the sake of dependencies or because they are popular. Consider dependenceies when the domain is highly complex (like day.js or other date libraries) and has many gotchas.
- Use clear, extensible code. Prefer easily composable code. Always type thoroughly. Never suppress type errors without direct approval for the user. Consult the user on design patterns when it makes sense. Sometimes classes are the right tool, sometimes objects, etc.

## Subagents and teams
your context is critical. Do not pollute it.
- if a task is clearcut (like web search, or a simple refactor), do not do it yourself - assign to a subagent.
- if a task is complex, break it down into smaller tasks and assign to subagents or form an agent team.
- if a task is unclear or there are multiple ways to interpret, consult the user on how to proceed.

## Debugging
- if something is not working as expected, our #1 goal is to get a clean context feedback loop.
- Consider all inputs and outputs for the task. work with the user to ensure those feed into a log file(s) (not your context), and are easily searchable/readable by a subagent or several.
- work with the user to go through hypotheses, and keep a clear log of what is validated/unvalidated in a .md file so that yourself and other agents can see.

## Skills
- if you are interacting w an api that is one off, don't worry about making a skill.
- if you are interacting with an api that will likely be used again, consider making a skill - this can be a subagent/team's task, and then all future instances will benefit.

## Context for deployment
- you are deployed at oathbound.ai
