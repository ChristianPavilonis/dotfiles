return {
  -- current theme
  {
    'rebelot/kanagawa.nvim',
    priority = 1000,
    config = function() 
      vim.cmd.colorscheme 'kanagawa'
      vim.api.nvim_set_hl(0, 'NvimTreeIndentMarker', {fg = "#5D5C8A"})
    end
  },

  {
    -- Set lualine as statusline
    'nvim-lualine/lualine.nvim',
    -- See `:help lualine.txt`
    opts = {
      options = {
        icons_enabled = true,
        theme = 'kanagawa',
        component_separators = '|',
        section_separators = '',
      },
    },
  },
}
