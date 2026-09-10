import { randomUUID } from "crypto";

export interface Span {
  traceId: string;
  spanId: string;
  name: string;
  startTime: number;
  durationMs?: number;
  status: "OK" | "ERROR";
  attributes: Record<string, unknown>;
  error?: string;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "encryptedaccesstoken",
  "encryptedrefreshtoken",
  "secret",
  "clientsecret",
  "apikey",
  "authorization",
  "cookie",
  "codeverifier",
  "statetoken",
  "privatekey",
]);

/**
 * Recursively redacts sensitive keys and values from telemetry attributes and logs.
 */
export function sanitizeAttributes(data: unknown, depth = 0): unknown {
  if (depth > 6 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    // Redact bearer tokens or authorization headers
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(data)) {
      return data.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
    }
    // Redact suspected JWT or base64 keys
    if (/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(data) && data.length > 40) {
      return "[REDACTED_JWT]";
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAttributes(item, depth + 1));
  }

  if (typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("token") || lowerKey.includes("secret") || lowerKey.includes("password")) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeAttributes(value, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Extracts or generates correlation / request ID.
 */
export function getCorrelationId(headers?: Headers | Record<string, string | string[] | undefined> | null): string {
  if (!headers) return randomUUID();

  if (typeof (headers as Headers).get === "function") {
    const h = headers as Headers;
    return h.get("x-correlation-id") || h.get("x-request-id") || randomUUID();
  }

  const raw = headers as Record<string, string | string[] | undefined>;
  const val = raw["x-correlation-id"] || raw["x-request-id"];
  if (Array.isArray(val)) return val[0] || randomUUID();
  if (typeof val === "string" && val.trim().length > 0) return val.trim();

  return randomUUID();
}

export class TelemetryMetrics {
  private static counters: Map<string, number> = new Map();
  private static gauges: Map<string, number> = new Map();

  static increment(name: string, count = 1, tags?: Record<string, string>) {
    const key = tags ? `${name}:${JSON.stringify(tags)}` : name;
    this.counters.set(key, (this.counters.get(key) || 0) + count);
  }

  static gauge(name: string, value: number) {
    this.gauges.set(name, value);
  }

  static getSnapshot() {
    return {
      counters: Object.fromEntries(this.counters.entries()),
      gauges: Object.fromEntries(this.gauges.entries()),
    };
  }

  static reset() {
    this.counters.clear();
    this.gauges.clear();
  }
}

export class Logger {
  private static logJson(level: "INFO" | "WARN" | "ERROR", message: string, meta?: Record<string, unknown>) {
    const sanitizedMeta = meta ? (sanitizeAttributes(meta) as Record<string, unknown>) : {};
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: "mediaos",
      message,
      ...sanitizedMeta,
    };

    // Use single-line structured stdout for production log ingestion
    const output = JSON.stringify(logEntry);
    if (level === "ERROR") {
      console.error(output);
    } else if (level === "WARN") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  static info(message: string, meta?: Record<string, unknown>) {
    this.logJson("INFO", message, meta);
  }

  static warn(message: string, meta?: Record<string, unknown>) {
    this.logJson("WARN", message, meta);
  }

  static error(message: string, meta?: Record<string, unknown>) {
    this.logJson("ERROR", message, meta);
  }
}

/**
 * Tracing wrapper executing async callback within an OpenTelemetry-compatible span.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, unknown>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const traceId = randomUUID();
  const spanId = randomUUID();
  const startTime = Date.now();

  const span: Span = {
    traceId,
    spanId,
    name,
    startTime,
    status: "OK",
    attributes: { ...attributes },
  };

  TelemetryMetrics.increment(`span.${name}.started`);

  try {
    const result = await fn(span);
    span.durationMs = Date.now() - startTime;
    TelemetryMetrics.increment(`span.${name}.completed`);

    Logger.info(`[Span] ${name} completed in ${span.durationMs}ms`, {
      traceId,
      spanId,
      spanName: name,
      durationMs: span.durationMs,
      status: span.status,
      attributes: span.attributes,
    });

    return result;
  } catch (error) {
    span.durationMs = Date.now() - startTime;
    span.status = "ERROR";
    span.error = error instanceof Error ? error.message : String(error);
    TelemetryMetrics.increment(`span.${name}.failed`);

    Logger.error(`[Span] ${name} failed after ${span.durationMs}ms: ${span.error}`, {
      traceId,
      spanId,
      spanName: name,
      durationMs: span.durationMs,
      status: span.status,
      error: span.error,
      attributes: span.attributes,
    });

    throw error;
  }
}
