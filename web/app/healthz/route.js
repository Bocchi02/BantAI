export const dynamic = "force-dynamic";

export function GET() {
    return Response.json(
        { status: "healthy", service: "signalam-web" },
        { headers: { "Cache-Control": "no-store" } },
    );
}
