const API_PREFIX = "/api/v1";
const HOP_BY_HOP_HEADERS = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
];

export function configuredApiOrigin(env) {
    const value = String(env?.BANTAI_API_ORIGIN || "").trim().replace(/\/$/, "");
    const allowHttpLoopback = String(env?.BANTAI_ALLOW_HTTP_LOOPBACK || "").toLowerCase() === "true";
    const allowPrivatePlatform = String(env?.BANTAI_ALLOW_PRIVATE_PLATFORM_ORIGIN || "").toLowerCase() === "true";
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
    const isExplicitPrivatePlatform = (
        allowPrivatePlatform
        && parsed.protocol === "http:"
        && parsed.hostname === "platform"
        && parsed.port === "8080"
    );
    if (
        (parsed.protocol !== "https:" && !isExplicitDevelopmentLoopback && !isExplicitPrivatePlatform)
        || parsed.origin !== value
        || parsed.username
        || parsed.password
    ) {
        return null;
    }
    return parsed.origin;
}

function upstreamHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete("host");
    for (const name of HOP_BY_HOP_HEADERS)
        headers.delete(name);
    return headers;
}

function downstreamResponse(response, apiOrigin) {
    const headers = new Headers(response.headers);
    for (const name of HOP_BY_HOP_HEADERS)
        headers.delete(name);

    const location = headers.get("location");
    if (location) {
        try {
            const destination = new URL(location, apiOrigin);
            if (destination.origin === apiOrigin)
                headers.set("location", `${destination.pathname}${destination.search}${destination.hash}`);
        }
        catch {
            headers.delete("location");
        }
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
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
    const init = {
        method: request.method,
        headers: upstreamHeaders(request),
        redirect: "manual",
        signal: request.signal,
    };
    if (request.method !== "GET" && request.method !== "HEAD" && request.body !== null) {
        init.body = request.body;
        init.duplex = "half";
    }

    try {
        const response = await fetchImpl(new Request(upstreamUrl, init));
        return downstreamResponse(response, apiOrigin);
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
