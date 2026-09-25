import { proxyApiRequest } from "../../../../server/api-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request) {
    const response = await proxyApiRequest(request, process.env);
    return response ?? Response.json({ detail: "Not found." }, { status: 404 });
}

export {
    handle as DELETE,
    handle as GET,
    handle as HEAD,
    handle as OPTIONS,
    handle as PATCH,
    handle as POST,
    handle as PUT,
};
