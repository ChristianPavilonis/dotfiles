local map = vim.keymap.set

-- Core editing and navigation.
map('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true })
map('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true })
map('v', '<', '<gv')
map('v', '>', '>gv')
map('v', 'y', 'myy`y')
map('x', 'p', '"_dP')
map('n', '<leader>w', '<cmd>write<CR>')
map('n', '<Tab>', '<C-w>w')
map('n', '<S-Tab>', '<C-w>W')
map('i', ';;', '<Esc>A;<Esc>')
map('i', ',,', '<Esc>A,<Esc>')
map('i', 'jk', '<Esc>')
map('n', '<leader>k', '<cmd>nohlsearch<CR>')

map('i', '<A-j>', '<Esc>:move .+1<CR>==gi')
map('i', '<A-k>', '<Esc>:move .-2<CR>==gi')
map('n', '<A-j>', ':move .+1<CR>==')
map('n', '<A-k>', ':move .-2<CR>==')
map('v', '<A-j>', ":move '>+1<CR>gv=gv")
map('v', '<A-k>', ":move '<-2<CR>gv=gv")
map('n', '<A-r>', ':%s/')
map('v', '<A-r>', 'y:<C-f>i%s/<Esc>pa/')
map('n', '<CR>', 'o<Esc>')
map('n', '<S-CR>', 'O<Esc>')

map('n', '<BS>', function()
    if vim.fn.getline('.'):match('^%s*$') then
        vim.api.nvim_del_current_line()
        vim.cmd.normal({ 'k', bang = true })
    else
        local keys = vim.api.nvim_replace_termcodes('<BS>k', true, false, true)
        vim.api.nvim_feedkeys(keys, 'n', false)
    end
end)

map('n', '<leader>4', function()
    vim.opt.shiftwidth = 4
end)

-- Require plugins inside callbacks so opening a file doesn't load the pickers.
map('n', '<leader>b', function()
    require('telescope.builtin').buffers()
end, { desc = 'Buffers' })
map('n', '<leader>h', function()
    require('telescope.builtin').oldfiles()
end, { desc = 'Recent files' })
map('n', '<leader>o', function()
    require('telescope.builtin').find_files()
end, { desc = 'Find files' })
map('n', '<leader>O', function()
    require('telescope.builtin').find_files({ no_ignore = true, prompt_title = 'All Files' })
end, { desc = 'Find all files' })
map('n', '<leader><leader>d', function()
    require('telescope.builtin').find_files({
        prompt_title = 'Dotfiles',
        cwd = vim.fn.expand('~/dotfiles'),
        file_ignore_patterns = { '^.git/', '^git/submodules/' },
    })
end, { desc = 'Find dotfiles' })
map('n', '<leader>f', function()
    require('christian.multi-ripgrep')()
end, { desc = 'Live grep with file filters' })
map('n', '-', function()
    require('oil').open()
end, { desc = 'Open parent directory' })
