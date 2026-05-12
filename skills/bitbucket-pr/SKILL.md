---
name: bitbucket-pr
description: Fetch a Bitbucket Cloud pull request's comments (CodeAnt AI + human reviewers) and diff so Claude can address them directly. Use when the user pastes a bitbucket.org PR URL or asks to "review/fix PR comments", "address CodeAnt comments", or similar. Replaces the workflow of pasting screenshots of PR comments.
---

# Bitbucket PR Skill

When the user pastes a Bitbucket PR URL or asks to fix PR/CodeAnt comments, follow this fallback chain in order. Stop at the first option that works.

---

## Option 1 — Bitbucket MCP (preferred, structured JSON)

Check if the `bitbucket` MCP is available by trying `get_pr_info` with the PR URL. If it returns data, use it — it gives you clean structured JSON, severity, resolved status, CodeAnt flagging, and reply support all without a browser.

**Steps:**

1. Call `get_pr_comments` with `include_resolved: false` — returns all open comments sorted by severity (CRITICAL first) with CodeAnt flagged.
2. Call `get_pr_diff` to get the unified diff for code context.
3. **Verify local repo:** `git remote -v` — make sure it matches the PR's workspace/repo.
4. **Show plan and get approval** (see Plan section below). STOP. Wait for "go".
5. After approval: apply fixes, commit, push.
6. **Reply on every fixed comment** using `post_pr_comment` with `parent_comment_id` = the comment's `id` field. Message: `Fixed in <sha> — <one-line description>`.

If `get_pr_info` errors (MCP not configured), fall through to Option 2.

---

## Option 2 — Chrome extension (no token needed)

The user is already logged into Bitbucket in Chrome. The Claude-for-Chrome extension can read `bitbucket.org` pages directly.

**Steps:**

1. Confirm extension is connected: call `mcp__Claude_in_Chrome__tabs_context_mcp` with `createIfEmpty: true`. If it errors, skip to Option 3.

2. Navigate to the PR's **`/diff`** view:
   ```
   <PR_URL>/diff
   ```
   Use `mcp__Claude_in_Chrome__navigate`. Wait ~5s for inline comments to render.

3. **Do NOT use `javascript_tool` or `fetch` with credentials** — blocked by the extension. Use `mcp__Claude_in_Chrome__get_page_text` — returns the full diff with all inline CodeAnt + reviewer comments. If the diff is large, scroll down and call again.

4. Parse comments: look for blocks with author + timestamp pattern, e.g.  
   `<Name>\n<N> minutes ago\n\nSuggestion: ...`

5. **Verify local repo**, **show plan**, **wait for approval** — same as Option 1 step 3-5.

6. Apply fixes, commit, push.

7. **Reply via browser** (see "Posting Replies via Browser" section below).

---

## Option 3 — Manual Atlassian API token (last resort)

If both options above fail, tell the user:

> Browser scrape and MCP both unavailable. One-time token setup (~2 minutes):
>
> 1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
> 2. Create API token → App: **Bitbucket** → scopes: `read:pullrequest:bitbucket` + `read:repository:bitbucket` → name `claude-code` → copy it
> 3. In PowerShell:
>    ```powershell
>    [Environment]::SetEnvironmentVariable('BITBUCKET_EMAIL','<your-email>','User')
>    [Environment]::SetEnvironmentVariable('BITBUCKET_API_TOKEN','<paste>','User')
>    ```
> 4. Set `PATH_TO_MCP_SERVER` in `.mcp.json` and restart Claude Code — next time Option 1 will work automatically.

For right now, run the fallback script:
```powershell
& "$env:USERPROFILE\.claude\skills\bitbucket-pr\fetch-pr.ps1" -PrUrl "<url>"
```

---

## Plan → Approval → Rejection loop

After fetching comments, always present a plan and STOP. Never touch code before explicit approval.

**Plan format:**
> Found N comments (X CodeAnt · Y reviewer):
>
> **CRITICAL**
> 1. `path/File.cs` line 20 — [CodeAnt] Hardcoded DB password. *Fix: read from `USERS_DB_CONNECTION` env var, throw if missing.*
>
> **MAJOR**
> 2. `path/File.cs` line 53 — [CodeAnt] Unguarded divide. *Fix: throw `ArgumentException` when `b == 0`.*
> 3. `path/File.cs` line 45 — [Reviewer: John] HttpResponseMessage not disposed. *Fix: `using` declaration.*
>
> Apply all 3? Reply **"go"** to proceed, or tell me what to change.

**Rejection / pushback handling:**
- If user says no / proposes different fix / asks for change → do NOT touch code. Revise plan and re-present it. Ask for approval again.
- If they want to skip a comment → remove it from plan. Don't fix it, don't reply on it.
- "Looks ok" or "yeah maybe" are NOT go-signals — confirm explicitly.
- Loop until explicit "go".

---

## Posting replies via browser (Option 2 fallback)

After fixing and pushing, reply on every addressed comment using the browser. Get the SHA first: `git rev-parse --short HEAD`.

**Per comment:**
1. If comment is marked **OUTDATED**, it's collapsed under a **"N other comments"** button in the diff view — click it to open the modal.
2. Use `mcp__Claude_in_Chrome__find` with a specific query (e.g. `"Reply button on HttpResponseMessage comment"`), not a generic one.
3. Click Reply → find textarea → type: `Fixed in <sha> — <one-line description>`.
4. Click **"Add comment now"** (NOT "Start review"). Confirm with screenshot.

**Rules:**
- Reply on **every** fixed comment. Skipping creates the impression of unfinished work.
- Don't open multiple reply boxes at once.
- Cancel any stray open reply box before opening a new one.

---

## General rules

- Never ask the user to paste a token/password into chat.
- Bitbucket Cloud only (`bitbucket.org`). Bitbucket Server / Data Center not supported.
- After applying fixes: summarize what was addressed, what was skipped, what needs user input.
