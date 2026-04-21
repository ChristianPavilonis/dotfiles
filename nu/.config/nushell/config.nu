# Nushell Config File

# For more information on themes, see
# https://www.nushell.sh/book/coloring_and_theming.html
let dark_theme = {
    # color for nushell primitives
    separator: green
    leading_trailing_space_bg: { attr: n } # no fg, no bg, attr none effectively turns this off
    header: green_bold
    empty: green
    # Closures can be used to choose colors for specific values.
    # The value (in this case, a bool) is piped into the closure.
    bool: { if $in { 'green_bold' } else { 'green' } }
    int: green
    filesize: {|e|
      if $e == 0b {
	'green'
      } else if $e < 1mb {
	'green'
      } else { 'green' }
    }
    duration: green
    date: { (date now) - $in |
      if $in < 1hr {
	'#9cff57'
      } else if $in < 6hr {
	'#73c95a'
      } else if $in < 1day {
	'#73c95a'
      } else if $in < 3day {
	'#73c95a'
      } else if $in < 1wk {
	'#9cff57'
      } else if $in < 6wk {
	'#73c95a'
      } else if $in < 52wk {
	'#73c95a'
      } else { 'green' }
    }
    range: green
    float: green
    string: green
    nothing: green
    binary: green
    cellpath: green
    row_index: green_bold
    record: green
    list: green
    block: green
    hints: green

    shape_and: green_bold
    shape_binary: green_bold
    shape_block: green_bold
    shape_bool: green_bold
    shape_custom: green
    shape_datetime: green_bold
    shape_directory: green
    shape_external: green
    shape_externalarg: green_bold
    shape_filepath: green
    shape_flag: green_bold
    shape_float: green_bold
    # shapes are used to change the cli syntax highlighting
    shape_garbage: { fg: "#9cff57" bg: "#4a7a3f" attr: b}
    shape_globpattern: green_bold
    shape_int: green_bold
    shape_internalcall: green_bold
    shape_list: green_bold
    shape_literal: green
    shape_matching_brackets: { attr: u }
    shape_nothing: green_bold
    shape_operator: green
    shape_or: green_bold
    shape_pipe: green_bold
    shape_range: green_bold
    shape_record: green_bold
    shape_redirection: green_bold
    shape_signature: green_bold
    shape_string: green
    shape_string_interpolation: green_bold
    shape_table: green_bold
    shape_variable: green
}

let light_theme = {
    # color for nushell primitives
    separator: green
    leading_trailing_space_bg: { attr: n } # no fg, no bg, attr none effectively turns this off
    header: green_bold
    empty: green
    # Closures can be used to choose colors for specific values.
    # The value (in this case, a bool) is piped into the closure.
    bool: { if $in { 'green_bold' } else { 'green' } }
    int: green
    filesize: {|e|
      if $e == 0b {
	'green'
      } else if $e < 1mb {
	'green_bold'
      } else { 'green_bold' }
    }
    duration: green
  date: { (date now) - $in |
    if $in < 1hr {
      'green_bold'
    } else if $in < 6hr {
      'green'
    } else if $in < 1day {
      'green_bold'
    } else if $in < 3day {
      'green_bold'
    } else if $in < 1wk {
      'green_bold'
    } else if $in < 6wk {
      'green'
    } else if $in < 52wk {
      'green_bold'
    } else { 'green' }
  }
    range: green
    float: green
    string: green
    nothing: green
    binary: green
    cellpath: green
    row_index: green_bold
    record: green
    list: green
    block: green
    hints: green

    shape_and: green_bold
    shape_binary: green_bold
    shape_block: green_bold
    shape_bool: green_bold
    shape_custom: green
    shape_datetime: green_bold
    shape_directory: green
    shape_external: green
    shape_externalarg: green_bold
    shape_filepath: green
    shape_flag: green_bold
    shape_float: green_bold
    # shapes are used to change the cli syntax highlighting
    shape_garbage: { fg: "#9cff57" bg: "#4a7a3f" attr: b}
    shape_globpattern: green_bold
    shape_int: green_bold
    shape_internalcall: green_bold
    shape_list: green_bold
    shape_literal: green
    shape_matching_brackets: { attr: u }
    shape_nothing: green_bold
    shape_operator: green
    shape_or: green_bold
    shape_pipe: green_bold
    shape_range: green_bold
    shape_record: green_bold
    shape_redirection: green_bold
    shape_signature: green_bold
    shape_string: green
    shape_string_interpolation: green_bold
    shape_table: green_bold
    shape_variable: green
}

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

  explore: {
    help_banner: true
    exit_esc: true

    command_bar_text: '#9cff57'
    # command_bar: {fg: '#9cff57' bg: '#223311' }

    status_bar_background: {fg: '#0b120c' bg: '#9cff57' }
    # status_bar_text: {fg: '#9cff57' bg: '#223311' }

    highlight: {bg: '#4a7a3f' fg: '#9cff57' }

    status: {
      # warn: {bg: 'green', fg: 'green'}
      # error: {bg: 'green', fg: 'green'}
      # info: {bg: 'green', fg: 'green'}
    }

    try: {
      # border_color: 'red'
      # highlighted_color: 'green'

      # reactive: false
    }

    table: {
      split_line: '#4a7a3f'

      cursor: true

      line_index: true
      line_shift: true
      line_head_top: true
      line_head_bottom: true

      show_head: true
      show_index: true

      # selected_cell: {fg: 'green', bg: '#4a7a3f'}
      # selected_row: {fg: 'green', bg: '#4a7a3f'}
      # selected_column: green

      # padding_column_right: 2
      # padding_column_left: 2

      # padding_index_left: 2
      # padding_index_right: 1
    }

    config: {
      cursor_color: {bg: '#4a7a3f' fg: '#9cff57' }

      # border_color: green
      # list_color: green
    }
  }

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
  color_config: $dark_theme   # if you want a light theme, replace `$dark_theme` to `$light_theme`
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
