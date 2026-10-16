return {
    'stevearc/oil.nvim',
    lazy = true,
    cmd = 'Oil',
    init = function()
        -- Also load Oil for `nvim .` and `:edit directory`, not for ordinary files.
        vim.api.nvim_create_autocmd('BufEnter', {
            group = vim.api.nvim_create_augroup('LoadOilForDirectory', { clear = true }),
            nested = true,
            callback = function(args)
                if vim.fn.isdirectory(args.file) == 1 then
                    require('oil').open(args.file)
                end
            end,
        })
    end,
    opts = {
        columns = {},
        view_options = { show_hidden = true },
        lsp_file_methods = { enabled = false },
        float = {
            padding = 2,
            max_width = 80,
            max_height = 0,
            border = 'rounded',
            win_options = { winblend = 0 },
        },
    },
}
