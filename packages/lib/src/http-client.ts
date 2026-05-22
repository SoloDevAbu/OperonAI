export interface HttpClientOptions {
  baseUrl: string
  timeoutMs?: number
  defaultHeaders?: Record<string, string>
  serviceName?: string
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
}

export interface HttpResponse<T> {
  data: T
  status: number
  ok: boolean
}

export class HttpError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
    this.body = body
  }
}

export const createHttpClient = (options: HttpClientOptions) => {
  const {
    baseUrl,
    timeoutMs: defaultTimeout = 10_000,
    defaultHeaders = {},
    serviceName = "http-client",
  } = options

  const request = async <T>(
    path: string,
    opts: RequestOptions = {}
  ): Promise<HttpResponse<T>> => {
    const {
      method = "GET",
      body,
      headers = {},
      timeoutMs = defaultTimeout,
      retries = 2,
    } = opts

    const url = `${baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...defaultHeaders,
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }

    let lastError: Error | null = null
    let attempt = 0

    while (attempt <= retries) {
      try {
        const res = await fetch(url, fetchOptions)
        clearTimeout(timer)

        let data: T
        const contentType = res.headers.get("content-type") ?? ""

        if (contentType.includes("application/json")) {
          data = (await res.json()) as T
        } else {
          data = (await res.text()) as unknown as T
        }

        if (!res.ok && res.status >= 500 && attempt < retries) {
          lastError = new HttpError(
            res.status,
            data,
            `${serviceName}: ${method} ${url} → ${res.status}`
          )
          attempt++
          await sleep(attempt * 300)
          continue
        }

        if (!res.ok) {
          throw new HttpError(
            res.status,
            data,
            `${serviceName}: ${method} ${url} → ${res.status}`
          )
        }

        return { data, status: res.status, ok: true }
      } catch (err) {
        clearTimeout(timer)

        if (err instanceof Error && err.name === "AbortError") {
          throw new HttpError(
            408,
            null,
            `${serviceName}: ${method} ${url} timed out after ${timeoutMs}ms`
          )
        }

        if (err instanceof HttpError) {
          throw err
        }

        lastError = err instanceof Error ? err : new Error(String(err))
        attempt++

        if (attempt <= retries) {
          await sleep(attempt * 300)
          continue
        }
      }
    }

    throw (
      lastError ??
      new Error(
        `${serviceName}: ${method} ${url} failed after ${retries} retries`
      )
    )
  }

  const get = <T>(
    path: string,
    opts?: Omit<RequestOptions, "method" | "body">
  ) => request<T>(path, { ...opts, method: "GET" })

  const post = <T>(
    path: string,
    body: unknown,
    opts?: Omit<RequestOptions, "method" | "body">
  ) => request<T>(path, { ...opts, method: "POST", body })

  const put = <T>(
    path: string,
    body: unknown,
    opts?: Omit<RequestOptions, "method" | "body">
  ) => request<T>(path, { ...opts, method: "PUT", body })

  const patch = <T>(
    path: string,
    body: unknown,
    opts?: Omit<RequestOptions, "method" | "body">
  ) => request<T>(path, { ...opts, method: "PATCH", body })

  const del = <T>(
    path: string,
    opts?: Omit<RequestOptions, "method" | "body">
  ) => request<T>(path, { ...opts, method: "DELETE" })

  return { request, get, post, put, patch, delete: del }
}

export type HttpClient = ReturnType<typeof createHttpClient>

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
