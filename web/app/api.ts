export const API_BASE =
  process.env.NEXT_PUBLIC_BANTAI_API_URL || "http://localhost:8080/api/v1";

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
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError("BantAI cannot reach the shared service. Make sure Docker is running, then try again.", 0);
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
