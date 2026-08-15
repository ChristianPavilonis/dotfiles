return {
  {
    -- Generated colorscheme and lualine palette are sourced from themes/.
    'nvim-lualine/lualine.nvim',
    lazy = false,
    priority = 1000,
    opts = {
      options = {
        icons_enabled = true,
        theme = require('christian.lualine_theme'),
        component_separators = '|',
        section_separators = '',
      },
    },
    config = function(_, opts)
      vim.cmd.colorscheme('fallout-terminal')
      require('lualine').setup(opts)
    end,
  },
}
