# Nushell Environment Config File

$env.EDITOR = "nvim"
$env.VISUAL = "nvim"

# Keep user-installed tools (including Mise) available in Nushell.
let user_bin = ($nu.home-dir | path join ".local/bin")
let mise_shims = ($nu.home-dir | path join ".local/share/mise/shims")
$env.PATH = ($env.PATH | prepend ([$user_bin, $mise_shims] | where {|path| $path | path exists}))

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

# Starship reads the generated file on every prompt, so theme changes apply
# without restarting Nushell.
const omarchy_starship_config = "~/.local/state/omarchy/current/theme/starship.toml"
if ($omarchy_starship_config | path exists) {
  $env.STARSHIP_CONFIG = ($omarchy_starship_config | path expand)
}

# Zellij does not expand ~ or environment variables in theme_dir. The installer
# creates this portable runtime directory with links to the config and theme.
const omarchy_zellij_config = "~/.local/state/dotfiles/zellij"
if ($omarchy_zellij_config | path exists) {
  $env.ZELLIJ_CONFIG_DIR = ($omarchy_zellij_config | path expand)
}

source ~/.config/nushell/profile.nu
source ~/.config/nushell/local.nu
source ~/.config/nushell/secrets.nu
