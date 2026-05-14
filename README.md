# bitbucket-pr — Claude Code plugin

Read and reply to Bitbucket Cloud PR comments (CodeAnt AI + reviewers) directly from Claude Code.

> Paste a PR URL → Claude reads all comments → shows you a fix plan → waits for your approval → applies fixes → commits, pushes, and replies "Fixed in `<sha>`" on every comment.

---

## Two ways to use this

| | Option A — Chrome extension | Option B — MCP server |
|---|---|---|
| **Setup** | Zero — uses your browser session | Needs an Atlassian API token |
| **How it works** | Claude opens the PR in Chrome and reads it | Claude calls the Bitbucket REST API directly |
| **Structured data** | ❌ Scrapes page text | ✅ Clean JSON (severity, resolved, file/line) |
| **Fallback** | ✅ Always works if you're logged in | Requires token setup |

Both paths are included. Option A is tried first; Option B is available if you want cleaner results.

---

## Prerequisites

**All users:**
1. **Node.js 18+** — [nodejs.org](https://nodejs.org)
2. **Claude Code CLI:**
   ```powershell
   npm install -g @anthropic-ai/claude-code
   ```
   Verify: `claude --version`
   > Windows: if `claude` isn't found after install, add `%APPDATA%\npm` to your PATH.

**Option A only:**

3. **[Claude for Chrome](https://claude.ai/chrome)** extension — installed and signed in with the same Anthropic account as Claude Code.
4. **Logged into Bitbucket Cloud** in Chrome (your existing session is enough).

**Option B only:**

3. **Atlassian API token** — create one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

---

## Install — Plugin (Option A)

Open Claude Code and run these two commands:

```
/plugin marketplace add https://github.com/mariaashfaq02/claude-pr-plugin.git
```

```
/plugin install bitbucket-pr@mariaashfaq02-plugins
```

Restart Claude Code. Verify by typing `/` — you should see `/pr-review` in autocomplete.

---

## Install — MCP Server (Option B)

**1. Install dependencies:**
```powershell
cd path\to\claude-pr-plugin\mcp-server
npm install
```

**2. Register with Claude Code** (swap in your real values):
```powershell
claude mcp add bitbucket `
  -e BITBUCKET_EMAIL=you@company.com `
  -e BITBUCKET_API_TOKEN=your-token `
  -- node path\to\claude-pr-plugin\mcp-server\index.js
```

Restart Claude Code. You'll now have these tools available: `get_pr_comments`, `post_pr_comment`, `get_pr_info`, `find_pr_for_branch`, `get_pr_diff`.

---

## Usage

### Auto-trigger (recommended)
Just paste a PR URL:
```
fix the codeant comments on https://bitbucket.org/<workspace>/<repo>/pull-requests/123
```

### Slash command
```
/pr-review https://bitbucket.org/<workspace>/<repo>/pull-requests/123
```

### Auto-detect from current branch
```
/pr-review
```
No URL needed — Claude reads your current git branch and finds the open PR automatically.

---

## Workflow

1. **Claude fetches all comments** — inline + general, CodeAnt + reviewers
2. **Plan presented** — numbered, sorted by severity (CRITICAL first):
   ```
   Found 3 comments:
     1. [CodeAnt / CRITICAL] src/Api/Controller.cs:20 — Hardcoded password → use env var
     2. [CodeAnt / MAJOR]    src/Api/Controller.cs:53 — Divide by zero unguarded → throw on zero
     3. [Reviewer]           src/Api/Controller.cs:45 — HttpResponseMessage not disposed → using block
   Apply all three? Reply "go" to proceed.
   ```
3. **You approve, reject, or refine.** Claude never proceeds without your explicit "go".
4. **Fixes applied, committed, pushed.**
5. **"Fixed in `<sha>`" posted** on every addressed comment — including outdated/collapsed ones.

---

## What's NOT supported

- Bitbucket Server / Data Center (cloud only)
- Approving or merging PRs
- Marking comments as resolved (Bitbucket auto-resolves on next CodeAnt scan)
- GitHub / GitLab

---

## Troubleshooting

**"Chrome extension not connected"**
→ Make sure [Claude for Chrome](https://claude.ai/chrome) is installed and signed in. Then retry — or switch to Option B (MCP server).

**Comment shows as "OUTDATED"**
→ Expected. The skill automatically expands the collapsed modal and replies there too.

**`claude` not found after `npm install -g`**
→ Add npm's global bin to PATH:
- Windows: `%APPDATA%\npm`
- macOS/Linux: run `npm config get prefix` and add `/bin` to PATH

---

## Updates

```
/plugin marketplace update mariaashfaq02-plugins
/plugin update bitbucket-pr@mariaashfaq02-plugins
```

---

## Uninstall

```
/plugin uninstall bitbucket-pr@mariaashfaq02-plugins
/plugin marketplace remove mariaashfaq02-plugins
```

---

## License

MIT
