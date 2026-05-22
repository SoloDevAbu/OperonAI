import pino from "pino"

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal"

export interface LoggerOptions {
  service: string
  level?: LogLevel
  prettyPrint?: boolean
}

export const createLogger = (options: LoggerOptions) => {
  const { service, level, prettyPrint } = options

  const isDev = process.env.NODE_ENV === "development"

  const usePretty = prettyPrint ?? isDev

  const transport = usePretty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translationTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined

  const logger = pino({
    name: service,
    level: level ?? (isDev ? "debug" : "info"),
    transport,
    base: {
      service,
      env: process.env.NODE_ENV ?? "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "*.apiKey",
        "*.api_key",
        "*.password",
        "*.token",
        "*.secret",
        "*.authorization",
      ],
      censor: "[]",
    },
  })

  return logger
}

export type Logger = ReturnType<typeof createLogger>

export { pino }
