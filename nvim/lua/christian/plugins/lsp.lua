-- LSP config
--  The configuration is done below. Search for lspconfig to find it below.
return {
  -- LSP Configuration & Plugins
  'neovim/nvim-lspconfig',
  dependencies = {
    -- Automatically install LSPs to stdpath for neovim
    { 'williamboman/mason.nvim', config = true },
    'williamboman/mason-lspconfig.nvim',

    -- Useful status updates for LSP
    -- NOTE: `opts = {}` is the same as calling `require('fidget').setup({})`
    { 'j-hui/fidget.nvim', tag = 'legacy', opts = {} },

    -- Additional lua configuration, makes nvim stuff amazing!
    'folke/neodev.nvim',
  },
  config = function()
    require('mason').setup()
    require('mason-lspconfig').setup({ automatic_installation = true })

    local capabilities = require('cmp_nvim_lsp').default_capabilities(vim.lsp.protocol.make_client_capabilities())
    local util = require("lspconfig/util")

    require('lspconfig').intelephense.setup{ 
      filetypes = {'php'},
      capabilities = capabilities,
    }
    require('lspconfig').volar.setup{
      filetypes = {'typescript', 'javascript', 'javascriptreact', 'typescriptreact', 'vue', 'json'},
      capabilities = capabilities
    }

    require('lspconfig').rust_analyzer.setup{ 
      filetypes = {'rust'},
      capabilities = capabilities,
      root_dir = util.root_pattern("Cargo.toml"),
      settings = {
        cargo = {
          allFeatures = true
        }
      }
    }

    -- Commands
    vim.api.nvim_create_user_command('Format', function() vim.lsp.buf.format({ timeout_ms = 5000 }) end, {})

    vim.api.nvim_create_autocmd(
      "BufWritePost",
      {
        pattern = "*.rs",
        callback = function() 
          vim.cmd("Format")
        end
      }
    )

    vim.diagnostic.config({
      virtual_text = false,
      float = {
        source = true,
      }
    })
  end
}
