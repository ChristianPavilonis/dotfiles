import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Text, matchesKey, visibleWidth } from "@mariozechner/pi-tui";

type ModelPreset = {
  key: string;
  label: string;
  provider: string;
  modelId: string;
};

const PRESETS: ModelPreset[] = [
  {
    key: "1",
    label: "GPT-5.4",
    provider: "openai-codex",
    modelId: "gpt-5.4",
  },
  {
    key: "2",
    label: "GPT-5.4 Mini",
    provider: "openai-codex",
    modelId: "gpt-5.4-mini",
  },
];

let activeModelKey: string | undefined;

async function activatePreset(pi: ExtensionAPI, ctx: any, preset: ModelPreset) {
  const model = ctx.modelRegistry.find(preset.provider, preset.modelId);
  if (!model) {
    ctx.ui.notify(`Model not found: ${preset.provider}/${preset.modelId}`, "error");
    return;
  }

  const ok = await pi.setModel(model);
  if (!ok) {
    ctx.ui.notify(`No API key available for ${preset.label}`, "error");
    return;
  }

  ctx.ui.notify(`Switched to ${preset.label}`, "info");
}

class ModelLeaderOverlay {
  private readonly box = new Box(1, 1, (s: string) => this.theme.fg("border", s));

  constructor(
    private readonly theme: any,
    private readonly done: (result: string | null) => void,
    private readonly activeModelKey?: string,
  ) {
    this.box.addChild(new Text(this.theme.fg("accent", this.theme.bold("Model leader")), 1, 0));
    this.box.addChild(new Text("", 1, 0));

    for (const preset of PRESETS) {
      const presetModelKey = `${preset.provider}/${preset.modelId}`;
      const isActive = presetModelKey === this.activeModelKey;
      const label = isActive
        ? this.theme.fg("success", `● ${preset.key}. ${preset.label} (active)`)
        : this.theme.fg("text", `  ${preset.key}. ${preset.label}`);
      this.box.addChild(new Text(label, 1, 0));
    }

    this.box.addChild(new Text("", 1, 0));
    this.box.addChild(new Text(this.theme.fg("dim", "Press 1/2/3 to switch • Esc to cancel"), 1, 0));
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      this.done(null);
      return;
    }

    const preset = PRESETS.find((item) => matchesKey(data, item.key));
    if (preset) {
      this.done(preset.key);
      return;
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
  pi.on("session_start", (_event, ctx) => {
    activeModelKey = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
  });

  pi.on("model_select", async (event) => {
    activeModelKey = `${event.model.provider}/${event.model.id}`;
  });

  pi.registerShortcut("alt+m", {
    description: "Open model harpoon",
    handler: async (ctx) => {
      const liveModelKey = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : activeModelKey;
      const choice = await ctx.ui.custom<string | null>(
        (_tui, theme, _keybindings, done) => new ModelLeaderOverlay(theme, done, liveModelKey),
        { overlay: true },
      );

      if (!choice) return;

      const preset = PRESETS.find((item) => item.key === choice);
      if (!preset) return;

      await activatePreset(pi, ctx, preset);
    },
  });
}

