# bitbucket-pr — Claude Code plugin

Read and reply to Bitbucket Cloud PR comments (CodeAnt AI + reviewers) directly from Claude Code. **No API tokens required** — uses your existing browser session.

## What it does

Stop sending screenshots of PR comments. Paste the PR URL and Claude will:

1. Fetch all inline + general comments (CodeAnt AI included) with file:line context
2. Show you a numbered plan of proposed fixes — **stops and waits for your "go"**
3. After approval: apply fixes, commit, push
4. Reply "Fixed in &lt;sha&gt;" on every comment it addressed (including outdated/collapsed ones)

If you reject the plan or ask for changes, it iterates and re-asks — never assumes silence equals approval.

## Prerequisites

1. **Claude Code CLI** — install with npm:
   ```powershell
   npm install -g @anthropic-ai/claude-code
   ```
   Verify with `claude --version`. (Requires Node.js 18+. If `claude` isn't on PATH after install, add `%APPDATA%\npm` on Windows or `$(npm config get prefix)/bin` on macOS/Linux.)

2. **[Claude for Chrome](https://claude.ai/chrome)** extension — installed and signed in with the same Anthropic account you use for Claude Code. This is what lets the plugin read your Bitbucket session without a token.

3. **Logged into Bitbucket Cloud** in Chrome (your existing session — no extra action needed if you already use Bitbucket in your browser).

## Install

Open a terminal, run `claude` to launch Claude Code, then inside Claude Code run these **two slash commands**:

```
/plugin marketplace add https://github.com/mariaashfaq02/claude-pr-plugin.git
```

```
/plugin install bitbucket-pr@mariaashfaq02-plugins
```

Then **restart Claude Code** (close and reopen) so the plugin loads. Verify by typing `/` — you should see `/pr-review` in the autocomplete list.

## Usage

### Auto-trigger (recommended)

Just paste a PR URL into Claude:

```
fix the codeant comments on https://bitbucket.org/<workspace>/<repo>/pull-requests/123
```

The skill triggers automatically.

### Explicit slash command

```
/pr-review https://bitbucket.org/<workspace>/<repo>/pull-requests/123
```

Same workflow, just deliberate invocation.

## Workflow walkthrough

1. **Paste URL.** Claude opens the PR's diff page in your already-logged-in Chrome.
2. **Plan presented:**
   ```
   Found 3 CodeAnt comments on path/to/File.cs:
     1. Line 20 (Critical, security) — Hardcoded password. Fix: env var.
     2. Line 53 (Major, possible bug) — Divide unguarded. Fix: throw on zero.
     3. Line 45 (Major, resource leak) — HttpResponseMessage not disposed. Fix: using.
   Apply all three? Reply "go" to proceed.
   ```
3. **You approve / reject / refine.** Iterates until you say "go" explicitly.
4. **Fixes applied + pushed.**
5. **Replies posted** on each addressed comment with the commit SHA.

## What's NOT supported

- Bitbucket Server / Data Center (cloud only)
- Approving / merging PRs (read + reply only)
- Marking comments as resolved (Bitbucket auto-resolves on next CodeAnt scan, or you click Resolve manually)
- GitHub / GitLab (use the built-in `gh` CLI for GitHub)

## Troubleshooting

- **"Chrome extension not connected"** → install/sign in to Claude for Chrome, or fall back to the bundled `fetch-pr.ps1` (requires an Atlassian API token; see `skills/bitbucket-pr/SKILL.md` Option 3).
- **Comment is "OUTDATED" and collapsed** → expected; the skill clicks the "N other comments" button to expand the modal automatically.
- **Reply went to wrong comment** → cancel the reply box (Bitbucket warns about drafts), re-trigger.

## Updates

To pull the latest version after the maintainer pushes changes:

```
/plugin marketplace update mariaashfaq02-plugins
/plugin update bitbucket-pr@mariaashfaq02-plugins
```

## Uninstall

```
/plugin uninstall bitbucket-pr@mariaashfaq02-plugins
/plugin marketplace remove mariaashfaq02-plugins
```

## License

MIT
