return {
  -- Git related plugins
  'tpope/vim-fugitive',
  'tpope/vim-rhubarb',

  -- Detect tabstop and shiftwidth automatically
  'tpope/vim-sleuth',

  -- Plugin to surround things with quotes/brackets
  'tpope/vim-surround',

  -- add more repeatable things
  'tpope/vim-repeat',

  -- creates parent dirs when saving if they don't exist
  'jessarcher/vim-heritage',

  -- yank macros from a register :YankMacro j
  'jesseleite/nvim-macroni',

  -- auto complete pairs such as {}, '', etc.
  {  
    'windwp/nvim-autopairs',
    event = "InsertEnter",
    opts = {} -- this is equalent to setup({}) function
  },
  'ThePrimeagen/vim-be-good',

  -- Useful plugin to show you pending keybinds.
  { 'folke/which-key.nvim', opts = {} },


  {
    -- Add indentation guides even on blank lines
    'lukas-reineke/indent-blankline.nvim',
    -- Enable `lukas-reineke/indent-blankline.nvim`
    -- See `:help indent_blankline.txt`
    main = "ibl",
    opts = {
      indent = {
        char = '┊',
      }
    },
  },

  -- "gc" to comment visual regions/lines
  { 'numToStr/Comment.nvim', opts = {} },


  -- plugin for rust crates (better Cargo.toml)
  {
    'saecki/crates.nvim',
    tag = 'stable',
    dependencies = { 'nvim-lua/plenary.nvim' },
    config = function()
        require('crates').setup()
    end,
  },

  'rcarriga/nvim-notify'

}
