
-- Set <space> as the leader key
-- See `:help mapleader`
--  NOTE: Must happen before plugins are required (otherwise wrong leader will be used)
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

vim.opt.shiftwidth = 4
vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.smartindent = true
vim.opt.wrap = false

vim.opt.number = true
vim.opt.relativenumber = true

vim.opt.wildmode = 'longest:full,full' -- complete the longest common match, and allow tabbing the results to complete them.
vim.opt.completeopt = 'menuone,longest,preview'

vim.opt.title = true
vim.opt.mouse = 'a' -- enable mouse for all modes

vim.opt.termguicolors = true

-- vim.opt.spell = true

vim.opt.ignorecase = true
vim.opt.smartcase = true

vim.opt.splitbelow = true
vim.opt.splitright = true

vim.opt.scrolloff = 8 -- keeps cursor more centered so I can see above/below the cursor.
vim.opt.sidescrolloff = 8

vim.opt.clipboard = 'unnamedplus' -- Use system clipboard

vim.opt.undofile = true -- persists undo
vim.opt.backup = true -- backup files
vim.opt.backupdir:remove('.') -- keep backups out of the current directory

vim.opt.updatetime = 50

vim.opt.hlsearch = false

vim.opt.cursorline = true


-- S.D.G.

--
-------
--------------
--------
--
