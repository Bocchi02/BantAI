import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { proxyApiRequest } from "../worker/api-proxy.js";

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

async function render(path = "/", origin = "http://localhost") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`${origin}${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
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

test("adds HSTS only for HTTPS requests", async () => {
  const response = await render("/", "https://app.example.test");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
});

test("server-renders the BantAI public and account experience", async () => {
  const landingResponse = await render("/");
  assert.equal(landingResponse.status, 200);
  assert.match(landingResponse.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.doesNotMatch(landingResponse.headers.get("content-security-policy") ?? "", /script-src[^;]*unsafe-inline/);
  assert.equal(landingResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(landingResponse.headers.get("x-frame-options"), "DENY");
  assert.equal(landingResponse.headers.get("strict-transport-security"), null);
  const landingHtml = await landingResponse.text();
  assert.match(landingHtml, /Clear warnings\. Private by design\./i);
  assert.match(landingHtml, /Sign in to BantAI/i);
  assert.doesNotMatch(landingHtml, /Create account|Create your BantAI account/i);

  const response = await render("/login");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /BantAI/);
  assert.match(html, /Privacy-first server-based website and email detection/i);
  assert.doesNotMatch(html, /Get started with BantAI/i);
  assert.doesNotMatch(html, /Forgot password|email verification|account recovery/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
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
  assert.match(source, /What result did BantAI show/);
  assert.match(source, /Do you think BantAI got this result right/);
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
  assert.match(source, /not a final BantAI email result/);
  const messageReviewPage = await readFile(new URL("../app/views/MessageReviewView.jsx", import.meta.url), "utf8");
  assert.match(messageReviewPage, /English, Filipino, and Taglish scam context is reviewed/);
  assert.match(messageReviewPage, /Language or code-switching alone is never a warning sign/);
  assert.match(messageReviewPage, /DETAILED ASSESSMENT/);
  assert.match(messageReviewPage, /Text-only confidence/);
  assert.match(messageReviewPage, /Safer next steps/);
  assert.doesNotMatch(messageReviewPage, /Gemini/i);
  assert.doesNotMatch(messageReviewPage, /localStorage|sessionStorage/);
  assert.match(source, /BantAI RF Grouped v1\.0\.0 stays in shadow mode/);
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
