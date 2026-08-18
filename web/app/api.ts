export const API_BASE =
  process.env.NEXT_PUBLIC_BANTAI_API_URL || "http://localhost:8080/api/v1";

const API_TIMEOUT_MS = 10000;

function cookie(name: string) {
  if (typeof document === "undefined") return "";
  const row = document.cookie
    .split("; ")
    .find((value) => value.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.split("=").slice(1).join("=")) : "";
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = cookie("bantai_csrf");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const controller = init.signal ? null : new AbortController();
  const timeout = controller
    ? window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    : null;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal: init.signal || controller?.signal,
    });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      throw new ApiError("The shared service took too long to respond. Check Docker, then try again.", 0);
    }
    throw new ApiError("BantAI cannot reach the shared service. Make sure Docker is running, then try again.", 0);
  } finally {
    if (timeout !== null) window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let detail = "BantAI could not complete that request.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Keep the privacy-safe generic message.
    }
    throw new ApiError(detail, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function downloadApiFile(path: string): Promise<{ blob: Blob; filename: string }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      signal: controller.signal,
    });
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      throw new ApiError("The export took too long. Try again after narrowing the approved-label filter.", 0);
    }
    throw new ApiError("BantAI cannot reach the shared service. Make sure Docker is running, then try again.", 0);
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let detail = "BantAI could not export the training-data manifest.";
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // Keep the privacy-safe generic message.
    }
    throw new ApiError(detail, response.status);
  }
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = (match?.[1] || "bantai-training-manifest.csv").replace(/[^a-zA-Z0-9._-]/g, "_");
  return { blob: await response.blob(), filename };
}
