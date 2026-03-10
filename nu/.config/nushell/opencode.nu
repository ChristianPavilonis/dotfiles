# OpenCode helpers

# Launch opencode with the plan agent to address PR review comments
def ocrc [] {
  opencode --agent plan --prompt "Look at the current PR's review comments using gh CLI commands. Identify any requested changes or actionable review feedback. Create a plan to address each valid comment, organized by file and priority."
}

# Launch opencode to review the current branch's PR
def octspr [] {
  opencode --model "openai/gpt-5.3-codex" --agent plan --prompt "@trusted-server-pr-reviewer Review the current branch's PR. (also take in account any existing reviews)"
}
