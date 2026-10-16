-- Read Omarchy's generated theme without loading LazyVim or a statusline plugin.
local theme_path = vim.fn.expand('~/.local/state/omarchy/current/theme/neovim.lua')
local theme = { colorscheme = 'habamax', plugins = {} }

if vim.uv.fs_stat(theme_path) then
    local ok, specs = pcall(dofile, theme_path)
    if ok and type(specs) == 'table' then
        for _, spec in ipairs(specs) do
            if spec[1] == 'LazyVim/LazyVim' then
                theme.colorscheme = spec.opts and spec.opts.colorscheme or theme.colorscheme
            else
                spec.lazy = false
                spec.priority = spec.priority or 1000
                table.insert(theme.plugins, spec)
            end
        end
    end
end

return theme
