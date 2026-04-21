import { type Plugin, tool } from "@opencode-ai/plugin"
import { readFile, appendFile, access } from "fs/promises"
import { basename, join, isAbsolute } from "path"

function isEnvFile(filepath: string): boolean {
  const name = basename(filepath)
  return /^\.env($|\..*)/.test(name)
}

function parseEnvKeys(content: string): string[] {
  const keys: string[] = []
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
    if (match) keys.push(match[1])
  }
  return keys
}

function resolveEnvPath(
  directory: string,
  filename: string | undefined,
): string {
  const name = filename ?? ".env"
  return isAbsolute(name) ? name : join(directory, name)
}

export const EnvProtectionPlugin: Plugin = async (ctx) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && isEnvFile(output.args.filePath)) {
        throw new Error(
          "Reading .env files directly is blocked. Use the read_env tool to list variable keys, or append_env to add new variables.",
        )
      }
    },

    tool: {
      read_env: tool({
        description:
          "List the environment variable keys defined in a .env file without exposing their values. Returns one key per line.",
        args: {
          filename: tool.schema
            .string()
            .optional()
            .describe(
              'Name or relative path of the env file (default: ".env"). Examples: ".env", ".env.local", ".env.production"',
            ),
        },
        async execute(args, context) {
          const filepath = resolveEnvPath(context.directory, args.filename)

          if (!isEnvFile(filepath)) {
            throw new Error(
              `"${basename(filepath)}" does not look like an env file.`,
            )
          }

          try {
            await access(filepath)
          } catch {
            throw new Error(`File not found: ${filepath}`)
          }

          const content = await readFile(filepath, "utf-8")
          const keys = parseEnvKeys(content)

          if (keys.length === 0) {
            return `No environment variables found in ${basename(filepath)}.`
          }

          return `Environment variables in ${basename(filepath)} (${keys.length}):\n${keys.join("\n")}`
        },
      }),

      append_env: tool({
        description:
          "Append a new environment variable to a .env file. Validates KEY=value format and rejects duplicate keys.",
        args: {
          key: tool.schema
            .string()
            .describe(
              "Environment variable name (must start with a letter or underscore, and contain only letters, digits, and underscores)",
            ),
          value: tool.schema
            .string()
            .describe("Environment variable value"),
          filename: tool.schema
            .string()
            .optional()
            .describe(
              'Name or relative path of the env file (default: ".env")',
            ),
        },
        async execute(args, context) {
          const filepath = resolveEnvPath(context.directory, args.filename)

          if (!isEnvFile(filepath)) {
            throw new Error(
              `"${basename(filepath)}" does not look like an env file.`,
            )
          }

          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args.key)) {
            throw new Error(
              `Invalid variable name "${args.key}". Must start with a letter or underscore and contain only letters, digits, and underscores.`,
            )
          }

          let existing = ""
          try {
            existing = await readFile(filepath, "utf-8")
          } catch {
            // File doesn't exist yet — we'll create it
          }

          const existingKeys = parseEnvKeys(existing)
          if (existingKeys.includes(args.key)) {
            throw new Error(
              `Variable "${args.key}" already exists in ${basename(filepath)}. Remove or edit it manually if you need to change its value.`,
            )
          }

          const needsNewline = existing.length > 0 && !existing.endsWith("\n")
          const line = `${needsNewline ? "\n" : ""}${args.key}=${args.value}\n`
          await appendFile(filepath, line, "utf-8")

          return `Added ${args.key} to ${basename(filepath)}.`
        },
      }),
    },
  }
}
