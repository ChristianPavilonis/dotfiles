# Neovim

A small config for browsing files and occasional edits. Uses built-in syntax
highlighting and the built-in statusline, with no LSP, completion, formatting,
Git integration, or parser installation.

Telescope and Oil load on demand. The active Omarchy colorscheme loads at startup,
with `habamax` as the fallback when no generated theme exists. Dependencies are
Lazy, Plenary, and Telescope's native fzf sorter. File search needs `rg` and `fd`;
building the sorter needs `make` and a C compiler.

## Keys

Leader is Space. Core editing mappings are in
`.config/nvim/lua/christian/keybinds.lua`.

| Key | Action |
| --- | --- |
| `<leader>o` | Find files, including hidden files |
| `<leader>O` | Find files without ignore rules |
| `<leader>b` | Buffers |
| `<leader>h` | Recent files |
| `<leader><leader>d` | Find dotfiles |
| `<leader>f` | Live grep |
| `-` | Browse the current file's parent directory |
| `<leader>w` | Save |
| `jk` | Leave insert mode |
| Tab / Shift-Tab | Switch windows |

Live grep accepts a file glob after two spaces. For example, `setup  *.lua`.
Shortcuts include `l` for Lua, `r` for Rust, and `n` for Vim/Lua. Grep respects
ripgrep's default hidden-file and ignore rules.

`nvim .` and `:edit directory` also open Oil. Oil shows hidden files without icons.

## Checks

With this config installed, run from the dotfiles root:

```sh
nvim --headless -i NONE nvim/.config/nvim/init.lua '+luafile nvim/tests/smoke.lua'
nvim --headless -i NONE nvim/.config/nvim '+lua assert(vim.wait(5000, function() return vim.bo.filetype == "oil" end))' +qa
nvim --headless -i NONE '+edit nvim/.config/nvim' '+lua assert(vim.wait(5000, function() return vim.bo.filetype == "oil" end))' +qa
```

Removed plugins and Mason tools may remain in Neovim's data directory, but this
config does not load them. `:Lazy clean` can remove unused plugin checkouts.
