return {
  'nvimdev/dashboard-nvim',
  event = 'VimEnter',
  config = function()
    local dashboard = require('dashboard')

    dashboard.setup {
      theme = 'doom',
      config = {
        header = {
          [[                                                                       ]],
          [[  ██████   █████                   █████   █████  ███                  ]],
          [[ ░░██████ ░░███                   ░░███   ░░███  ░░░                   ]],
          [[  ░███░███ ░███   ██████   ██████  ░███    ░███  ████  █████████████   ]],
          [[  ░███░░███░███  ███░░███ ███░░███ ░███    ░███ ░░███ ░░███░░███░░███  ]],
          [[  ░███ ░░██████ ░███████ ░███ ░███ ░░███   ███   ░███  ░███ ░███ ░███  ]],
          [[  ░███  ░░█████ ░███░░░  ░███ ░███  ░░░█████░    ░███  ░███ ░███ ░███  ]],
          [[  █████  ░░█████░░██████ ░░██████     ░░███      █████ █████░███ █████ ]],
          [[ ░░░░░    ░░░░░  ░░░░░░   ░░░░░░       ░░░      ░░░░░ ░░░░░ ░░░ ░░░░░  ]],
          [[                                                                       ]],
          [[                                                                       ]],
          [[                                                                       ]],
          [[                                                                       ]],
        },
        center = {
          { icon = '  ', desc = 'New file', action = 'enew' },
          { icon = '  ', desc = 'Find file               ', key = 'Space + o', action = 'Telescope find_files' },
          { icon = '  ', desc = 'Recent files            ', key = 'Space + h', action = 'Telescope oldfiles' },
          { icon = '  ', desc = 'Find Word               ', key = 'Space + f', action = 'Telescope live_grep' },
        },
        footer = { '' }
      },
      hide = {
        statusline = false,
        tabline = false,
        winbar = false,
      }
    }

    local theme_palette = require('christian.theme_palette')
    local palette = theme_palette[theme_palette.active]
    local dashboard_groups = {
      'DashboardHeader',
      'DashboardDesc',
      'DashboardIcon',
      'DashboardKey',
      'DashboardFooter',
    }
    for _, group in ipairs(dashboard_groups) do
      vim.api.nvim_set_hl(0, group, { fg = palette.accent })
    end
  end,
  dependencies = { { 'nvim-tree/nvim-web-devicons' } }
}
