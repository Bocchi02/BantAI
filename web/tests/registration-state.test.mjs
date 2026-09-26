import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  emailDeliveryReadyFromConfig,
  normalizeAuthPath,
  registrationEnabledFromConfig,
  registrationPrompt,
} from "../app/registration.js";

test("public registration capability defaults closed and accepts only an explicit true flag", () => {
  assert.equal(registrationEnabledFromConfig(undefined), false);
  assert.equal(registrationEnabledFromConfig({}), false);
  assert.equal(registrationEnabledFromConfig({ public_registration_enabled: false }), false);
  assert.equal(registrationEnabledFromConfig({ public_registration_enabled: true }), true);
  assert.equal(registrationEnabledFromConfig({ public_registration_enabled: true, email_delivery_ready: false }), true);
  assert.equal(emailDeliveryReadyFromConfig(undefined), false);
  assert.equal(emailDeliveryReadyFromConfig({ email_delivery_ready: false }), false);
  assert.equal(emailDeliveryReadyFromConfig({ email_delivery_ready: true }), true);
});

test("auth routing and copy match enabled and controlled-pilot states", () => {
  assert.equal(normalizeAuthPath("/register", false), "/login");
  assert.equal(normalizeAuthPath("/register", true), "/register");
  assert.equal(normalizeAuthPath("/verify-email", false), "/verify-email");
  assert.equal(normalizeAuthPath("/forgot-password", false), "/forgot-password");
  assert.equal(normalizeAuthPath("/reset-password", false), "/reset-password");
  assert.equal(normalizeAuthPath("/unknown", false), "/login");
  assert.equal(registrationPrompt(false), "Accounts are currently provisioned for authorized pilot users.");
  assert.equal(registrationPrompt(true), "Create an account");
});

test("UI surfaces gate registration CTAs and help copy on the capability state", async () => {
  const [app, auth, landing, help] = await Promise.all([
    readFile(new URL("../app/SignalamApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/views/AuthView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/views/LandingView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/views/HelpView.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /api\("\/public-config"\)/);
  assert.match(app, /registrationEnabledFromConfig/);
  assert.match(auth, /<RegisterView go=\{go\} emailDeliveryReady=\{emailDeliveryReady\}/);
  assert.match(auth, /Forgot password\?/);
  assert.match(auth, /authorized pilot users/);
  assert.match(landing, /registrationEnabled \? "Get started with Signalam" : "Sign in to Signalam"/);
  assert.match(landing, /registrationEnabled \? "Create your Signalam account" : "Sign in to Signalam"/);
  assert.match(help, /Use your provisioned account/);
});
