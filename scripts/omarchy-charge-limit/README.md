# Framework charge-limit popup

The `pav.power` clone adds 60%, 80%, and 100% charge-limit controls to Omarchy's battery popup. Changing a limit applies it with `framework_tool`, reads it back, then atomically saves it. Background checks are silent. Up/down switches between power profiles and charge limits; left/right chooses a value and Enter applies it.

The root-owned helper accepts only `status`, `set 60|80|100`, and `restore`. It uses fixed executable paths and an isolated Python interpreter. Polkit allows password-free access only for the configured user in an active local session. It does not grant unrestricted access to Framework Tool.

## Installation

Requires Omarchy's Quickshell shell and the `framework-system` package on a Framework laptop.

```sh
stow -t ~ omarchy
sudo bash scripts/omarchy-charge-limit/install "$USER"
omarchy plugin enable pav.power
omarchy restart shell
```

The installer installs root-owned copies, not symlinks to writable dotfiles. It initializes the saved limit to 80% only if no saved limit exists. Run it again after editing the helper or service. User plugin changes may need `omarchy restart shell` when editing through the Stow symlink.

Saved state is `/var/lib/omarchy-charge-limit/limit`. `omarchy-charge-limit.service` restores it at Linux startup, with at most three attempts in five minutes if the controller is unavailable. Status, writes, and boot restoration share a lock. A failed write or readback does not replace the saved setting.

The limit is restored after Linux starts, not during firmware boot or while powered off. The BIOS may reset the controller before the service runs. No BIOS settings are changed. There is no periodic enforcement or resume hook; the popup reports when the actual limit differs from the saved limit.

This is a personal clone of Omarchy's power panel, so future upstream panel changes do not automatically merge into it.

## Checks

```sh
/usr/bin/python3 scripts/omarchy-charge-limit/test_charge_limit.py
bash -n scripts/omarchy-charge-limit/install
/usr/lib/qt6/bin/qmlformat omarchy/.config/omarchy/plugins/pav.power/ChargeLimit.qml >/dev/null
pkexec /usr/local/libexec/omarchy-charge-limit status
systemctl is-enabled omarchy-charge-limit.service
systemctl show omarchy-charge-limit.service -p Result -p ExecMainStatus
```

## Remove

Switch the bar back with `omarchy plugin enable omarchy.power`. Then run:

```sh
sudo systemctl disable --now omarchy-charge-limit.service
sudo rm /etc/systemd/system/omarchy-charge-limit.service \
  /etc/polkit-1/rules.d/49-omarchy-charge-limit.rules \
  /usr/share/polkit-1/actions/com.local.omarchy.charge-limit.policy \
  /usr/local/libexec/omarchy-charge-limit
sudo systemctl daemon-reload
```

Removal leaves the current hardware limit unchanged. Choose 100% before removal if you want unrestricted charging. Saved state remains available for reinstallation.
