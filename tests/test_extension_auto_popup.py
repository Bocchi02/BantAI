"""Synthetic extension popup checks; no browser or real cloud requests."""

import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which("node"), "Node required")
class ExtensionAutoPopupTests(unittest.TestCase):
    def test_safe_site_opens_once_across_paths_subdomains_and_worker_restart(self) -> None:
        script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync('extension/background/service-worker.js', 'utf8');
const session = {};
let opened = 0;

function worker() {
  const context = {
    console, URL, crypto: webcrypto, TextEncoder, Uint8Array,
    automaticPopupStates: new Map(), AUTO_POPUP_DURATION_MS: 5000,
    STORAGE_KEYS: {autoPopup: 'popup', autoPopupSites: 'sites'},
    chrome: {
      storage: {session: {
        get: async key => ({[key]: structuredClone(session[key])}),
        set: async values => Object.assign(session, structuredClone(values))
      }},
      action: {openPopup: async () => {opened++;}}
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function hostnameForUrl('), source.indexOf('function buildEmailFingerprint(')), context);
  vm.runInContext(source.slice(source.indexOf('async function openFiveSecondPopup('), source.indexOf('async function injectProviderScript(')), context);
  return context;
}

async function visit(context, tabId, url, outcome) {
  if (session.popup) session.popup.deadline = 0;
  return context.openFiveSecondPopup(
    {id: tabId, windowId: 1, url}, `${url}:${outcome}`,
    'url_review_complete', {url, outcome}
  );
}

(async () => {
  let context = worker();
  assert.equal(await visit(context, 1, 'https://example.test/one', 'NO_STRONG_WARNING_SIGNS'), true);
  assert.equal(opened, 1);
  // A new warning takes priority even while the prior safe popup is active.
  assert.equal(await context.openFiveSecondPopup(
    {id: 1, windowId: 1}, 'https://example.test/warning:SUSPICIOUS_SIGNS_FOUND',
    'url_review_complete', {url: 'https://example.test/warning', outcome: 'SUSPICIOUS_SIGNS_FOUND'}
  ), true);
  assert.equal(opened, 2);
  assert.equal(await visit(context, 2, 'https://www.example.test/two', 'NO_STRONG_WARNING_SIGNS'), false);
  assert.equal(await visit(context, 3, 'https://login.example.test/three', 'NO_STRONG_WARNING_SIGNS'), false);
  assert.equal(await visit(context, 4, 'https://different.test/', 'NO_STRONG_WARNING_SIGNS'), true);
  assert.equal(await visit(context, 5, 'https://shop.example.co.uk/', 'NO_STRONG_WARNING_SIGNS'), true);
  assert.equal(await visit(context, 6, 'https://other.co.uk/', 'NO_STRONG_WARNING_SIGNS'), true);
  assert.equal(await visit(context, 7, 'https://x.shop.example.co.uk/', 'NO_STRONG_WARNING_SIGNS'), false);
  assert.equal(await visit(context, 12, 'https://one.github.io/', 'NO_STRONG_WARNING_SIGNS'), true);
  assert.equal(await visit(context, 13, 'https://two.github.io/', 'NO_STRONG_WARNING_SIGNS'), true);
  assert.equal(await visit(context, 14, 'https://sub.one.github.io/', 'NO_STRONG_WARNING_SIGNS'), false);
  assert.equal(opened, 7);

  // A completed warning must still alert even when the site was seen before.
  assert.equal(await visit(context, 8, 'https://login.example.test/warning', 'SUSPICIOUS_SIGNS_FOUND'), true);
  assert.equal(await visit(context, 9, 'https://login.example.test/danger', 'DANGEROUS'), true);
  assert.equal(await visit(context, 10, 'https://login.example.test/caution', 'NEEDS_CAUTION'), false);
  assert.equal(opened, 9);

  context = worker();
  assert.equal(await visit(context, 11, 'https://portal.example.test/after-restart', 'NO_STRONG_WARNING_SIGNS'), false);
  assert.equal(opened, 9);
  assert.ok(Object.keys(session.sites).length > 0);
  assert.ok(!JSON.stringify(session.sites).includes('example.test'));
})().catch(error => {console.error(error); process.exitCode = 1;});
"""
        result = subprocess.run(
            [shutil.which("node"), "-e", script],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_completed_safe_url_opens_without_cloud_but_incomplete_warning_waits(self) -> None:
        script = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('extension/background/service-worker.js', 'utf8');
const tab = {id: 1, windowId: 1, url: 'https://example.test/first'};
let nextResult, popupCalls = [], modalCalls = [];
let state = {};
const context = {
  console, tab, Date,
  urlSequences: new Map(), COMPLETE_CLOUD_STATUSES: new Set([
    'NO_STRONG_WARNING_SIGNS', 'NEEDS_CAUTION', 'SUSPICIOUS_SIGNS_FOUND'
  ]),
  checkDetectionAccess: async () => true,
  providerForUrl: () => null, canScanAddressBarUrl: () => true,
  getTabStates: async () => ({}), compactHash: () => 'hash',
  hostnameForUrl: () => 'example.test',
  patchTabState: async (id, update) => (state = update(state)),
  defaultEmailState: () => ({state: 'disabled'}),
  nowIso: () => new Date().toISOString(),
  fetchUrlAnalysis: async () => nextResult,
  chrome: {tabs: {get: async () => tab}},
  cloudReviewIsComplete: review => ['NO_STRONG_WARNING_SIGNS', 'NEEDS_CAUTION', 'SUSPICIOUS_SIGNS_FOUND'].includes(review?.status),
  updateBadge: async () => {}, setServerState: async () => {},
  shouldAutomaticallyOpenForUrl: reason => reason === 'address_bar_changed',
  openFiveSecondPopup: async (...args) => {popupCalls.push(args); return true;},
  isDangerousOutcome: outcome => outcome === 'SUSPICIOUS_SIGNS_FOUND',
  showDangerousResultModal: async (...args) => {modalCalls.push(args); return true;},
  isPairingRequiredError: () => false, disableDetectionForPairing: async () => {}
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('async function performCurrentTabUrlScan('), source.indexOf('async function scanCurrentTabUrl(')), context);

(async () => {
  nextResult = {
    signal: 'SAFE', final_result: 'NO_STRONG_WARNING_SIGNS',
    current_url: tab.url, hostname: 'example.test', llm_review: {status: 'OFF'}
  };
  await context.performCurrentTabUrlScan(tab, {reason: 'address_bar_changed'});
  assert.equal(state.url_detector.state, 'complete');
  assert.equal(popupCalls.length, 1);
  assert.equal(popupCalls[0][3].outcome, 'NO_STRONG_WARNING_SIGNS');

  nextResult = {
    signal: 'SUSPICIOUS', final_result: 'SUSPICIOUS_SIGNS_FOUND',
    current_url: tab.url, hostname: 'example.test', llm_review: {status: 'UNAVAILABLE'}
  };
  await context.performCurrentTabUrlScan(tab, {reason: 'address_bar_changed'});
  assert.equal(state.url_detector.state, 'complete');
  assert.equal(popupCalls.length, 1);

  nextResult = {...nextResult, llm_review: {status: 'SUSPICIOUS_SIGNS_FOUND'}};
  await context.performCurrentTabUrlScan(tab, {reason: 'address_bar_changed'});
  assert.equal(popupCalls.length, 1);
  assert.equal(modalCalls.length, 1);
  assert.equal(modalCalls[0][2], 'URL');
})().catch(error => {console.error(error); process.exitCode = 1;});
"""
        result = subprocess.run(
            [shutil.which("node"), "-e", script],
            cwd=ROOT, capture_output=True, text=True, check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
