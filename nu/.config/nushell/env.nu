# Nushell Environment Config File

$env.EDITOR = "nvim"
$env.VISUAL = "nvim"

# Keep user-installed tools (including Mise) available in Nushell.
let user_bin = ($nu.home-path | path join ".local/bin")
if ($user_bin | path exists) {
  $env.PATH = ($env.PATH | prepend $user_bin)
}

# The prompt indicators are environmental variables that represent
# the state of the prompt
$env.PROMPT_INDICATOR = { "" }
$env.PROMPT_INDICATOR_VI_INSERT = { "" }
$env.PROMPT_INDICATOR_VI_NORMAL = { "| " }
$env.PROMPT_MULTILINE_INDICATOR = { "::: " }

# Specifies how environment variables are:
# - converted from a string to a value on Nushell startup (from_string)
# - converted from a value back to a string when running external commands (to_string)
# Note: The conversions happen *after* config.nu is loaded
$env.ENV_CONVERSIONS = {
  "PATH": {
	from_string: { |s| $s | split row (char esep) }
	to_string: { |v| $v | str join (char esep) }
  }
  "Path": {
	from_string: { |s| $s | split row (char esep) }
	to_string: { |v| $v | str join (char esep) }
  }
}

# Directories to search for scripts when calling source or use
#
# By default, <nushell-config-dir>/scripts is added
$env.NU_LIB_DIRS = [
	($nu.config-path | path dirname | path join 'scripts')
]

# Directories to search for plugin binaries when calling register
#
# By default, <nushell-config-dir>/plugins is added
$env.NU_PLUGIN_DIRS = [
	($nu.config-path | path dirname | path join 'plugins')
]

source ~/.config/nushell/profile.nu
source ~/.config/nushell/local.nu
source ~/.config/nushell/secrets.nu
