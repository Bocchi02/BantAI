import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders BantAI account experience", async () => {
  const response = await render("/login");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /BantAI/);
  assert.match(html, /Decision support for safer browsing/i);
  assert.doesNotMatch(html, /Forgot password|email verification|account recovery/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps sensitive configuration out of rendered HTML", async () => {
  const response = await render("/dashboard");
  const html = await response.text();
  assert.doesNotMatch(html, /GEMINI_API_KEY|BANTAI_ENCRYPTION_KEY|mysql\+pymysql/i);
  assert.doesNotMatch(html, /checkpoint-15666|suspicious_probability|overall_numeric_risk_score/i);
});

test("includes explicit full-address reporting and administrator review interfaces", async () => {
  const source = await readFile(new URL("../app/BantAIApp.tsx", import.meta.url), "utf8");
  assert.match(source, /Report a website result/);
  assert.match(source, /including its path/);
  assert.match(source, /Only addresses you submit are collected in full/);
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
  const dashboardSource = source.slice(source.indexOf("function DashboardPage"), source.indexOf("function ConnectionItem"));
  assert.doesNotMatch(dashboardSource, /DetectionFeedbackCard/);
  assert.match(source, /Email bodies cannot be opened from this interface/);
  assert.match(source, /body_included/);
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
  assert.match(source, /RF V4-B remains frozen/);
  assert.match(source, /No reporter identity/);
  assert.match(source, /Complete website address/);
  assert.match(source, /does not automatically change future outcomes/);
  assert.doesNotMatch(source, /href=\{report\.origin\}|window\.open\(report\.origin/);
  assert.doesNotMatch(source, /Select a recent website/);
});
