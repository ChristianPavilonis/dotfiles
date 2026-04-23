# Pi helpers

# Launch pi in plan mode to address PR review comments
# Requires the @ifi/pi-plan extension package.
def picrc [] {
  pi "/plan" "Look at the current PR's review comments using gh CLI commands. Identify any requested changes or actionable review feedback. Create a plan to address each valid comment, organized by file and priority."
}

# Launch pi in plan mode to review the current branch's PR
# Requires the @ifi/pi-plan extension package.
def pipr [] {
  pi "using the pr-reviewer review the current branch's PR."
}

