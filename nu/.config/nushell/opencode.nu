# OpenCode helpers

# Launch opencode with the plan agent to address PR review comments
def ocrc [] {
  opencode --agent plan --prompt "Look at the current PR's review comments using gh CLI commands. Identify any requested changes or actionable review feedback. Create a plan to address each valid comment, organized by file and priority."
}

# Launch opencode to review the current branch's PR
def ocpr [] {
  opencode --agent plan --prompt "@pr-reviewer Review the current branch's PR."
}

# Launch opencode after syncing Claude OAuth credentials from Keychain
def --wrapped oc [...args] {
  let auth_dst = ($"($env.HOME)/.local/share/opencode/auth.json" | path expand)
  let auth_tmp = $"($auth_dst).tmp"

  print "[INFO] Fetching Claude credentials from Keychain..."
  let keychain = (do { ^security find-generic-password -s "Claude Code-credentials" -w } | complete)
  if $keychain.exit_code != 0 {
    let stderr = ($keychain.stderr | str trim)
    error make { msg: $"Unable to fetch Claude credentials from Keychain: ($stderr)" }
  }

  let creds = ($keychain.stdout | from json)
  let access = ($creds | get claudeAiOauth.accessToken)
  let refresh = ($creds | get claudeAiOauth.refreshToken)
  let expires = ($creds | get claudeAiOauth.expiresAt)

  if ($access == null or $access == "") {
    error make { msg: "Could not extract access token from Keychain credentials" }
  }

  ^mkdir -p ($auth_dst | path dirname)
  let existing_auth = if ($auth_dst | path exists) {
    open $auth_dst
  } else {
    {}
  }

  let auth_json = (
    $existing_auth | upsert anthropic {
      type: "oauth"
      refresh: $refresh
      access: $access
      expires: $expires
    }
  )

  $auth_json | to json | save --force $auth_tmp

  print "[INFO] Moving generated file into place..."
  ^mv -v $auth_tmp $auth_dst

  print "[INFO] Done."
  ^opencode ...$args
}
