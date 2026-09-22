const API_PREFIX = "/api/v1";

function configuredApiOrigin(env) {
    const value = String(env?.BANTAI_API_ORIGIN || "").trim().replace(/\/$/, "");
    const allowHttpLoopback = String(env?.BANTAI_ALLOW_HTTP_LOOPBACK || "").toLowerCase() === "true";
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        return null;
    }
    const isExplicitDevelopmentLoopback = (
        allowHttpLoopback
        && parsed.protocol === "http:"
        && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    );
    if (
        (parsed.protocol !== "https:" && !isExplicitDevelopmentLoopback)
        || parsed.origin !== value
        || parsed.username
        || parsed.password
    ) {
        return null;
    }
    return parsed.origin;
}

export async function proxyApiRequest(request, env, fetchImpl = fetch) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== API_PREFIX && !requestUrl.pathname.startsWith(`${API_PREFIX}/`)) {
        return null;
    }
    const apiOrigin = configuredApiOrigin(env);
    if (!apiOrigin) {
        return Response.json(
            { detail: "Service unavailable. The Signalam API route is not configured." },
            { status: 503 },
        );
    }
    const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
    try {
        return await fetchImpl(new Request(upstreamUrl, request));
    }
    catch {
        return Response.json(
            { detail: "Service unavailable. Signalam cannot reach the API." },
            {
                status: 503,
                headers: {
                    "Cache-Control": "no-store",
                    "Retry-After": "2",
                },
            },
        );
    }
}
