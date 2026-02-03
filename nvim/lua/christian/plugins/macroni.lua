return {
  'jesseleite/nvim-macroni',
  lazy = false,
  opts = {
    macros = {
      rust_derive = {
        macro = 'vaco<Esc>O#[derive()]<Esc>hi',
        keymap = '<leader>rd',
        desc = 'Rust: add derive macro'
      },

      rust_impl = {
        macro = 'vaco<Esc>/struct<CR>wyW$%o<CR>impl<Space>{<CR><CR>}<Esc>k',
        -- macro = 'vaco<Esc>f{byiw$%o<CR>impl<Space><Esc>pA<Space>{<CR><Esc>A<Tab>',
        keymap = '<leader>ri',
        desc = 'Rust: impl the current struct'
      },

      rust_visual_println = {
        macro = 'yoprintln!(\"<Esc>pa:<Space>{:?}\",<Space><Esc>pa);<Esc>',
        keymap = '<leader>rl',
        desc = 'Rust: add a debug println! for the current visual selection'
      },

      javascript_visual_log = {
        macro = 'yoconsole.log(\"<Esc>pa:\",<Space><Esc>pa);<Esc>',
        keymap = '<leader>jl',
        desc = 'JS: add a console.log for the current visual selection'
      },
    }
  },
}
