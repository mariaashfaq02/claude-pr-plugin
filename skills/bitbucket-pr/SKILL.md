---
name: bitbucket-pr
description: Fetch a Bitbucket Cloud pull request's comments (CodeAnt AI + human reviewers) and diff so Claude can address them directly. Use when the user pastes a bitbucket.org PR URL or asks to "review/fix PR comments", "address CodeAnt comments", or similar. Replaces the workflow of pasting screenshots of PR comments. No token setup needed — uses the user's existing browser session by default.
---

# Bitbucket PR Skill

When the user pastes a Bitbucket PR URL or asks to fix PR/CodeAnt comments, follow this fallback chain in order. Stop at the first option that works.

---

## Option 1 — Chrome extension (preferred, no token needed)

The user is already logged into Bitbucket in Chrome. The Claude-for-Chrome extension can read `bitbucket.org` pages directly.

**Steps:**

1. Confirm the extension is connected: call `mcp__Claude_in_Chrome__tabs_context_mcp` with `createIfEmpty: true`. If it returns an error about the extension not being connected, skip to **Option 2**.

2. Navigate to the PR's **activity** view (it has all comments threaded):
   ```
   <PR_URL>/activity
   ```
   Use `mcp__Claude_in_Chrome__navigate`.

3. **Important:** the Chrome extension blocks `javascript_tool` and any `fetch()` with `credentials:'include'` (cookie/session-data guardrail). **Don't try those — they'll error with `[BLOCKED: Cookie/query string data]`.** Instead, navigate to the **`/diff`** view of the PR (`<PR_URL>/diff`), wait ~5s for the diff to render, scroll down a bit so inline comments lazy-load, then call `mcp__Claude_in_Chrome__get_page_text` — this returns the full diff with line numbers AND all inline CodeAnt + reviewer comments inlined under their referenced lines. Parse comments by looking for blocks following an author + timestamp pattern (e.g. `<Name>\n<N> minutes ago\n\nSuggestion: ...`).

   If the diff is large, you may need to scroll multiple times to force-render later sections before re-running `get_page_text`.

4. **Verify the local repo matches** the PR's repo via `git remote -v` before doing anything. If mismatched, stop and tell the user.

5. **Show a plan and get approval before any code changes.** Group comments by file → line. For each comment, propose a concrete fix in one short sentence. Then present the plan as a numbered list and STOP — wait for the user's go-ahead. Example format:

   > Found 3 CodeAnt comments on `path/to/File.cs`:
   >
   > 1. **Line 20 (Critical, security)** — Hardcoded DB password in connection string. *Fix: read from `USERS_DB_CONNECTION` env var, throw if missing.*
   > 2. **Line 53 (Major, possible bug)** — Divide doesn't guard zero. *Fix: throw `ArgumentException` when `b == 0`.*
   > 3. **Line 45 (Major, resource leak)** — `HttpResponseMessage` not disposed. *Fix: add `using` declaration.*
   >
   > Apply all three? Or skip / tweak any? Reply "go" to proceed.

   The user may approve all, approve some, reject some, or ask you to refine. Don't proceed until they explicitly say go.

   **Handling rejection / pushback:** if the user says "no", "not this way", proposes a different fix, or asks for something to change, do NOT touch any code. Instead:
   - If they gave specific guidance (e.g. "use IConfiguration instead of env vars", "throw a different exception type", "skip comment 2"), revise the plan with their changes and **re-present the full updated plan**, then ask for approval again.
   - If they pushed back vaguely ("I don't like this"), ask one targeted clarifying question — which comment, what concern, what would they prefer — then re-plan.
   - If they want to skip a comment entirely, drop it from the plan (don't fix it, don't post a reply on it).
   - Loop until they explicitly approve. Each iteration ends with the same `Apply? Reply "go" to proceed.` prompt.

   Never assume silence or ambiguity equals approval. "Looks ok" or "yeah maybe" are NOT go-signals — confirm explicitly.

6. After approval: ask before `git fetch && git checkout <branch>` if not already on it (don't auto-checkout if working tree is dirty). Apply approved fixes file-by-file. Commit + push.

7. **Reply on every comment whose underlying issue you fixed** (see the Posting Replies section below). Don't be selective — if it was on the approved plan AND you applied the fix, post the reply. Skipping replies leaves the team thinking the comment is unaddressed.

If the JS API calls return 401/403, the user's browser session expired — ask them to refresh Bitbucket and retry, then move to Option 2 if still failing.

---

## Option 2 — Reuse stored git credentials

If Option 1 fails (Chrome extension not connected), check if the user has cached Bitbucket credentials from prior `git push` operations:

```powershell
# Try Git Credential Manager
git credential-manager get 2>$null <<< "protocol=https`nhost=bitbucket.org`n`n"
# Or directly query Windows Credential Manager
cmdkey /list:bitbucket.org
```

If a credential is found, try it as Basic auth against `https://api.bitbucket.org/2.0/user` to verify it has API scope. If it works, use it the same way as Option 3's script (set vars in current session only — don't persist to user env).

If 401/403, the cached credential is git-only (common with OAuth-based credential managers). Move to Option 3.

---

## Option 3 — Manual token (last resort)

Tell the user:

> Browser scrape and cached git credentials both didn't work. The fallback is a one-time manual token (~90 seconds, then it works forever):
>
> 1. Open https://id.atlassian.com/manage-profile/security/api-tokens
> 2. **Create API token with scopes** → App: **Bitbucket** → tick `read:pullrequest:bitbucket` + `read:repository:bitbucket` → name `claude-code` → Create → copy
> 3. In PowerShell:
>    ```powershell
>    [Environment]::SetEnvironmentVariable('BITBUCKET_EMAIL','<your-email>','User')
>    [Environment]::SetEnvironmentVariable('BITBUCKET_API_TOKEN','<paste>','User')
>    ```
> 4. Restart Claude Code

Once the env vars are set, run the bundled fallback script:
```powershell
& "$env:USERPROFILE\.claude\skills\bitbucket-pr\fetch-pr.ps1" -PrUrl "<url>"
```

The script (already created at `~/.claude/skills/bitbucket-pr/fetch-pr.ps1`) handles parsing, auth, pagination, and structured output.

---

## Posting "Fixed in <commit>" replies (browser-only, no token)

After fixes are pushed, reply on every comment you addressed. Browser-driven, no API token, posts under the user's logged-in account.

**Per-comment loop (do this for ALL comments you fixed — don't skip any):**

1. Get the commit SHA once at the start: `git rev-parse --short HEAD`.
2. After pushing, the line a comment was anchored to may have changed → Bitbucket marks it **OUTDATED** and collapses it under a **"N other comments"** button at the top of the file in the diff view. To reply on those, click that button first to open the **"Comments on other versions"** modal.
3. Use `mcp__Claude_in_Chrome__find` with a query specific to each comment (e.g. `"Reply button on HttpResponseMessage comment"`) rather than a generic `"Reply button"` — the generic query returns multiple refs and you need to disambiguate.
4. Click the Reply ref. Take a screenshot. Find the textarea (right below the formatting toolbar).
5. Click into the textarea, `type` the message: `Fixed in <sha> — <one-line description of the fix>`.
6. Click **"Add comment now"** (NOT "Start review" — that batches replies into a draft review). It sits between "Start review" and "Cancel".
7. Confirm posting via screenshot — your reply should appear under the original comment with "0 seconds ago" timestamp. Then move to the next comment.

**Critical rules:**
- Reply on **every** comment whose underlying issue you fixed in the approved plan. Selective replying creates the impression of unfinished work.
- ONLY reply where the issue is *actually* fixed. If a comment was anchored to a different line than the one you changed (Bitbucket's anchor heuristic is line-literal, not semantic), verify the underlying issue is genuinely addressed before posting.
- If the open reply box is on the wrong comment, click "Cancel" before moving on.
- Don't open multiple reply boxes at once — Bitbucket will warn about unsaved drafts.

## General rules

- Never ask the user to paste a token/password into chat.
- Read-only by default for fetching. Posting replies is opt-in and requires user confirmation each time.
- Bitbucket Cloud only (`bitbucket.org`). For Bitbucket Server / Data Center, tell the user this skill doesn't support it.
- After applying fixes, summarize: what was addressed, what was skipped (with reasoning), what needs user input.
