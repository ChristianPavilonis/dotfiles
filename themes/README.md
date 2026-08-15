# Unified themes

Each theme family has one JSON file per supported variant, for example:

```text
themes/
  fallout-terminal/{dark,light}.json
  nord/{dark,light}.json
```

These JSON files are the canonical palette sources for the terminal and editor
configuration in this repository.

Generate native configuration files with:

```bash
bun scripts/theme.ts generate
bun scripts/theme.ts check
```

Generated outputs stay in their existing Stow packages so applications can load
them without requiring Bun at runtime. The Zellij `config.kdl` file also contains
a generated theme block between explicit markers. Edit the source palettes, regenerate,
and review the source and generated changes together. Add another family by creating its `dark.json` and `light.json` files;
the theme manager discovers families automatically.
