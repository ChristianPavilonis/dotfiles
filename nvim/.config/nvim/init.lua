require('christian.options')

local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.uv.fs_stat(lazypath) then
    vim.fn.system({
        'git', 'clone', '--filter=blob:none',
        'https://github.com/folke/lazy.nvim.git', '--branch=stable', lazypath,
    })
end
vim.opt.rtp:prepend(lazypath)

local theme = require('christian.theme')
require('lazy').setup({
    spec = {
        { import = 'christian.plugins' },
        theme.plugins,
    },
})
vim.cmd.colorscheme(theme.colorscheme)

require('christian.keybinds')
