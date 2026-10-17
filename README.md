# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Restore on a new machine

```bash
git clone <your-dotfiles-repo-url> ~/dotfiles
cd ~/dotfiles
./bootstrap
./scripts/install-tools.sh
./scripts/doctor.sh
```

`bootstrap` will:
- install Linux prerequisites for Homebrew (Linux only)
- install Homebrew if needed
- install `stow` if needed
- run `./install` to create all symlinks

## Tooling bootstrap (macOS + Linux)

Use these scripts to install package managers, runtimes, and cargo CLI tools:

```bash
cd ~/dotfiles
./scripts/install-tools.sh
```

This uses:
- `Brewfile` for cross-platform Homebrew packages
- `Brewfile.macos` for macOS-only packages/casks
- `Brewfile.linux` for Linux-only Homebrew packages
- `mise.toml` for language runtimes
- `cargo-tools.txt` for cargo-installed binaries

PHP is intentionally not managed by `mise` right now because Herd is in use.
Current `mise` runtimes: Rust, Bun, Python, Node.js, Java, Gradle, and Ruby.

Validate the setup:

```bash
cd ~/dotfiles
./scripts/doctor.sh
```

## Linux quickstart (Ubuntu/Debian)

```bash
cd ~/dotfiles
./bootstrap
./scripts/install-tools.sh
./scripts/doctor.sh
./scripts/audit-tools.sh
```

`bootstrap`/`install-tools.sh` will call `scripts/install-linux-prereqs.sh` when running on Linux.

## VPS bootstrap (minimal)

Use these scripts for a locked-down Linux VPS flow:

```bash
cd ~/dotfiles
TAILSCALE_AUTHKEY=tskey-auth-... ./scripts/bootstrap-vps.sh
./scripts/install-tools-vps.sh
./scripts/doctor-vps.sh
```

Defaults:
- admin user: `christian`
- SSH keys: copies `/root/.ssh/authorized_keys` into `christian` on first run

Important flags:
- `VPS_USER=...` sets the admin username (default `christian`)
- `VPS_USER_SSH_PUBKEY='ssh-ed25519 ...'` appends a key for the admin user
- `VPS_PASSWORDLESS_SUDO=1` (default) configures NOPASSWD sudo for the admin user
- `DOTFILES_REPO=https://...` clones the dotfiles repo into `~/dotfiles` on the VPS
- `ALLOW_PUBLIC_SSH=1` keeps port 22 open in UFW (useful for first bootstraps)
- `SKIP_UFW=1` skips firewall setup
- `INSTALL_VPS_CARGO_TOOLS=1` installs `cargo-tools.vps.txt`
- `TAILSCALE_REQUIRED=0` lets `doctor-vps.sh` pass when Tailscale is intentionally not connected yet

Note: if Tailscale is not connected when the firewall is configured, `ALLOW_PUBLIC_SSH`
is automatically promoted to `1` with a warning to prevent SSH lockout. Rerun the
bootstrap after Tailscale is connected to close port 22.

### Yesman UI service

The VPS dotfiles replace the old Bun `yesmand.service` with the Rust Yesman daemon and UI server.
The user service reads `~/.config/yesman.env`, binds the UI to `0.0.0.0:3777`, and runs from
`~/.local/share/yesman/runtime` so runtime state is scoped consistently.

After installing/building Yesman, set a real UI password and start the service:

```bash
cargo install --path ~/projects/yesman --locked --force
$EDITOR ~/.config/yesman.env # set YESMAN_UI_PASSWORD
systemctl --user daemon-reload
systemctl --user enable --now yesmand.service
yesman status
```

`yesmand.service` refuses to start while `YESMAN_UI_PASSWORD=changeme`.

## Tooling audit

Generate a snapshot of what is currently installed:

```bash
cd ~/dotfiles
./scripts/audit-tools.sh
```

By default this writes files to `audit/latest/`.

## Manual install

If you already have `stow`:

```bash
cd ~/dotfiles
./install
```

## Managed packages

- `aerospace` -> `~/.aerospace.toml` (macOS only)
- `gh-dash` -> `~/.config/gh-dash`
- `git` -> `~/.gitconfig`
- `kitty` -> `~/.config/kitty`
- `nu` -> `~/.config/nushell`
- `nvim` -> `~/.config/nvim`
- `omarchy` -> theme templates, SD card importer, and udiskie hook (Omarchy Linux only)
- `pi` -> `~/.pi/*`
- `starship` -> `~/.config/starship.toml`
- `yesman` -> `~/.config/yesman/*` (legacy plugins and standalone extensions)
- `zellij` -> `~/.config/zellij`

## SD card imports on Omarchy

After `stow -t ~ omarchy`, restart udiskie or log out and back in. Omarchy's
existing udiskie autostart loads `~/.config/udiskie/config.yml`.
Requires system Python with PyGObject/GTK4, udiskie, and notify-send, already
installed on this desktop. `~/.local/bin` must be on udiskie's PATH.

Mounting an external drive with a `DCIM` directory opens a folder-name prompt.
Enter `weekend-trip` to copy into `~/Pictures/Imports/weekend-trip/`.
Cancel leaves everything alone. Nothing deletes or modifies source media.

The importer flattens these files into the chosen folder:
- RAW and JPEG photos under `DCIM/`, including Sony `.ARW` files.
- MP4s under `DCIM/` or Sony's `PRIVATE/M4ROOT/CLIP/`.

It excludes video thumbnails, proxy clips in `SUB/`, XML sidecars, databases,
LUTs, and all other formats. Paths and extensions are case-insensitive.
Other camera video layouts need an explicit addition to the scanner.

Each file is SHA-256 verified before publication. Identical existing files are
skipped; different files sharing a name receive `-1`, `-2`, etc. Existing files
are never overwritten. A Stop button keeps completed copies and removes the
current partial copy. Retry into the same folder to resume. Power loss or a
forced kill can leave a hidden `.sd-import-*` temporary file in the destination;
it is not treated as a completed import. One import window runs at a time.
Wait for completion before safely ejecting the card.

Code: `omarchy/.local/bin/sd-card-import`.

```bash
# Read-only scan of a mounted card
sd-card-import device_mounted True /run/media/$USER/F02F-2C1E --scan

# Manually open the prompt for an already mounted card
sd-card-import device_mounted True /run/media/$USER/F02F-2C1E

# Tests use temporary fixtures, never the real card
/usr/bin/python -B -m unittest discover -s scripts/tests -p 'test_sd_card_import.py' -v
```

To disable automatic prompts, remove `program_options.event_hook` from the
udiskie config and restart udiskie or log out and back in.

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

## Omarchy themes

Omarchy owns the active palette on Linux. Kitty, Pi, and Neovim read Omarchy's
standard generated files. Templates in `omarchy/.config/omarchy/themed/` add
matching Starship, Nushell, and Zellij output.

Use Omarchy's switcher or CLI:

```nu
theme                  # open the Omarchy switcher
theme list
theme current
theme nord             # shorthand for `omarchy theme set nord`
omarchy theme set nord
```

`./install` stows the user templates and runs `omarchy theme refresh`. Kitty,
Pi, and Starship pick up regenerated colors immediately. Start a new Nushell or
Zellij session after switching themes. Restart Neovim to load its new colorscheme.
The synchronized setup is enabled when `omarchy` is installed; the static
Starship and Nushell defaults remain usable elsewhere.

## Pi customizations

The `pi/` package is linked into `~/.pi` and is laid out for Pi's global config:

- `pi/.pi/agent/settings.json` — global Pi settings
- `pi/.pi/agent/keybindings.json` — custom Pi shortcuts
- `pi/.pi/agent/extensions/` — TypeScript extensions
- `pi/.pi/agent/prompts/` — Markdown prompt templates
- `pi/.pi/agent/system-prompts/` — focused system prompts used by shell launchers
- `pi/.pi/agent/skills/` — skills with `SKILL.md`

If `~/.pi/agent/settings.json` already exists as a regular machine-local file,
`./install` preserves it while stowing the rest of the Pi package. Runtime state
like `~/.pi/agent/auth.json` and `~/.pi/agent/sessions/` stays local and is not tracked in git.

See `pi/README.md` for a quick guide to what belongs in each folder.
