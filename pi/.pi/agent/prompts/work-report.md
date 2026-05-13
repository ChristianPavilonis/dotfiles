---
description: Estimate Pi-tracked hours and summarize work using the worklog Nushell helpers
---
Produce a work report from the Pi worklog tools.

User request / filters:
$@

Common use cases this command should handle well:
- estimate hours for a specific repo on a specific day
- summarize work for a repo/day
- produce a timesheet-style summary
- estimate time for today when no date is given
- summarize work for a natural-language date like “last Friday”
- call out which branches were touched for a repo/day

When the request maps cleanly to a repo/day estimate, prefer a `worklog report-context` invocation that includes:
- the resolved date
- `--repo` when the repo is clear
- a concise `--question` value that restates the request

Required workflow:
1. Prefer the deterministic Nushell worklog helpers over reading raw `~/.pi/agent/logs/*.jsonl` directly.
2. Infer the smallest reasonable filter set from the request:
   - date (default to today if unspecified)
   - repo, branch, cwd, and/or source if the user clearly asked for them
   - Resolve day-level dates in the user's local timezone, not UTC.
   - Treat the worklog's local-date model as authoritative for day grouping:
     - log files are grouped by local `YYYY-MM-DD`
     - each record's `date` field is local date
     - `utcDate` is metadata only and should not drive “today”/“yesterday”/weekday resolution unless the user explicitly asks for UTC
3. Run the worklog helper through Nushell login shell mode so the functions from `nu/.config/nushell/pi.nu` are loaded.
   - Always use `nu -l -c '...'`, not plain `nu -c '...'`.
   - Primary command shape:
     - `nu -l -c 'worklog report-context DATE [--repo REPO] [--branch BRANCH] [--cwd CWD] [--source SOURCE] [--question "..."] | to json'`
   - Include a concise `--question` value that restates the user’s request.
   - Useful follow-up inspection commands when needed:
     - `nu -l -c 'worklog report-context DATE [--repo REPO] | get totals'`
     - `nu -l -c 'worklog report-context DATE [--repo REPO] | get sessions | to json'`
     - `nu -l -c 'worklog report-context DATE [--repo REPO] | get branches | to json'`
     - `nu -l -c 'worklog report-context DATE [--repo REPO] | get timeline | to json'`
   - If the user may have picked the wrong repo filter, inspect available repo names first with:
     - `nu -l -c 'worklog report-context DATE | get repos'`
4. Base the report primarily on the structured `worklog report-context` output.
5. Only inspect raw log files or run extra commands if the report-context output is missing something important.

Output requirements:
- Start with the assumptions you made about date/filter defaults, including the resolved local date when the user says things like `today`, `yesterday`, or `last Friday`.
- Report estimated hours and minutes clearly.
- For project/day hour-estimate requests, lead with a direct answer like: `Estimated Pi-tracked time for trusted-server on 2026-04-23: 0.34 hours (about 20 minutes).`
- State that this is a rough estimate of Pi-tracked interactive work, not a full accounting of all coding time.
- Summarize the main work themes and actions from the timeline/sessions.
- Call out notable repos, branches, directories, slash commands, or sessions when relevant.
- Include caveats or low-confidence notes when the evidence is sparse.

Constraints:
- Do not invent work that is not supported by the worklog data.
- Prefer concise, practical summaries unless the user explicitly asks for a detailed report.
- If there is little or no matching data, say that plainly and include the filters you used.
