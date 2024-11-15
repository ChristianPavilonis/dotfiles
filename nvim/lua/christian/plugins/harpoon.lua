return {
  "ThePrimeagen/harpoon",
  branch = "harpoon2",
  dependencies = { "nvim-lua/plenary.nvim" },
  config = function()
    local harpoon = require("harpoon")
    harpoon:setup()

    -- basic telescope configuration
    local conf = require("telescope.config").values
    local function toggle_telescope(harpoon_files)
      local file_paths = {}
      for _, item in ipairs(harpoon_files.items) do
        table.insert(file_paths, item.value)
      end

      require("telescope.pickers").new({}, {
        prompt_title = "Harpoon",
        finder = require("telescope.finders").new_table({
          results = file_paths,
        }),
        previewer = conf.file_previewer({}),
        sorter = conf.generic_sorter({}),
      }):find()
    end

    -- Keybinds
    -- vim.keymap.set("n", "a", function() harpoon:list():append() end)

    vim.keymap.set("n", "gj", function() harpoon:list():select(1) end)
    vim.keymap.set("n", "gk", function() harpoon:list():select(2) end)
    vim.keymap.set("n", "gl", function() harpoon:list():select(3) end)
    vim.keymap.set("n", "g;", function() harpoon:list():select(4) end)
    vim.keymap.set('n', 'gh', function() harpoon.ui:toggle_quick_menu(harpoon:list()) end)

  end
}
