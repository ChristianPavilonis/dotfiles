# Nushell Config File

# Theme colors are generated from themes/*/{dark,light}.json.
# Set DOTFILES_THEME_VARIANT=light before starting Nushell to use the light variant.
source ~/.config/nushell/theme.nu

let theme_variant = ($env | get -o DOTFILES_THEME_VARIANT | default (fallout-default-variant))
let theme_color_config = (fallout-color-config $theme_variant)
let theme_explore_config = (fallout-explore-config $theme_variant)

# External completer example
# let carapace_completer = {|spans|
#     carapace $spans.0 nushell $spans | from json
# }


# The default config record. This is where much of your global configuration is setup.
$env.config = {
  ls: {
    use_ls_colors: false # use the LS_COLORS environment variable to colorize output
    clickable_links: true # enable or disable clickable links. Your terminal has to support links.
  }
  rm: {
    always_trash: false # always act as if -t was given. Can be overridden with -p
  }
  table: {
    mode: rounded # basic, compact, compact_double, light, thin, with_love, rounded, reinforced, heavy, none, other
    index_mode: always # "always" show indexes, "never" show indexes, "auto" = show indexes when a table has "index" column
    trim: {
      methodology: wrapping # wrapping or truncating
      wrapping_try_keep_words: true # A strategy used by the 'wrapping' methodology
      truncating_suffix: "..." # A suffix used by the 'truncating' methodology
    }
  }

  explore: $theme_explore_config

  history: {
    max_size: 10000 # Session has to be reloaded for this to take effect
    sync_on_enter: true # Enable to share history between multiple sessions, else you have to close the session to write history to file
    file_format: "plaintext" # "sqlite" or "plaintext"
  }
  completions: {
    case_sensitive: false # set to true to enable case-sensitive completions
    quick: true  # set this to false to prevent auto-selecting completions when only one remains
    partial: true  # set this to false to prevent partial filling of the prompt
    algorithm: "prefix"  # prefix or fuzzy
    external: {
      enable: true # set to false to prevent nushell looking into $env.PATH to find more suggestions, `false` recommended for WSL users as this look up my be very slow
      max_results: 100 # setting it lower can improve completion performance at the cost of omitting some options
      completer: null # check 'carapace_completer' above as an example
    }
  }
  filesize: {
    # what goes here?
  }
  color_config: $theme_color_config
  footer_mode: "never" # always, never, number_of_rows, auto
  float_precision: 2
  # buffer_editor: "emacs" # command that will be used to edit the current line buffer with ctrl+o, if unset fallback to $env.EDITOR and $env.VISUAL
  use_ansi_coloring: true
  edit_mode: vi # emacs, vi
  show_banner: false # true or false to enable or disable the banner
  render_right_prompt_on_last_line: false # true or false to enable or disable right prompt to be rendered on last line of the prompt.

  hooks: {
    pre_prompt: [{
      null  # replace with source code to run before the prompt is shown
    }]
    pre_execution: [{
      null  # replace with source code to run before the repl input is run
    }]
    env_change: {
      PWD: [{|before, after|
	null  # replace with source code to run if the PWD environment is different since the last repl input
      }]
    }
    display_output: {
      if (term size).columns >= 100 { table -e } else { table }
    }
  }
  menus: [
      # Configuration for default nushell menus
      # Note the lack of source parameter
      {
	name: completion_menu
	only_buffer_difference: false
	marker: "| "
	type: {
	    layout: columnar
	    columns: 4
	    col_width: 20   # Optional value. If missing all the screen width is used to calculate column width
	    col_padding: 2
	}
	style: {
	    text: green
	    selected_text: green_reverse
	    description_text: green_bold
	}
      }
      {
	name: history_menu
	only_buffer_difference: true
	marker: "? "
	type: {
	    layout: list
	    page_size: 10
	}
	style: {
	    text: green
	    selected_text: green_reverse
	    description_text: green_bold
	}
      }
      {
	name: help_menu
	only_buffer_difference: true
	marker: "? "
	type: {
	    layout: description
	    columns: 4
	    col_width: 20   # Optional value. If missing all the screen width is used to calculate column width
	    col_padding: 2
	    selection_rows: 4
	    description_rows: 10
	}
	style: {
	    text: green
	    selected_text: green_reverse
	    description_text: green_bold
	}
      }
      # Example of extra menus created using a nushell source
      # Use the source field to create a list of records that populates
      # the menu
      {
	name: commands_menu
	only_buffer_difference: false
	marker: "# "
	type: {
	    layout: columnar
	    columns: 4
	    col_width: 20
	    col_padding: 2
	}
	style: {
	    text: green
	    selected_text: green_reverse
	    description_text: green_bold
	}
	source: { |buffer, position|
	    $nu.scope.commands
	    | where name =~ $buffer
	    | each { |it| {value: $it.name description: $it.usage} }
	}
      }
      {
	name: vars_menu
	only_buffer_difference: true
	marker: "# "
	type: {
	    layout: list
	    page_size: 10
	}
	style: {
	    text: green
	    selected_text: green_reverse
	    description_text: green_bold
	}
	source: { |buffer, position|
	    $nu.scope.vars
	    | where name =~ $buffer
	    | sort-by name
	    | each { |it| {value: $it.name description: $it.type} }
	}
      }
      {
	name: commands_with_description
	only_buffer_difference: true
	marker: "# "
	type: {
	    layout: description
	    columns: 4
	    col_width: 20
	    col_padding: 2
	    selection_rows: 4
	    description_rows: 10
	}
	style: {
	    text: green
	    selected_text: green_reverse
	    description_text: green_bold
	}
	source: { |buffer, position|
	    $nu.scope.commands
	    | where name =~ $buffer
	    | each { |it| {value: $it.name description: $it.usage} }
	}
      }
  ]
  keybindings: [
    {
      name: completion_menu
      modifier: none
      keycode: tab
      mode: [emacs vi_normal vi_insert]
      event: {
	until: [
	  { send: menu name: completion_menu }
	  { send: menunext }
	]
      }
    }
    {
      name: completion_previous
      modifier: shift
      keycode: backtab
      mode: [emacs, vi_normal, vi_insert] # Note: You can add the same keybinding to all modes by using a list
      event: { send: menuprevious }
    }
    {
      name: history_menu
      modifier: control
      keycode: char_r
      mode: emacs
      event: { send: menu name: history_menu }
    }
    {
      name: next_page
      modifier: control
      keycode: char_x
      mode: emacs
      event: { send: menupagenext }
    }
    {
      name: undo_or_previous_page
      modifier: control
      keycode: char_z
      mode: emacs
      event: {
	until: [
	  { send: menupageprevious }
	  { edit: undo }
	]
       }
    }
    {
      name: yank
      modifier: control
      keycode: char_y
      mode: emacs
      event: {
	until: [
	  {edit: pastecutbufferafter}
	]
      }
    }
    {
      name: unix-line-discard
      modifier: control
      keycode: char_u
      mode: [emacs, vi_normal, vi_insert]
      event: {
	until: [
	  {edit: cutfromlinestart}
	]
      }
    }
    {
      name: kill-line
      modifier: control
      keycode: char_k
      mode: [emacs, vi_normal, vi_insert]
      event: {
	until: [
	  {edit: cuttolineend}
	]
      }
    }
    # Keybindings used to trigger the user defined menus
    {
      name: commands_menu
      modifier: control
      keycode: char_t
      mode: [emacs, vi_normal, vi_insert]
      event: { send: menu name: commands_menu }
    }
    {
      name: vars_menu
      modifier: alt
      keycode: char_o
      mode: [emacs, vi_normal, vi_insert]
      event: { send: menu name: vars_menu }
    }
    {
      name: commands_with_description
      modifier: control
      keycode: char_s
      mode: [emacs, vi_normal, vi_insert]
      event: { send: menu name: commands_with_description }
    }
  ]
}


use ($nu.default-config-dir | path join mise.nu)
