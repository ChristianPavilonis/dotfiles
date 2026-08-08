import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

type ThinkingPreset = {
  key: string;
  label: ThinkingLevel;
};

const PRESETS: ThinkingPreset[] = [
  { key: "1", label: "max" },
  { key: "2", label: "xhigh" },
  { key: "3", label: "high" },
  { key: "4", label: "medium" },
  { key: "5", label: "low" },
  { key: "6", label: "minimal" },
  { key: "7", label: "off" },
];

class ThinkingHarpoonOverlay {
  private readonly box = new Box(1, 1, (s: string) => this.theme.fg("border", s));

  constructor(
    private readonly theme: any,
    private readonly done: (result: string | null) => void,
    private readonly activeThinkingLevel: ThinkingLevel,
  ) {
    this.box.addChild(new Text(this.theme.fg("accent", this.theme.bold("Thinking harpoon")), 1, 0));
    this.box.addChild(new Text("", 1, 0));

    for (const preset of PRESETS) {
      const isActive = preset.label === this.activeThinkingLevel;
      const label = isActive
        ? this.theme.fg("success", `● ${preset.key}. ${preset.label} (active)`)
        : this.theme.fg("text", `  ${preset.key}. ${preset.label}`);
      this.box.addChild(new Text(label, 1, 0));
    }

    this.box.addChild(new Text("", 1, 0));
    this.box.addChild(new Text(this.theme.fg("dim", "Press 1/2/3/4/5/6/7 to switch • Esc to cancel"), 1, 0));
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.done(null);
      return;
    }

    const preset = PRESETS.find((item) => matchesKey(data, item.key));
    if (preset) {
      this.done(preset.key);
    }
  }

  render(width: number): string[] {
    const inner = Math.max(20, Math.min(width - 4, 50));
    const lines = this.box.render(inner);
    const pad = (s: string) => s + " ".repeat(Math.max(0, inner - visibleWidth(s)));
    return [
      this.theme.fg("border", `╭${"─".repeat(inner)}╮`),
      ...lines.map((line) => this.theme.fg("border", "│") + pad(line) + this.theme.fg("border", "│")),
      this.theme.fg("border", `╰${"─".repeat(inner)}╯`),
    ];
  }

  invalidate(): void {}
}

export default function (pi: ExtensionAPI) {
  pi.registerShortcut("alt+t", {
    description: "Open thinking harpoon",
    handler: async (ctx) => {
      const choice = await ctx.ui.custom<string | null>(
        (_tui, theme, _keybindings, done) =>
          new ThinkingHarpoonOverlay(theme, done, pi.getThinkingLevel()),
        { overlay: true },
      );

      if (!choice) return;

      const preset = PRESETS.find((item) => item.key === choice);
      if (!preset) return;

      pi.setThinkingLevel(preset.label);
      const appliedLevel = pi.getThinkingLevel();
      if (appliedLevel === preset.label) {
        ctx.ui.notify(`Thinking level: ${appliedLevel}`, "info");
      } else {
        ctx.ui.notify(`Thinking level ${preset.label} unavailable; using ${appliedLevel}`, "warning");
      }
    },
  });
}
