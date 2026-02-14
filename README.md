# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Restore on a new machine

```bash
git clone <your-dotfiles-repo-url> ~/dotfiles
cd ~/dotfiles
./bootstrap
```

`bootstrap` will:
- install Homebrew if needed
- install `stow` if needed
- run `./install` to create all symlinks

## Manual install

If you already have `stow`:

```bash
cd ~/dotfiles
./install
```

## Managed packages

- `aerospace` -> `~/.aerospace.toml`
- `git` -> `~/.gitconfig`
- `kitty` -> `~/.config/kitty`
- `nu` -> `~/.config/nushell`
- `nvim` -> `~/.config/nvim`
- `opencode` -> `~/.config/opencode/*`
- `starship` -> `~/.config/starship.toml`
- `zellij` -> `~/.config/zellij`

## Daily stow commands

```bash
# preview changes
stow -nv -t ~ <package>

# (re)link package
stow -R -t ~ <package>

# unlink package
stow -D -t ~ <package>
```

## Add a new config

1. Create a package folder in this repo.
2. Mirror the target path under that package (for example `foo/.config/foo/config.toml`).
3. Run `stow -R -t ~ foo`.
