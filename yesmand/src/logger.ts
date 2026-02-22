import type { Logger } from "./types";

function emit(
  level: "INFO" | "WARN" | "ERROR" | "DEBUG",
  message: string,
  details?: Record<string, unknown>
): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    service: "yesmand",
    message,
  };

  if (details && Object.keys(details).length > 0) {
    payload.details = details;
  }

  if (level === "ERROR") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export function createLogger(debugEnabled: boolean): Logger {
  return {
    info(message, details) {
      emit("INFO", message, details);
    },
    warn(message, details) {
      emit("WARN", message, details);
    },
    error(message, details) {
      emit("ERROR", message, details);
    },
    debug(message, details) {
      if (!debugEnabled) return;
      emit("DEBUG", message, details);
    },
  };
}
