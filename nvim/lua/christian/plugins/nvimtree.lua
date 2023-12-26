
return {
    'nvim-tree/nvim-tree.lua',
    dependencies ={
      'nvim-tree/nvim-web-devicons',
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
    },

    opts = {
      git = {
        ignore = false,
      },
      view = {
        width = 40,
      },
      renderer = {
        highlight_opened_files = 'name',
        icons = {
          show = {
            folder_arrow = false,
          },
        },
        indent_markers = {
          enable = true,
        },
      },
    },
}
