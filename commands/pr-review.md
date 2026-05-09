---
description: Review a Bitbucket Cloud PR — fetch CodeAnt + reviewer comments, plan fixes, apply, push, reply.
argument-hint: <bitbucket-pr-url>
---

The user wants you to review a Bitbucket PR and address its comments. Use the `bitbucket-pr` skill to handle the full workflow.

PR URL: $ARGUMENTS

Follow the skill exactly: fetch comments via the Chrome extension, present a plan, wait for the user's explicit "go" before touching code, apply fixes, push, then reply "Fixed in <sha>" on every addressed comment.

If `$ARGUMENTS` is empty or doesn't look like a `bitbucket.org/.../pull-requests/<id>` URL, ask the user for one before proceeding.
