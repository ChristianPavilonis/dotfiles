-- When text is wrapping treat wrapped lines like normal lines
vim.keymap.set('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true })
vim.keymap.set('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true })

-- Reselects after indenting
vim.keymap.set('v', '<', '<gv')
vim.keymap.set('v', '>', '>gv')

-- Leaves cursor as is after copy
vim.keymap.set('v', 'y', 'myy`y')

-- save
vim.keymap.set('n', '<Leader>w', ':w<CR>')

-- navigate windows with tab/shift-tab
vim.keymap.set('n', '<Tab>', '<C-w>w')
vim.keymap.set('n', '<S-Tab>', '<C-w>W')

-- telescope keybinds
vim.keymap.set('n', '<leader>o', [[<cmd>lua require('telescope.builtin').find_files()<CR>]])
vim.keymap.set('n', '<leader>O',
    [[<cmd>lua require('telescope.builtin').find_files({ no_ignore = true, prompt_title = 'All Files' })<CR>]])
vim.keymap.set('n', '<leader>b', [[<cmd>lua require('telescope.builtin').buffers()<CR>]])
vim.keymap.set('n', '<leader>f', [[<cmd>lua require('telescope').extensions.live_grep_args.live_grep_args()<CR>]])
vim.keymap.set('n', '<leader>h', [[<cmd>lua require('telescope.builtin').oldfiles()<CR>]])
vim.keymap.set('n', '<leader>s', [[<cmd>lua require('telescope.builtin').lsp_workspace_symbols()<CR>]])
vim.keymap.set('n', '<leader><leader>d', [[<cmd>lua require('telescope.builtin').dotfiles()<CR>]])


-- LSP actions
vim.keymap.set('n', '<A-Enter>', ':lua vim.lsp.buf.code_action()<CR>')
vim.keymap.set('n', '<Leader>d', '<cmd>lua vim.diagnostic.open_float()<CR>')
vim.keymap.set('n', '[d', '<cmd>lua vim.diagnostic.goto_prev()<CR>')
vim.keymap.set('n', ']d', '<cmd>lua vim.diagnostic.goto_next()<CR>')
vim.keymap.set('n', 'gd', ':Telescope lsp_definitions<CR>')
vim.keymap.set('n', 'ga', '<cmd>lua vim.lsp.buf.code_action()<CR>')
vim.keymap.set('n', 'gi', ':Telescope lsp_implementations<CR>')
vim.keymap.set('n', 'gr', ':Telescope lsp_references<CR>')
vim.keymap.set('n', '<Leader>lr', ':LspRestart<CR>', { silent = true })
vim.keymap.set('n', 'K', '<cmd>lua vim.lsp.buf.hover()<CR>')
vim.keymap.set('n', '<Leader>rn', '<cmd>lua vim.lsp.buf.rename()<CR>')
vim.keymap.set('n', '<Leader>lr', ':LspRestart<CR>', { silent = true })
-- center screen after <C-d/u>
-- vim.keymap.set('n', '<C-d>', '<C-d>zz')
-- vim.keymap.set('n', '<C-u>', '<C-u>zz')

-- Paste over selection without copying it
vim.keymap.set('x', 'p', '"_dP')


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

-- quick find and replace
vim.keymap.set('n', '<A-r>', ":%s/")
vim.keymap.set('v', '<A-r>', "y:<C-f>i%s/<Esc>pa/")

-- add lines but stay in normal mode
vim.keymap.set('n', '<CR>', 'o<Esc>')
vim.keymap.set('n', '<S-CR>', 'O<Esc>')

-- NvimTree
vim.keymap.set('n', '<Leader>1', ':NvimTreeFindFileToggle<CR>', { silent = true })
-- Oil
vim.keymap.set('n', '-', require('oil').open_float, { desc = "Open parent directory" })

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

vim.keymap.set('n', '<leader>rcu', function()
    require('crates').upgrade_all_crates()
end)

-- vim-test
vim.keymap.set('n', '<Leader>tn', ':TestNearest<CR>')
vim.keymap.set('n', '<Leader>tf', ':TestFile<CR>')
vim.keymap.set('n', '<Leader>ts', ':TestSuite<CR>')
vim.keymap.set('n', '<Leader>tl', ':TestLast<CR>')
vim.keymap.set('n', '<Leader>tv', ':TestVisit<CR>')

-- Trouble
vim.keymap.set("n", "<leader>xx", function() require("trouble").toggle() end)
vim.keymap.set("n", "<leader>xw", function() require("trouble").toggle("workspace_diagnostics") end)
vim.keymap.set("n", "<leader>xd", function() require("trouble").toggle("document_diagnostics") end)
vim.keymap.set("n", "<leader>xq", function() require("trouble").toggle("quickfix") end)
vim.keymap.set("n", "<leader>xl", function() require("trouble").toggle("loclist") end)
vim.keymap.set("n", "gR", function() require("trouble").toggle("lsp_references") end)

-- git gud
function get_current_buff_path()
    local bufnr = vim.api.nvim_get_current_buf()
    return vim.api.nvim_buf_get_name(bufnr)
end

vim.keymap.set('n', '<leader>ga', function()
    local path = get_current_buff_path()

    vim.cmd("G add " .. path)
end)

vim.keymap.set('n', '<leader>gaa', ':G add .<CR>')
vim.keymap.set('n', '<leader>gc', ':G commit<CR>')
vim.keymap.set('n', '<leader>gs', ':G status<CR>')
vim.keymap.set('n', '<leader>gd', function()
    local path = get_current_buff_path()

    vim.cmd("G diff " .. path)
end)

vim.keymap.set('n', '<leader>tl', function()
    vim.cmd("colorscheme kanagawa-lotus")
end)

vim.keymap.set('n', '<leader>td', function()
    vim.cmd("colorscheme kanagawa-wave")
end)

vim.keymap.set('n', '<leader>lf', function()
    vim.lsp.buf.format({ async = false })
end)



-- Keybinds
vim.keymap.set("n", "<leader>a", function() harpoon:list():append() end)

vim.keymap.set("n", "gj", function() harpoon:list():select(1) end)
vim.keymap.set("n", "gk", function() harpoon:list():select(2) end)
vim.keymap.set("n", "gl", function() harpoon:list():select(3) end)
vim.keymap.set("n", "g;", function() harpoon:list():select(4) end)
vim.keymap.set('n', 'gh', function() harpoon.ui:toggle_quick_menu(harpoon:list()) end)


vim.keymap.set({ 'n', 'v' }, '<Leader>m', function()
    require('telescope').extensions.macroni.saved_macros()
end)


-- AI?
vim.keymap.set({ "n", "v" }, "<leader>ai", ":PrtChatToggle<CR>", { desc = "Parrot Toggle AI Chat" })
vim.keymap.set({ "n", "v" }, "<leader>an", ":PrtChatNew<CR>", { desc = "Parrot New AI Chat" })
vim.keymap.set({ "n", "v" }, "<leader>af", ":PrtChatFinder<CR>", { desc = "Parrot Find Chat" })
vim.keymap.set({ "n", "v" }, "<leader>ar", ":PrtChatResponde<CR>", { desc = "Parrot Respond", silent = true })
vim.keymap.set({ "n", "v" }, "<leader>as", ":PrtChatStop<CR>", { desc = "Parrot Stop Streaming" })
vim.keymap.set({ "n", "v" }, "<leader>ad", ":PrtChatDelete<CR>", { desc = "Parrot Delete Chat" })
vim.keymap.set({ "n", "v" }, "<leader>ap", ":PrtProvider<CR>", { desc = "Parrot Select Provider" })
vim.keymap.set({ "n", "v" }, "<leader>am", ":PrtModel<CR>", { desc = "Parrot Select Model" })
vim.keymap.set({ "v" }, "<leader>rw", ":PrtRewrite<CR>", { desc = "Rewrite" })


