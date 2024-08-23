return {
    -- Autocompletion
    'hrsh7th/nvim-cmp',
    dependencies = {
      -- Snippet Engine & its associated nvim-cmp source
      'L3MON4D3/LuaSnip',
      'saadparwaiz1/cmp_luasnip',

      -- Adds LSP completion capabilities
      'hrsh7th/cmp-nvim-lsp',
      'hrsh7th/cmp-nvim-lsp-signature-help',
      -- adds words that are in the buffer
      'hrsh7th/cmp-buffer',
      -- compleation of file paths
      'hrsh7th/cmp-path',
      -- visual info
      'onsails/lspkind-nvim',
      -- Adds a number of user-friendly snippets
      'rafamadriz/friendly-snippets',
    },
    config = function() 
      local cmp = require('cmp')
      local luasnip = require('luasnip')
      local lspkind = require('lspkind')

      require("luasnip/loaders/from_snipmate").lazy_load()

      local has_words_before = function()
        local line, col = unpack(vim.api.nvim_win_get_cursor(0))
        return col ~= 0 and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match("%s") == nil
      end

    cmp.setup.filetype({"sql"}, {
      sources = {
        { name = "vim-dadbod-completion"},
        { name = "buffer"},
      }
    })

      cmp.setup({
        preselect = false,
        snippet = {
          expand = function(args)
            luasnip.lsp_expand(args.body)
          end,
        },
        view = {
          entries = { name = 'custom', selection_order = 'near_cursor' },
        },
        window = {
          completion = {
            col_offset = -2 -- align the abbr and word on cursor (due to fields order below)
          }
        },
        formatting = {
          format= lspkind.cmp_format()
        },
        mapping = {
          ["<Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
              cmp.select_next_item()
            elseif has_words_before() then
              cmp.complete()
            else
              fallback()
            end
          end, { "i", "s" }),
          ["<S-Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
              cmp.select_prev_item()
            elseif luasnip.jumpable(-1) then
              luasnip.jump(-1)
            else
              fallback()
            end
          end, { "i", "s" }),
          ['<C-k>'] = cmp.mapping(function(fallback)
            if cmp.visible() then
              local entry = cmp.get_selected_entry()
              if not entry then
                cmp.select_next_item({ behavior = cmp.SelectBehavior.Select })
                cmp.confirm()
              else
                cmp.confirm()
              end
              else
                fallback()
              end
          end, {"i","s","c",}),
        ['<C-CR>'] = cmp.mapping(function(fallback)
            if luasnip.expand_or_locally_jumpable() then
              luasnip.expand_or_jump()
            else 
              fallback()
            end
        end, {'i', 's', 'c'})
          -- ['<CR>'] = cmp.mapping.confirm({ select = false }),
        },
        sources = {
          { name = 'nvim_lsp' },
          { name = 'nvim_lsp_signature_help' },
          { name = 'luasnip' },
          { name = 'buffer' },
          { name = 'path' },
        },
        experimental = {
          ghost_text = true,
        },
      })
    end
  }
