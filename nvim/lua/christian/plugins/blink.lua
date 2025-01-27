return {
  'saghen/blink.cmp',
  version = 'v0.11.0',
  dependencies = { 'L3MON4D3/LuaSnip', version = 'v2.*' },
  opts = {
    -- 'default' for mappings similar to built-in completion
    -- 'super-tab' for mappings similar to vscode (tab to accept, arrow keys to navigate)
    -- 'enter' for mappings similar to 'super-tab' but with 'enter' to accept
    -- See the full "keymap" documentation for information on defining your own keymap.
    keymap = { 
      preset = 'enter', 

      ['<C-k>'] = { 'accept' },

      ['<CR>'] = {},
    },

    appearance = {
      -- Sets the fallback highlight groups to nvim-cmp's highlight groups
      -- Useful for when your theme doesn't support blink.cmp
      -- Will be removed in a future release
      use_nvim_cmp_as_default = true,
      -- Set to 'mono' for 'Nerd Font Mono' or 'normal' for 'Nerd Font'
      -- Adjusts spacing to ensure icons are aligned
      nerd_font_variant = 'mono'
    },

    -- Default list of enabled providers defined so that you can extend it
    -- elsewhere in your config, without redefining it, due to `opts_extend`
    sources = {
      default = { 'lsp', 'path', 'snippets', 'buffer' },
    },

    snippets = {
      preset = 'luasnip',
      -- expand = function(snippet) require('luasnip').lsp_expand(snippet) end,
      -- active = function(filter)
      --   if filter and filter.direction then
      --     return require('luasnip').jumpable(filter.direction)
      --   end
      --   return require('luasnip').in_snippet()
      -- end,
      -- jump = function(direction) require('luasnip').jump(direction) end,
    },
  },
  opts_extend = { "sources.default" },
}
