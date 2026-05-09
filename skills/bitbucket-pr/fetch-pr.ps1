# Fetches a Bitbucket Cloud PR's metadata, comments, and diff.
# Usage: .\fetch-pr.ps1 -PrUrl "https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>"
#
# Requires env vars (Atlassian API token with scopes — app passwords are deprecated):
#   BITBUCKET_EMAIL      - your Atlassian account email
#   BITBUCKET_API_TOKEN  - API token with scopes: read:pullrequest:bitbucket, read:repository:bitbucket
#                          Created at: https://id.atlassian.com/manage-profile/security/api-tokens

param(
    [Parameter(Mandatory=$true)]
    [string]$PrUrl,

    [switch]$IncludeResolved,
    [switch]$NoDiff
)

$ErrorActionPreference = 'Stop'

# ---- creds ----
$user = $env:BITBUCKET_EMAIL
$pass = $env:BITBUCKET_API_TOKEN
if (-not $user -or -not $pass) {
    Write-Error "BITBUCKET_EMAIL and BITBUCKET_API_TOKEN env vars must be set. See ~/.claude/skills/bitbucket-pr/SKILL.md."
    exit 1
}
$pair = "${user}:${pass}"
$basicAuth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
$headers = @{ Authorization = "Basic $basicAuth"; Accept = 'application/json' }

# ---- parse URL ----
# https://bitbucket.org/{workspace}/{repo}/pull-requests/{id}[/...]
if ($PrUrl -notmatch 'bitbucket\.org/([^/]+)/([^/]+)/pull-requests/(\d+)') {
    Write-Error "URL doesn't look like a Bitbucket PR URL. Expected: https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>"
    exit 1
}
$workspace = $Matches[1]
$repo      = $Matches[2]
$prId      = $Matches[3]

$apiBase = "https://api.bitbucket.org/2.0/repositories/$workspace/$repo/pullrequests/$prId"

function Invoke-BB($url) {
    try {
        return Invoke-RestMethod -Uri $url -Headers $headers -Method GET
    } catch {
        Write-Error "Bitbucket API error for $url`: $($_.Exception.Message)"
        exit 1
    }
}

# Paginate Bitbucket's `values` arrays.
function Get-AllPages($url) {
    $items = @()
    $next = $url
    while ($next) {
        $page = Invoke-BB $next
        if ($page.values) { $items += $page.values }
        $next = $page.next
    }
    return $items
}

# ---- fetch ----
$pr       = Invoke-BB $apiBase
$comments = Get-AllPages "$apiBase/comments?pagelen=100"

# ---- output ----
"# PR #$prId - $($pr.title)"
""
"**Repo:** $workspace/$repo"
"**Author:** $($pr.author.display_name)"
"**State:** $($pr.state)"
"**Source:** $($pr.source.branch.name) -> **Dest:** $($pr.destination.branch.name)"
"**URL:** $($pr.links.html.href)"
""
"## Description"
""
if ($pr.description) { $pr.description } else { "_(no description)_" }
""

# Filter & group comments
$active = $comments | Where-Object {
    -not $_.deleted -and ($IncludeResolved -or -not $_.resolution)
}

$inline  = $active | Where-Object { $_.inline }
$general = $active | Where-Object { -not $_.inline }

"## Inline comments ($($inline.Count))"
""
if ($inline.Count -eq 0) {
    "_(none)_"
} else {
    # group by file path
    $byFile = $inline | Group-Object { $_.inline.path } | Sort-Object Name
    foreach ($g in $byFile) {
        "### $($g.Name)"
        ""
        $sorted = $g.Group | Sort-Object {
            if ($_.inline.to) { [int]$_.inline.to }
            elseif ($_.inline.from) { [int]$_.inline.from }
            else { 0 }
        }
        foreach ($c in $sorted) {
            $line = if ($c.inline.to) { "L$($c.inline.to)" }
                    elseif ($c.inline.from) { "L$($c.inline.from) (old)" }
                    else { "(file-level)" }
            $author = $c.user.display_name
            $resolved = if ($c.resolution) { " [RESOLVED]" } else { "" }
            "**$line - $author$resolved**"
            ""
            ($c.content.raw -replace '(?m)^', '> ')
            ""
        }
    }
}
""

"## General comments ($($general.Count))"
""
if ($general.Count -eq 0) {
    "_(none)_"
} else {
    foreach ($c in $general) {
        $author = $c.user.display_name
        $resolved = if ($c.resolution) { " [RESOLVED]" } else { "" }
        "**$author$resolved**"
        ""
        ($c.content.raw -replace '(?m)^', '> ')
        ""
    }
}

if (-not $NoDiff) {
    ""
    "## Diff"
    "(Fetch separately with: ``Invoke-RestMethod -Uri '$apiBase/diff' -Headers `$headers``)"
    "Skipped inline to keep output small. Pass without -NoDiff and pipe to file if needed."
}
