/**
 * Global Server-Side AI Guard & Cost-Safety Control
 * Guarantees zero unhandled AI API invocations and enforces manual operation mode.
 */

export class AIDisabledError extends Error {
  statusCode = 503;
  code = "AI_ASSISTANCE_DISABLED";

  constructor(
    message = "AI assistance is currently disabled. All workflows are fully available via manual mode."
  ) {
    super(message);
    this.name = "AIDisabledError";
  }
}

/**
 * Returns true if AI operations are explicitly disabled via environment configuration.
 */
export function isAIDisabled(): boolean {
  const envMode = (process.env.AI_MODE || "").toUpperCase().trim();
  return (
    process.env.AI_DISABLED === "true" ||
    envMode === "DISABLED" ||
    process.env.AI_PROVIDER === "disabled"
  );
}

/**
 * Global assertion: throws AIDisabledError if AI operations are disabled.
 * Every live, mock, or automated AI execution path must call this guard.
 */
export function assertAIEnabled(): void {
  if (isAIDisabled()) {
    throw new AIDisabledError();
  }
}
