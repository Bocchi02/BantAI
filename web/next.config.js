const nextConfig = {
    output: "standalone",
    poweredByHeader: false,
    async headers() {
        return [{ source: "/(verify-email|reset-password)", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] }];
    },
};
export default nextConfig;
