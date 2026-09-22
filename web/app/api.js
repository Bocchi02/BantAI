export const API_BASE = process.env.NEXT_PUBLIC_BANTAI_API_URL || "/api/v1";
const API_TIMEOUT_MS = 30000;
function cookie(name) {
    if (typeof document === "undefined")
        return "";
    const row = document.cookie
        .split("; ")
        .find((value) => value.startsWith(`${name}=`));
    return row ? decodeURIComponent(row.split("=").slice(1).join("=")) : "";
}
export class ApiError extends Error {
    status;
    fieldErrors;
    constructor(message, status, fieldErrors = {}) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}
function validationProblem(detail) {
    if (!Array.isArray(detail))
        return null;
    const fieldErrors = {};
    for (const issue of detail) {
        if (!issue || typeof issue !== "object")
            continue;
        const path = Array.isArray(issue.loc)
            ? issue.loc.filter((part) => part !== "body").join(".")
            : "request";
        const field = path || "request";
        if (!fieldErrors[field] && typeof issue.msg === "string")
            fieldErrors[field] = issue.msg.replace(/^Value error,\s*/i, "");
    }
    const summary = Object.entries(fieldErrors)
        .map(([field, message]) => `${field.replaceAll("_", " ")}: ${message}`)
        .join(" ");
    return { fieldErrors, summary: summary || "Check the highlighted fields and try again." };
}
export async function api(path, init = {}) {
    const method = (init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (init.body)
        headers.set("Content-Type", "application/json");
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const csrf = cookie("bantai_csrf");
        if (csrf)
            headers.set("X-CSRF-Token", csrf);
    }
    const controller = init.signal ? null : new AbortController();
    const timeout = controller
        ? window.setTimeout(() => controller.abort(), API_TIMEOUT_MS)
        : null;
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers,
            credentials: "include",
            signal: init.signal || controller?.signal,
        });
    }
    catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
            throw new ApiError("The Signalam server took too long to respond. Try again shortly.", 0);
        }
        throw new ApiError("Service unavailable. Signalam cannot reach the server.", 0);
    }
    finally {
        if (timeout !== null)
            window.clearTimeout(timeout);
    }
    if (!response.ok) {
        let detail = "Signalam could not complete that request.";
        let fieldErrors = {};
        try {
            const body = (await response.json());
            const validation = validationProblem(body.detail);
            if (validation) {
                detail = validation.summary;
                fieldErrors = validation.fieldErrors;
            }
            else if (typeof body.detail === "string")
                detail = body.detail;
        }
        catch {
            // Keep the privacy-safe generic message.
        }
        throw new ApiError(detail, response.status, fieldErrors);
    }
    if (response.status === 204)
        return undefined;
    return (await response.json());
}
export async function downloadApiFile(path) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            signal: controller.signal,
        });
    }
    catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
            throw new ApiError("The export took too long. Try again after narrowing the approved-label filter.", 0);
        }
        throw new ApiError("Service unavailable. Signalam cannot reach the server.", 0);
    }
    finally {
        window.clearTimeout(timeout);
    }
    if (!response.ok) {
        let detail = "Signalam could not export the training-data manifest.";
        try {
            const body = (await response.json());
            if (body.detail)
                detail = body.detail;
        }
        catch {
            // Keep the privacy-safe generic message.
        }
        throw new ApiError(detail, response.status);
    }
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = (match?.[1] || "signalam-training-manifest.csv").replace(/[^a-zA-Z0-9._-]/g, "_");
    return { blob: await response.blob(), filename };
}
