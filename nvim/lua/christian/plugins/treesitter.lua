return {
  {
    -- Highlight, edit, and navigate code
    'nvim-treesitter/nvim-treesitter',
    dependencies = {
      'nvim-treesitter/nvim-treesitter-textobjects',
      'JoosepAlviste/nvim-ts-context-commentstring',
    },
    build = ':TSUpdate',
    config = function() 
      require('nvim-treesitter.configs').setup {
        highlight = {
          enable = true,
        },
        indent = {
          enable = true,
        },
        context_commentstring = {
          enable = true,
        },
        ensure_installed = 'all',
        auto_install = true,
        textobjects = {
          select = {
            enable = true,
            lookahead = true,
            keymaps = {
              ['if'] = '@function.inner',
              ['af'] = '@funciton.outer',
              ['ia'] = '@parameter.inner',
              ['aa'] = '@parameter.outer',
            },
            selection_modes = {
              ['@function.inner'] = 'V',
              ['@function.outer'] = 'V',
            },
          }
        }
      }
    end,
    opts = {
    }
  }
}
