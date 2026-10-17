-- Run from the dotfiles root:
-- nvim --headless -i NONE nvim/.config/nvim/init.lua '+luafile nvim/tests/smoke.lua'
local function check()
    local config = require('lazy.core.config')
    local allowed = {
        ['lazy.nvim'] = true,
        ['telescope.nvim'] = true,
        ['plenary.nvim'] = true,
        ['telescope-fzf-native.nvim'] = true,
        ['oil.nvim'] = true,
    }
    for _, plugin in ipairs(require('christian.theme').plugins) do
        allowed[plugin[1]:match('[^/]+$')] = true
    end
    for name in pairs(config.plugins) do
        assert(allowed[name], 'Unexpected plugin: ' .. name)
    end
    assert(not config.plugins['telescope.nvim']._.loaded, 'Telescope loaded at startup')
    assert(not config.plugins['oil.nvim']._.loaded, 'Oil loaded at startup')
    assert(not package.loaded['christian.multi-ripgrep'], 'Grep loaded at startup')
    assert(vim.g.syntax_on == 1, 'Built-in syntax highlighting is disabled')
    assert(vim.bo.filetype == 'lua', 'Filetype detection failed')
    assert(vim.o.laststatus == 2, 'Built-in statusline is disabled')
    assert(vim.g.colors_name == require('christian.theme').colorscheme, 'Theme was not applied')
    assert(#vim.lsp.get_clients() == 0, 'An LSP client started')

    for _, key in ipairs({ ' w', ' k', '<Tab>', '<S-Tab>', '<A-j>', '<A-k>', '<A-r>', '<CR>', '<BS>' }) do
        assert(vim.fn.maparg(key, 'n') ~= '', 'Missing key: ' .. key)
    end
    assert(vim.fn.maparg('jk', 'i') ~= '', 'Missing insert-mode escape')
    for _, key in ipairs({ ' s', ' d', ' lr', ' rn', ' lf', ' 1', ' ai', ' tn', ' xx', ' gs', 'gj', 'gh' }) do
        local mapping = vim.fn.maparg(key, 'n', false, true)
        assert(not mapping.lhs or mapping.sid == 0, 'Stale plugin key: ' .. key)
    end

    -- Exercise the actual key callbacks, async file search, and filtered ripgrep.
    vim.o.lines = 40
    vim.o.columns = 120
    local function picker_for(key, expected_title)
        vim.fn.maparg(key, 'n', false, true).callback()
        local picker = require('telescope.actions.state').get_current_picker(vim.api.nvim_get_current_buf())
        assert(picker.prompt_title == expected_title, 'Wrong picker for ' .. key)
        return picker
    end
    local function close(picker)
        require('telescope.actions').close(picker.prompt_bufnr)
        vim.cmd.stopinsert()
    end
    local function has_result(picker, pattern)
        return vim.wait(5000, function()
            if not picker.manager then
                return false
            end
            for entry in picker.manager:iter() do
                if tostring(entry.filename or entry.value):find(pattern) then
                    return true
                end
            end
            return false
        end, 20)
    end

    local picker = picker_for(' o', 'Find Files')
    assert(require('telescope.config').values.preview.treesitter == false, 'Preview enabled Tree-sitter')
    assert(has_result(picker, 'nvim/.config/nvim/init.lua'), 'File picker returned no matching file')
    close(picker)
    picker = picker_for(' O', 'All Files')
    assert(picker.finder, 'All-files picker has no finder')
    close(picker)
    close(picker_for(' b', 'Buffers'))
    close(picker_for(' h', 'History'))
    close(picker_for('  d', 'Dotfiles'))
    picker = picker_for(' f', 'Live Grep (with shortcuts)')
    picker:set_prompt('Filtered ripgrep  l')
    assert(has_result(picker, 'nvim/tests/smoke.lua'), 'Filtered ripgrep returned no matching file')
    close(picker)

    vim.fn.maparg('-', 'n', false, true).callback()
    assert(vim.wait(5000, function()
        return vim.bo.filetype == 'oil'
    end, 20), 'Oil did not open from the directory key')
    assert(config.plugins['oil.nvim']._.loaded, 'Oil did not lazy-load')
    assert(not config.plugins['nvim-web-devicons'], 'Icon dependency returned')
    assert(vim.v.errmsg == '', vim.v.errmsg)
    print('PASS: startup, theme, core keys, all pickers, filtered ripgrep, and Oil')
end

local ok, err = xpcall(check, debug.traceback)
if not ok then
    vim.api.nvim_err_writeln(err)
    vim.cmd.cquit()
else
    vim.cmd('qa!')
end
