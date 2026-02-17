type LogContext = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: String(error) };
}

function emit(level: "info" | "error", event: string, context?: LogContext) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(context || {}),
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }
}

export function logInfo(event: string, context?: LogContext) {
  emit("info", event, context);
}

export function logError(event: string, error: unknown, context?: LogContext) {
  emit("error", event, {
    ...(context || {}),
    error: serializeError(error),
  });
}
