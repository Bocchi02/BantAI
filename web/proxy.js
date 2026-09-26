import { NextResponse } from "next/server";

function contentSecurityPolicy(nonce) {
    const developmentScriptSource = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "frame-src 'none'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
        "script-src-attr 'none'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
    ].join("; ");
}

export function proxy(request) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = contentSecurityPolicy(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("Content-Security-Policy", csp);
    requestHeaders.set("x-nonce", nonce);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("X-Content-Type-Options", "nosniff");
    const accountLinkPage = ["/verify-email", "/reset-password"].includes(request.nextUrl.pathname);
    response.headers.set("Referrer-Policy", accountLinkPage ? "no-referrer" : "strict-origin-when-cross-origin");
    if (accountLinkPage) {
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.headers.set("X-Frame-Options", "DENY");

    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0].trim();
    if (request.nextUrl.protocol === "https:" || forwardedProtocol === "https") {
        response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return response;
}

export const config = {
    matcher: [
        {
            source: "/((?!api|healthz|_next/static|_next/image|favicon.svg|og-signalam.png|og-signalam.svg).*)",
            missing: [
                { type: "header", key: "next-router-prefetch" },
                { type: "header", key: "purpose", value: "prefetch" },
            ],
        },
    ],
};
