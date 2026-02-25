import type { Logger } from "./types";

interface OpenCodeClientConfig {
  url: string;
  username: string;
  password: string;
  model: string;
}

export interface OpenCodeDispatchInput {
  directory: string;
  sessionTitle: string;
  prompt: string;
}

export interface OpenCodePromptInput {
  sessionId: string;
  directory: string;
  prompt: string;
}

function parseModelSpec(model: string): { providerID: string; modelID: string } {
  const [providerID, ...modelRest] = model.split("/");
  const modelID = modelRest.join("/");
  if (!providerID || !modelID) {
    throw new Error(`Invalid model '${model}'. Expected provider/model`);
  }
  return { providerID, modelID };
}

async function readBody(resp: Response): Promise<string> {
  try {
    const text = (await resp.text()).trim();
    if (!text) return "(empty response body)";
    return text;
  } catch {
    return "(unable to read response body)";
  }
}

export class OpenCodeClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly model: { providerID: string; modelID: string };
  private readonly modelString: string;
  private readonly logger: Logger;

  constructor(config: OpenCodeClientConfig, logger: Logger) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.authHeader = `Basic ${btoa(`${config.username}:${config.password}`)}`;
    this.model = parseModelSpec(config.model);
    this.modelString = config.model;
    this.logger = logger;
  }

  get modelId(): string {
    return this.modelString;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: this.authHeader,
    };
  }

  private async sendPrompt(input: OpenCodePromptInput): Promise<void> {
    const dirParam = encodeURIComponent(input.directory);
    const promptResp = await fetch(
      `${this.baseUrl}/session/${input.sessionId}/prompt_async?directory=${dirParam}`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          parts: [{ type: "text", text: input.prompt }],
        }),
      }
    );

    if (!promptResp.ok) {
      const body = await readBody(promptResp);
      throw new Error(
        `Failed to send prompt: ${promptResp.status} ${promptResp.statusText} -- ${body}`
      );
    }
  }

  async healthcheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/global/health`, {
        headers: this.headers(),
      });
      return resp.ok;
    } catch (error) {
      this.logger.error("OpenCode healthcheck failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async dispatch(input: OpenCodeDispatchInput): Promise<string> {
    const dirParam = encodeURIComponent(input.directory);

    const sessionResp = await fetch(`${this.baseUrl}/session?directory=${dirParam}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ title: input.sessionTitle }),
    });

    if (!sessionResp.ok) {
      const body = await readBody(sessionResp);
      throw new Error(
        `Failed to create session: ${sessionResp.status} ${sessionResp.statusText} -- ${body}`
      );
    }

    const session = (await sessionResp.json()) as { id: string };

    await this.sendPrompt({
      sessionId: session.id,
      directory: input.directory,
      prompt: input.prompt,
    });

    return session.id;
  }

  async promptInSession(input: OpenCodePromptInput): Promise<void> {
    await this.sendPrompt(input);
  }
}
