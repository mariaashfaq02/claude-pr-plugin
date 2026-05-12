#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────────────────────
const EMAIL = process.env.BITBUCKET_EMAIL;
const TOKEN = process.env.BITBUCKET_API_TOKEN;

if (!EMAIL || !TOKEN) {
  process.stderr.write(
    "ERROR: BITBUCKET_EMAIL and BITBUCKET_API_TOKEN env vars are required.\n" +
    "Create an API token at: https://id.atlassian.com/manage-profile/security/api-tokens\n"
  );
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
const BASE = "https://api.bitbucket.org/2.0";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function bbFetch(path, opts = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bitbucket API ${res.status}: ${text}`);
  }
  return res.json();
}

/** Paginate through all pages of a Bitbucket list endpoint */
async function bbPaginate(path) {
  const results = [];
  let url = `${BASE}${path}`;
  while (url) {
    const data = await bbFetch(url);
    results.push(...(data.values || []));
    url = data.next || null;
  }
  return results;
}

/** Parse workspace/repo/prId from a full PR URL or return as-is */
function parsePrUrl(input) {
  const m = input.match(
    /bitbucket\.org\/([^/]+)\/([^/]+)\/pull-requests\/(\d+)/
  );
  if (m) return { workspace: m[1], repo: m[2], prId: m[3] };
  return null;
}

function isCodeAnt(comment) {
  const name = (comment?.author?.display_name || "").toLowerCase();
  const slug = (comment?.author?.nickname || "").toLowerCase();
  return name.includes("codeant") || slug.includes("codeant");
}

function formatComment(c) {
  return {
    id: c.id,
    author: c.author?.display_name || "unknown",
    isCodeAnt: isCodeAnt(c),
    resolved: c.resolution?.type === "RESOLVED",
    severity: c.severity || null,
    body: c.content?.raw || "",
    inline: c.inline
      ? { file: c.inline.path, line: c.inline.to ?? c.inline.from ?? null }
      : null,
    createdOn: c.created_on,
    parentId: c.parent?.id || null,
  };
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: "bitbucket-mcp",
  version: "1.0.0",
});

// ── Tool: get_pr_info ─────────────────────────────────────────────────────────
server.tool(
  "get_pr_info",
  "Get basic info about a Bitbucket Cloud PR (title, description, branch, author, state)",
  {
    pr_url: z
      .string()
      .describe(
        "Full Bitbucket PR URL, e.g. https://bitbucket.org/workspace/repo/pull-requests/123"
      ),
  },
  async ({ pr_url }) => {
    const parsed = parsePrUrl(pr_url);
    if (!parsed) throw new Error("Invalid PR URL format");
    const { workspace, repo, prId } = parsed;

    const pr = await bbFetch(
      `/repositories/${workspace}/${repo}/pullrequests/${prId}`
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: pr.id,
              title: pr.title,
              description: pr.description,
              state: pr.state,
              author: pr.author?.display_name,
              sourceBranch: pr.source?.branch?.name,
              destBranch: pr.destination?.branch?.name,
              createdOn: pr.created_on,
              updatedOn: pr.updated_on,
              url: pr.links?.html?.href,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: get_pr_comments ─────────────────────────────────────────────────────
server.tool(
  "get_pr_comments",
  "Fetch all comments on a Bitbucket Cloud PR. Returns inline + general comments with file/line info, author, severity, resolved status, and whether the comment is from CodeAnt AI.",
  {
    pr_url: z.string().describe("Full Bitbucket PR URL"),
    include_resolved: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include already-resolved comments (default: false)"),
    codeant_only: z
      .boolean()
      .optional()
      .default(false)
      .describe("Return only CodeAnt AI comments (default: false)"),
  },
  async ({ pr_url, include_resolved, codeant_only }) => {
    const parsed = parsePrUrl(pr_url);
    if (!parsed) throw new Error("Invalid PR URL format");
    const { workspace, repo, prId } = parsed;

    const raw = await bbPaginate(
      `/repositories/${workspace}/${repo}/pullrequests/${prId}/comments`
    );

    let comments = raw.map(formatComment);

    if (!include_resolved) {
      comments = comments.filter((c) => !c.resolved);
    }
    if (codeant_only) {
      comments = comments.filter((c) => c.isCodeAnt);
    }

    // Sort: CodeAnt first, then by severity (CRITICAL > MAJOR > MINOR > INFO > null)
    const severityOrder = { CRITICAL: 0, MAJOR: 1, MINOR: 2, INFO: 3 };
    comments.sort((a, b) => {
      if (a.isCodeAnt !== b.isCodeAnt) return a.isCodeAnt ? -1 : 1;
      const sa = severityOrder[a.severity] ?? 99;
      const sb = severityOrder[b.severity] ?? 99;
      return sa - sb;
    });

    const summary = {
      total: comments.length,
      codeAnt: comments.filter((c) => c.isCodeAnt).length,
      humanReviewer: comments.filter((c) => !c.isCodeAnt).length,
      bySeverity: {
        CRITICAL: comments.filter((c) => c.severity === "CRITICAL").length,
        MAJOR: comments.filter((c) => c.severity === "MAJOR").length,
        MINOR: comments.filter((c) => c.severity === "MINOR").length,
        INFO: comments.filter((c) => c.severity === "INFO").length,
        untagged: comments.filter((c) => !c.severity).length,
      },
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ summary, comments }, null, 2),
        },
      ],
    };
  }
);

// ── Tool: post_pr_comment ─────────────────────────────────────────────────────
server.tool(
  "post_pr_comment",
  "Post a comment or reply on a Bitbucket Cloud PR. To reply to an existing comment pass parent_comment_id.",
  {
    pr_url: z.string().describe("Full Bitbucket PR URL"),
    body: z.string().describe("Comment text (markdown supported)"),
    parent_comment_id: z
      .number()
      .optional()
      .describe("ID of the comment to reply to (for threaded replies)"),
    inline_file: z
      .string()
      .optional()
      .describe("File path for an inline comment"),
    inline_line: z
      .number()
      .optional()
      .describe("Line number for an inline comment"),
  },
  async ({ pr_url, body, parent_comment_id, inline_file, inline_line }) => {
    const parsed = parsePrUrl(pr_url);
    if (!parsed) throw new Error("Invalid PR URL format");
    const { workspace, repo, prId } = parsed;

    const payload = {
      content: { raw: body },
    };
    if (parent_comment_id) {
      payload.parent = { id: parent_comment_id };
    }
    if (inline_file && inline_line) {
      payload.inline = { path: inline_file, to: inline_line };
    }

    const result = await bbFetch(
      `/repositories/${workspace}/${repo}/pullrequests/${prId}/comments`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              commentId: result.id,
              url: result.links?.html?.href,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── Tool: find_pr_for_branch ──────────────────────────────────────────────────
server.tool(
  "find_pr_for_branch",
  "Find the open PR for a given branch name. Useful for auto-detecting the PR without needing a URL.",
  {
    workspace: z.string().describe("Bitbucket workspace slug"),
    repo: z.string().describe("Repository slug"),
    branch: z
      .string()
      .describe("Source branch name, e.g. TDLL-12313 or feature/my-branch"),
  },
  async ({ workspace, repo, branch }) => {
    const encoded = encodeURIComponent(`source.branch.name="${branch}" AND state="OPEN"`);
    const data = await bbFetch(
      `/repositories/${workspace}/${repo}/pullrequests?q=${encoded}`
    );

    const prs = (data.values || []).map((pr) => ({
      id: pr.id,
      title: pr.title,
      url: pr.links?.html?.href,
      state: pr.state,
      author: pr.author?.display_name,
      sourceBranch: pr.source?.branch?.name,
      destBranch: pr.destination?.branch?.name,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ found: prs.length, pullRequests: prs }, null, 2),
        },
      ],
    };
  }
);

// ── Tool: get_pr_diff ─────────────────────────────────────────────────────────
server.tool(
  "get_pr_diff",
  "Get the raw unified diff for a Bitbucket Cloud PR",
  {
    pr_url: z.string().describe("Full Bitbucket PR URL"),
  },
  async ({ pr_url }) => {
    const parsed = parsePrUrl(pr_url);
    if (!parsed) throw new Error("Invalid PR URL format");
    const { workspace, repo, prId } = parsed;

    const url = `${BASE}/repositories/${workspace}/${repo}/pullrequests/${prId}/diff`;
    const res = await fetch(url, {
      headers: { Authorization: AUTH, Accept: "text/plain" },
    });
    if (!res.ok) throw new Error(`Bitbucket API ${res.status}`);
    const diff = await res.text();

    return {
      content: [{ type: "text", text: diff }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("Bitbucket MCP server running\n");
