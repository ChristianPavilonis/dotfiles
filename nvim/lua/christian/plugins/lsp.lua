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
      filetypes = {'php', 'antlers.html'},
      capabilities = capabilities,
    }
    require('lspconfig').volar.setup{
      filetypes = {'typescript', 'javascript', 'javascriptreact', 'typescriptreact', 'vue', 'json'},
      capabilities = capabilities
    }

   require('lspconfig').cssls.setup{
      capabilities = capabilities,
    }


    require('lspconfig').lua_ls.setup{ 
      filetypes = {'lua'},
      capabilities = capabilities,
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

    require('lspconfig').gopls.setup{
    }

    vim.diagnostic.config({
      virtual_text = false,
      float = {
        source = true,
      }
    })
  end
}
