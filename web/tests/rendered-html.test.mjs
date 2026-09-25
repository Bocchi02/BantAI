import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { proxyApiRequest } from "../server/api-proxy.js";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
let nextServer;
let serverOrigin;
let serverOutput = "";

async function unusedPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

before(async () => {
  const port = await unusedPort();
  serverOrigin = `http://127.0.0.1:${port}`;
  nextServer = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: webRoot, env: { ...process.env, NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  nextServer.stdout.on("data", (chunk) => { serverOutput += chunk; });
  nextServer.stderr.on("data", (chunk) => { serverOutput += chunk; });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (nextServer.exitCode !== null)
      throw new Error(`Next server exited during startup.\n${serverOutput}`);
    try {
      const response = await fetch(`${serverOrigin}/healthz`);
      if (response.ok)
        return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for the Next server.\n${serverOutput}`);
}, { timeout: 30_000 });

after(async () => {
  if (!nextServer || nextServer.exitCode !== null)
    return;
  const exited = new Promise((resolve) => nextServer.once("exit", resolve));
  nextServer.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
});

async function readReactSources(directory = new URL("../app/", import.meta.url)) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = [];
  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      sources.push(await readReactSources(entryUrl));
    } else if (/\.jsx?$/.test(entry.name)) {
      sources.push(await readFile(entryUrl, "utf8"));
    }
  }
  return sources.join("\n");
}

async function render(path = "/", requestedOrigin = serverOrigin) {
  const headers = { accept: "text/html" };
  if (requestedOrigin.startsWith("https:"))
    headers["x-forwarded-proto"] = "https";
  return fetch(`${serverOrigin}${path}`, { headers });
}

test("same-origin API proxy preserves authenticated requests and requires HTTPS configuration", async () => {
  let forwarded;
  const response = await proxyApiRequest(
    new Request("https://app.example.test/api/v1/auth/me?synthetic=1", {
      headers: { cookie: "bantai_session=synthetic", origin: "https://app.example.test" },
    }),
    { BANTAI_API_ORIGIN: "https://api.example.test" },
    async (request) => {
      forwarded = request;
      return Response.json({ ok: true });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(forwarded.url, "https://api.example.test/api/v1/auth/me?synthetic=1");
  assert.equal(forwarded.headers.get("cookie"), "bantai_session=synthetic");
  assert.equal(forwarded.headers.get("origin"), "https://app.example.test");

  const redirect = await proxyApiRequest(
    new Request("https://app.example.test/api/v1/auth/continue"),
    { BANTAI_API_ORIGIN: "https://api.example.test" },
    async () => new Response(null, {
      status: 303,
      headers: {
        location: "https://api.example.test/api/v1/auth/me?continued=1",
        connection: "close",
      },
    }),
  );
  assert.equal(redirect.headers.get("location"), "/api/v1/auth/me?continued=1");
  assert.equal(redirect.headers.get("connection"), null);

  const unavailable = await proxyApiRequest(
    new Request("https://app.example.test/api/v1/auth/me"),
    { BANTAI_API_ORIGIN: "http://api.example.test" },
  );
  assert.equal(unavailable.status, 503);
  assert.match(await unavailable.text(), /not configured/i);

  let loopbackUrl = "";
  const loopback = await proxyApiRequest(
    new Request("http://localhost:3000/api/v1/health"),
    {
      BANTAI_API_ORIGIN: "http://127.0.0.1:8080",
      BANTAI_ALLOW_HTTP_LOOPBACK: "true",
    },
    async (request) => {
      loopbackUrl = request.url;
      return Response.json({ status: "ok" });
    },
  );
  assert.equal(loopback.status, 200);
  assert.equal(loopbackUrl, "http://127.0.0.1:8080/api/v1/health");

  let privatePlatformUrl = "";
  const privatePlatform = await proxyApiRequest(
    new Request("https://app.example.test/api/v1/ready"),
    {
      BANTAI_API_ORIGIN: "http://platform:8080",
      BANTAI_ALLOW_PRIVATE_PLATFORM_ORIGIN: "true",
    },
    async (request) => {
      privatePlatformUrl = request.url;
      return Response.json({ status: "ready" });
    },
  );
  assert.equal(privatePlatform.status, 200);
  assert.equal(privatePlatformUrl, "http://platform:8080/api/v1/ready");

  const privatePlatformDenied = await proxyApiRequest(
    new Request("https://app.example.test/api/v1/ready"),
    { BANTAI_API_ORIGIN: "http://platform:8080" },
  );
  assert.equal(privatePlatformDenied.status, 503);

  const nonLoopback = await proxyApiRequest(
    new Request("http://localhost:3000/api/v1/health"),
    {
      BANTAI_API_ORIGIN: "http://api.example.test",
      BANTAI_ALLOW_HTTP_LOOPBACK: "true",
    },
    async () => { throw new Error("must not run"); },
  );
  assert.equal(nonLoopback.status, 503);
});

test("same-origin API proxy returns a controlled response when the upstream API is offline", async () => {
  const response = await proxyApiRequest(
    new Request("http://localhost:3000/api/v1/public-config"),
    {
      BANTAI_API_ORIGIN: "http://127.0.0.1:8080",
      BANTAI_ALLOW_HTTP_LOOPBACK: "true",
    },
    async () => {
      throw new TypeError("Network connection lost at http://127.0.0.1:8080");
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), "2");
  const body = await response.json();
  assert.deepEqual(body, { detail: "Service unavailable. Signalam cannot reach the API." });
  assert.doesNotMatch(JSON.stringify(body), /Network connection lost|127\.0\.0\.1/i);
});

test("adds HSTS only for HTTPS requests", async () => {
  const response = await render("/", "https://app.example.test");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
});

test("server-renders the Signalam public and account experience", async () => {
  const landingResponse = await render("/");
  assert.equal(landingResponse.status, 200);
  assert.match(landingResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.doesNotMatch(landingResponse.headers.get("content-security-policy") ?? "", /script-src[^;]*unsafe-inline/);
  assert.equal(landingResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(landingResponse.headers.get("x-frame-options"), "DENY");
  assert.equal(landingResponse.headers.get("strict-transport-security"), null);
  const landingHtml = await landingResponse.text();
  assert.match(landingHtml, /nonce="[^"]+"/);
  assert.match(landingHtml, /Clear warnings\. Private by design\./i);
  assert.match(landingHtml, /Sign in to Signalam/i);
  assert.doesNotMatch(landingHtml, /Create account|Create your Signalam account/i);

  const response = await render("/login");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Signalam/);
  assert.match(html, /Privacy-first server-based website and email detection/i);
  assert.doesNotMatch(html, /Get started with Signalam/i);
  assert.doesNotMatch(html, /Forgot password|email verification|account recovery/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("publishes a complete privacy policy without requiring an account", async () => {
  const response = await render("/privacy");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Signalam Privacy Policy/i);
  assert.match(html, /Effective date:[\s\S]{0,50}September 23, 2026/i);
  assert.match(html, /Information we handle/i);
  assert.match(html, /Cloud AI review/i);
  assert.match(html, /Optional reports and training data/i);
  assert.match(html, /Routine activity, submitted reports, and automatic training samples are removed after 90 days/i);
  assert.match(html, /does not provide a self-service account deletion control/i);
  assert.doesNotMatch(html, /GEMINI_API_KEY|BANTAI_ENCRYPTION_KEY|mysql\+pymysql/i);
});

test("landing page explains scope, privacy, and non-guarantee outcomes", async () => {
  const source = await readReactSources();
  assert.match(source, /Server models/);
  assert.match(source, /Contextual cloud review/);
  assert.match(source, /Gmail/);
  assert.match(source, /Outlook/);
  assert.match(source, /Yahoo Mail/);
  assert.match(source, /No strong warning signs/);
  assert.match(source, /Needs caution/);
  assert.match(source, /Suspicious signs found/);
  assert.match(source, /No made-up risk score/);
  assert.match(source, /not a guarantee/i);
  assert.doesNotMatch(source, /typeof window[^\n]+window\.location\.pathname/);
  assert.doesNotMatch(source, /new Date\(\)\.getFullYear\(\)/);
});

test("keeps sensitive configuration out of rendered HTML", async () => {
  const response = await render("/dashboard");
  const html = await response.text();
  assert.doesNotMatch(html, /GEMINI_API_KEY|BANTAI_ENCRYPTION_KEY|mysql\+pymysql/i);
  assert.doesNotMatch(html, /checkpoint-15666|suspicious_probability|overall_numeric_risk_score/i);
});

test("includes explicit full-address reporting and administrator review interfaces", async () => {
  const source = await readReactSources();
  assert.match(source, /Report a website result/);
  assert.match(source, /including its path/);
  assert.match(source, /Full-URL reports and optional 10% contributions use separate, explicit consent workflows/);
  assert.match(source, /type="url"/);
  assert.match(source, /What result did Signalam show/);
  assert.match(source, /Do you think Signalam got this result right/);
  assert.match(source, /Yes, looks right/);
  assert.match(source, /No, report correction/);
  assert.match(source, /Select one response/);
  assert.match(source, /Submit feedback/);
  assert.match(source, /confirmed: true/);
  assert.match(source, /url: reportedUrl\.trim\(\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => void submit\("(?:CORRECT|UNSURE)"\)\}/);
  assert.match(source, /User reviews/);
  assert.match(source, /Approve legitimate/);
  assert.match(source, /Reject feedback/);
  assert.match(source, /Training data/);
  assert.match(source, /Approved URL candidates/);
  assert.match(source, /Encrypted email candidates/);
  assert.match(source, /The body is never displayed after submission/);
  assert.match(source, /Email reports/);
  assert.match(source, /Submit encrypted report/);
  const dashboardSource = await readFile(new URL("../app/views/DashboardView.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboardSource, /DetectionFeedbackCard/);
  assert.match(dashboardSource, /More details/);
  assert.match(dashboardSource, /\/activities\/\$\{item\.id\}\/explanation/);
  assert.doesNotMatch(dashboardSource, /\/companion\//);
  const detailsModal = await readFile(new URL("../app/components/DetectionDetailsModal.jsx", import.meta.url), "utf8");
  assert.match(detailsModal, /role="dialog"/);
  assert.match(detailsModal, /aria-modal="true"/);
  assert.match(detailsModal, /Why this needs attention/);
  assert.match(detailsModal, /website origin/);
  assert.match(detailsModal, /Paths, queries, fragments, and page content were not shared/);
  assert.match(detailsModal, /email provider, sender, subject, and message body/);
  assert.match(detailsModal, /transient email body had expired or was unavailable on this server worker/);
  assert.match(detailsModal, /not added to dashboard history or stored by this feature/);
  assert.match(source, /Email bodies cannot be opened from this interface/);
  assert.match(source, /\/admin\/email-reports/);
  assert.match(source, /\/email-reports/);
  assert.doesNotMatch(source, /candidate\.body_(?:ciphertext|fingerprint)|report\.body_(?:ciphertext|fingerprint)/);
  assert.match(source, /\/admin\/training-data/);
  assert.match(source, /Export URL CSV/);
  assert.match(source, /Export email CSV/);
  assert.match(source, /candidate_type: candidateType/);
  assert.match(source, /Separate CSV exports/);
  assert.match(source, /\/admin\/training-data\/export\.csv/);
  assert.match(source, /Email bodies are not included/);
  assert.match(source, /future restricted training process/);
  assert.match(source, /AI message check/);
  assert.match(source, /Check a message/);
  assert.match(source, /\/message-review/);
  assert.match(source, /Analyze pasted text/);
  assert.match(source, /redacts reasonably detectable OTPs/);
  assert.match(source, /not a final Signalam email result/);
  const messageReviewPage = await readFile(new URL("../app/views/MessageReviewView.jsx", import.meta.url), "utf8");
  assert.match(messageReviewPage, /English, Filipino, and Taglish scam context is reviewed/);
  assert.match(messageReviewPage, /Language or code-switching alone is never a warning sign/);
  assert.match(messageReviewPage, /DETAILED ASSESSMENT/);
  assert.match(messageReviewPage, /Text-only confidence/);
  assert.match(messageReviewPage, /Safer next steps/);
  assert.doesNotMatch(messageReviewPage, /Gemini/i);
  assert.doesNotMatch(messageReviewPage, /localStorage|sessionStorage/);
  assert.match(source, /frozen URL detector v1\.0\.0 stays in shadow mode/);
  assert.match(source, /No reporter identity/);
  assert.match(source, /Complete website address/);
  assert.match(source, /does not automatically change future outcomes/);
  assert.doesNotMatch(source, /href=\{report\.origin\}|window\.open\(report\.origin/);
  assert.doesNotMatch(source, /Select a recent website/);
  assert.match(source, /Automatic training-data contribution/);
  assert.match(source, /I agree to automatic random training-data collection/);
  assert.match(source, /Stop collection and delete samples/);
  assert.match(source, /Automatic URL samples/);
  assert.match(source, /Automatic email samples/);
  assert.match(source, /Export URL samples/);
  assert.match(source, /Export email samples/);
  assert.match(source, /not confirmed labels/);
  assert.match(source, /Help and setup/);
  assert.match(source, /chrome:\/\/extensions/);
  assert.match(source, /edge:\/\/extensions/);
  assert.match(source, /Origin, sender, or subject/);
  assert.match(source, /View explanation/);
  assert.match(source, /Review history/);
  assert.match(source, /full_taglish_xlmr_512_headtail_seed13/);
});
