return {
  {
    -- Highlight, edit, and navigate code
    'nvim-treesitter/nvim-treesitter',
    branch = 'master',
    dependencies = {
      'nvim-treesitter/nvim-treesitter-textobjects',
      {
        'JoosepAlviste/nvim-ts-context-commentstring',
        init = function()
          vim.g.skip_ts_context_commentstring_module = true
        end,
        opts = { enable_autocmd = false },
      },
      'nushell/tree-sitter-nu',
    },
    build = ':TSUpdate',
    config = function()
      local ts_install = require('nvim-treesitter.install')
      local ts_cli_version = require('nvim-treesitter.utils').ts_cli_version()
      local parsed_cli_version = ts_cli_version and vim.version.parse(ts_cli_version)

      -- tree-sitter-cli 0.26 removed --no-bindings, which the legacy branch still passes.
      if parsed_cli_version and vim.version.ge(parsed_cli_version, { 0, 26, 0 }) then
        ts_install.ts_generate_args = { 'generate', '--abi', vim.treesitter.language_version }
      end

      -- GCC 16 defaults to C23, which breaks older parsers such as tree-sitter-perl.
      for _, compiler in ipairs({ 'cc', 'gcc', 'clang' }) do
        ts_install.command_extra_args[compiler] = { '-std=gnu17' }
      end

      require('nvim-treesitter.configs').setup {
        highlight = {
          enable = true,
        },
        indent = {
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
              ['ic'] = '@class.inner',
              ['ac'] = '@class.outer',
            },
            selection_modes = {
              ['@function.inner'] = 'V',
              ['@function.outer'] = 'v',
              ['@class.inner'] = 'V',
              ['@class.outer'] = 'V',
            },
          },
          move = {
            enable = true,
            set_jumps = true, -- whether to set jumps in the jumplist
            goto_next_start = {
              ["gm"] = "@function.outer",
              ["]]"] = "@class.outer",
              ["]c"] = "@comment",
            },
            goto_next_end = {
              ["]M"] = "@function.outer",
              ["]["] = "@class",
            },
            goto_previous_start = {
              ["[m"] = "@function.outer",
              ["[["] = "@class.outer",
              ["[c"] = "@comment.outer",
            },
            goto_previous_end = {
              ["[M"] = "@function.outer",
              ["[]"] = "@class.outer",
            },
          },
        }
      }
      local parser_config = require "nvim-treesitter.parsers".get_parser_configs()
      parser_config.blade = {
        install_info = {
          url = "https://github.com/EmranMR/tree-sitter-blade",
          files = { "src/parser.c" },
          branch = "main",
        },
        filetype = "blade",
      }
      vim.filetype.add({
          pattern = {
              [".*%.blade%.php"] = "blade",
          },
      })
    end,
    opts = {
    }
  },
}
