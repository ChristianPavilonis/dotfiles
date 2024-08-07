return {
  {
    'stevearc/oil.nvim',
    dependencies = {
      'nvim-tree/nvim-web-devicons',
    },
    config = function () 
      require("oil").setup {
        view_options = {
          show_hidden = true
        },
        float = {
          padding = 2,
          max_width = 80,
          max_height = 0,
          border = "rounded",
          win_options = {
            winblend = 0,
          }
        }
      }
    end
  }
}
