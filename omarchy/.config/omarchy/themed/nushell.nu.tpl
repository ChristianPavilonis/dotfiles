{
  color_config: {
    separator: '{{ accent }}'
    leading_trailing_space_bg: { attr: n }
    header: '{{ accent }}'
    empty: '{{ muted }}'
    bool: '{{ blue }}'
    int: '{{ foreground }}'
    filesize: '{{ foreground }}'
    duration: '{{ cyan }}'
    date: '{{ cyan }}'
    range: '{{ cyan }}'
    float: '{{ foreground }}'
    string: '{{ green }}'
    nothing: '{{ muted }}'
    binary: '{{ foreground }}'
    cellpath: '{{ foreground }}'
    row_index: '{{ accent }}'
    record: '{{ foreground }}'
    list: '{{ foreground }}'
    block: '{{ foreground }}'
    hints: '{{ muted }}'
    shape_and: '{{ magenta }}'
    shape_binary: '{{ magenta }}'
    shape_block: '{{ blue }}'
    shape_bool: '{{ blue }}'
    shape_custom: '{{ accent }}'
    shape_datetime: '{{ yellow }}'
    shape_directory: '{{ blue }}'
    shape_external: '{{ accent }}'
    shape_externalarg: '{{ foreground }}'
    shape_filepath: '{{ blue }}'
    shape_flag: '{{ magenta }}'
    shape_float: '{{ yellow }}'
    shape_garbage: { fg: '{{ red }}' bg: '{{ background }}' attr: b }
    shape_globpattern: '{{ cyan }}'
    shape_int: '{{ yellow }}'
    shape_internalcall: '{{ blue }}'
    shape_list: '{{ foreground }}'
    shape_literal: '{{ green }}'
    shape_matching_brackets: { attr: u }
    shape_nothing: '{{ muted }}'
    shape_operator: '{{ cyan }}'
    shape_or: '{{ magenta }}'
    shape_pipe: '{{ accent }}'
    shape_range: '{{ cyan }}'
    shape_record: '{{ foreground }}'
    shape_redirection: '{{ magenta }}'
    shape_signature: '{{ blue }}'
    shape_string: '{{ green }}'
    shape_string_interpolation: '{{ cyan }}'
    shape_table: '{{ foreground }}'
    shape_variable: '{{ accent }}'
  }
  explore: {
    help_banner: true
    exit_esc: true
    command_bar_text: '{{ foreground }}'
    status_bar_background: { fg: '{{ background }}' bg: '{{ accent }}' }
    highlight: { fg: '{{ selection_foreground }}' bg: '{{ selection_background }}' }
    status: {}
    try: {}
    table: {
      split_line: '{{ muted }}'
      cursor: true
      line_index: true
      line_shift: true
      line_head_top: true
      line_head_bottom: true
      show_head: true
      show_index: true
    }
    config: {
      cursor_color: { fg: '{{ selection_foreground }}' bg: '{{ selection_background }}' }
    }
  }
}
