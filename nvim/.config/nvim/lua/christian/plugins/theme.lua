local theme_path = vim.fn.expand("~/.local/state/omarchy/current/theme/neovim.lua")
local generated = {}

if vim.uv.fs_stat(theme_path) then
  local ok, specs = pcall(dofile, theme_path)
  if ok and type(specs) == "table" then
    generated = specs
  end
end

local colorscheme = "habamax"
local dependencies = {}
local plugins = {}

for _, spec in ipairs(generated) do
  if spec[1] == "LazyVim/LazyVim" then
    colorscheme = spec.opts and spec.opts.colorscheme or colorscheme
  else
    spec.lazy = false
    spec.priority = spec.priority or 1000
    table.insert(plugins, spec)
    table.insert(dependencies, spec[1])
  end
end

table.insert(plugins, {
  "nvim-lualine/lualine.nvim",
  lazy = false,
  priority = 900,
  dependencies = dependencies,
  opts = {
    options = {
      icons_enabled = true,
      theme = "auto",
      component_separators = "|",
      section_separators = "",
    },
  },
  config = function(_, opts)
    vim.cmd.colorscheme(colorscheme)
    require("lualine").setup(opts)
  end,
})

return plugins
