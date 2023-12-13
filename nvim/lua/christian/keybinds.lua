-- When text is wrapping treat wrapped lines like normal lines
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true })

-- Reselects after indenting
vim.keymap.set('v', '<', '<gv')
vim.keymap.set('v', '>', '>gv')

-- Leaves cursor as is after copy
vim.keymap.set('v', 'y', 'myy`y')

-- disables command line typo
vim.keymap.set('n', 'q:', ':q')

-- save
vim.keymap.set('n', '<Leader>w', ':w<CR>')

-- lsp code action
vim.keymap.set('n', '<A-Enter>', ':lua vim.lsp.buf.code_action()<CR>')

-- center screen after <C-d/u>
-- vim.keymap.set('n', '<C-d>', '<C-d>zz')
-- vim.keymap.set('n', '<C-u>', '<C-u>zz')

-- Paste over selection without copying it
vim.keymap.set('v', 'p', '"_dP')

-- Easy add semicolon or comma to end of line while in insert mode.
vim.keymap.set('i', ';;', '<Esc>A;<Esc>')
vim.keymap.set('i', ',,', '<Esc>A,<Esc>')

-- jk back to normal mode as per Jesse 
vim.keymap.set('i', 'jk', '<Esc>')

-- Clear search highlights
vim.keymap.set('n', '<Leader>k', ':nohlsearch<CR>')


-- Move lines up and down
vim.keymap.set('i', '<A-j>', '<Esc>:move .+1<CR>==gi')
vim.keymap.set('i', '<A-k>', '<Esc>:move .-2<CR>==gi')
vim.keymap.set('n', '<A-j>', ':move .+1<CR>==')
vim.keymap.set('n', '<A-k>', ':move .-2<CR>==')
vim.keymap.set('v', '<A-j>', ":move '>+1<CR>gv=gv")
vim.keymap.set('v', '<A-k>', ":move '<-2<CR>gv=gv")

-- add lines but stay in normal mode
vim.keymap.set('n', '<CR>', 'o<Esc>')
vim.keymap.set('n', '<S-CR>', 'O<Esc>')

-- NvimTree
vim.keymap.set('n', '<Leader>1', ':NvimTreeFindFileToggle<CR>', { silent = true })

-- can now delete empty lines quickly in normal mode without dd
function _G.delete_line_if_only_whitespace()
    local line = vim.fn.getline('.')
    if string.match(line, '^%s*$') then
        vim.api.nvim_del_current_line()
    else
        vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("<bs>", true, true, true), 'n', false)
    end
end

vim.keymap.set('n', '<BS>', ':lua delete_line_if_only_whitespace()<Enter>k')

-- Select whole file
-- vim.keymap.set('n', '<C-a>', 'ggVG')
