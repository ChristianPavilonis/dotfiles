return {
    'nvim-telescope/telescope.nvim',
    branch = '0.1.x',
    lazy = true,
    cmd = 'Telescope',
    dependencies = {
        'nvim-lua/plenary.nvim',
        { 'nvim-telescope/telescope-fzf-native.nvim', build = 'make' },
    },
    config = function()
        local actions = require('telescope.actions')
        require('telescope').setup({
            defaults = {
                path_display = { truncate = 1 },
                prompt_prefix = '   ',
                selection_caret = '  ',
                layout_config = { prompt_position = 'top' },
                preview = { timeout = 200, treesitter = false },
                sorting_strategy = 'ascending',
                mappings = {
                    i = {
                        ['<Esc>'] = actions.close,
                        ['<C-Down>'] = actions.cycle_history_next,
                        ['<C-Up>'] = actions.cycle_history_prev,
                    },
                },
                file_ignore_patterns = { '.git/' },
            },
            pickers = {
                find_files = { hidden = true },
                buffers = {
                    previewer = false,
                    layout_config = { width = 80 },
                },
                oldfiles = { prompt_title = 'History' },
            },
        })
        require('telescope').load_extension('fzf')
    end,
}
