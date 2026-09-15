# BantAI ML and NLP Model Audit

**Audit date:** 2026-09-15
**Repository:** BantAI v1.1.0
**Scope:** Static repository review, frozen-artifact contract checks, deterministic code inspection, existing tests, offline local inference, and controlled synthetic inputs.
**Audit mode:** Audit only. No model, threshold, calibration, preprocessing, dataset, or artifact was changed. No live URL was opened and no real external LLM request was made.

## 1. Executive Summary

### URL Model Assessment

The active URL model is a hash-verified BantAI RF Grouped v1.0.0 `CalibratedClassifierCV` artifact using the shared `bantai_lexical_v1` extractor and 52 features. The production feature names/order, label mapping, threshold, model hash, local-only loading, address-bar-only scope, and shadow/non-blocking mode are protected by code and tests. Static synthetic tests show that case changes are stable, while otherwise small URL transformations can move the score substantially or cross the frozen threshold. No labeled URL evaluation corpus or locked test set is available, so accuracy, false-positive rate, false-negative rate, category performance, and generalization are not independently assessable.

**Rating: NOT ASSESSABLE.** The runtime contract is strong; model validity and deployment performance evidence are incomplete.

### NLP Model Assessment

The active NLP model is the local two-label XLM-RoBERTa checkpoint `full_taglish_xlmr_512_headtail_seed13`, loaded from sharded Safetensors with a local tokenizer. The label mapping, model/config identity, temperature-scaling contract, threshold, subject/head-tail encoding, maximum length, and offline loading are verified. The calibration metadata explicitly describes its evidence as a retrospective test estimate and requires a new external test. There is no auditable email/SMS/Tagalog/Taglish corpus or locked evaluation set in the checkout. Controlled synthetic examples were useful for robustness only; several benign notification-style examples produced probabilities close to or above the deployed threshold, which is a warning sign for module-level false positives but not a measured production FPR.

**Rating: NOT ASSESSABLE.** The artifact and integration are validly wired, but real-world performance, calibration, language coverage, and leakage cannot be established.

### Hybrid/Fusion Assessment

The deterministic email fusion is transparent and tested. It keeps the current website signal out of email fusion, does not allow LLM-only red, preserves local operation when cloud review is unavailable, and uses `NEEDS_CAUTION` for disagreement or incomplete evidence in most cases. URL fusion only invokes cloud context after a local URL warning and does not browse. Automatic popup tests require completed cloud state. The remaining condition is that model validity and cloud-state presentation still depend on external evaluation and production integration evidence that are not in this checkout.

**Rating: READY WITH CONDITIONS** for deterministic integration review only; not a production ML approval.

### Overall ML Risk

**NOT ASSESSABLE, with a critical evidence blocker and high pre-deployment risk.** The repository proves that frozen contracts are enforced; it does not prove that the frozen models are accurate, calibrated on an independent set, leakage-free, or suitable for Philippine/Taglish users.

### Deployment Recommendation

**MODEL VALIDITY NOT ASSESSABLE.** Obtain immutable, privacy-approved train/validation/test and external Philippine/Taglish evaluation evidence; independently reproduce metrics and calibration; review the synthetic false-positive and URL sensitivity findings; then perform a separate remediation/deployment audit.

## 2. Model Inventory

| Model ID | Purpose | Algorithm | Artifact | Threshold | Status |
|---|---|---|---|---:|---|
| URL-ML | Exact current browser address-bar URL detection | Random Forest wrapped by `CalibratedClassifierCV` with sigmoid calibration | `models/url_random_forest_grouped_v1/bantai_rf_grouped_v1.0.0.joblib` | `0.547` inclusive | Artifact/hash/contract verified; shadow/non-blocking; performance NOT ASSESSABLE |
| NLP-XLMR | Opened-email text classification for legitimate vs phishing/social engineering | `XLMRobertaForSequenceClassification`, 2 labels | `models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/` | calibrated class-1 probability `0.6923658179915227` inclusive | Artifact manifest/config/calibration verified; external performance NOT ASSESSABLE |
| HEURISTIC | Explainable scam/social-engineering evidence extraction | Deterministic regular-expression indicator engine | `backend/scam_indicator_engine.py` | None; not probabilistic | Code and tests reviewable; coverage/performance NOT ASSESSABLE |
| LLM-REVIEW | Additional contextual review of redacted email text or minimized warned URL origin | Provider abstraction with strict schema validation | `backend/llm/` and remote gateway integration | None; not a replacement detector | Redaction, injection boundaries, schema, and unavailable handling tested; provider/quality NOT independently evaluated |
| HYBRID | User-facing deterministic outcome | Rules A-H over local email model, indicators, and cloud review; URL fusion is separate | `backend/fusion_engine.py`, `backend/url_fusion_engine.py` | None; categorical outcomes only | Logic reviewable and tested; readiness conditional on model evidence |

The legacy email checkpoint and URL V4-B artifact are present only as rollback/audit material and are not active. No training model, replacement model, or alternate threshold was selected during this audit.

## 3. Architecture

### URL path

`tab.url` / exact address-bar URL -> conservative URL validation and normalization -> `tldextract` domain fields -> 52-value `bantai_lexical_v1` vector -> frozen RF probability for class 1 -> inclusive threshold `0.547` -> `SAFE` or `SUSPICIOUS` module signal -> optional minimized-origin URL review only after a local warning -> URL deterministic fusion.

The URL detector does not scan email links, DOM anchors, page content, redirects, DNS, or TLS. Production uses the exact current address-bar URL and reports the source as `BROWSER_ADDRESS_BAR`. The URL model is currently shadow/non-blocking according to the manifest and server health contract.

### Email path

Visible sender/subject/body from Gmail, Outlook, or Yahoo -> `safe_text` -> `Subject: ` plus bounded subject head/tail, followed by `Body: ` plus bounded body head/tail -> local XLM-R tokenizer -> at most 512 tokens including special tokens -> model logits -> `softmax(logits / 2.2198894341340183)` -> class-1 calibrated probability -> inclusive threshold `0.6923658179915227` -> `SAFE` or `SUSPICIOUS` local signal.

The same opened-email input independently goes through the explainable scam-indicator engine and, when enabled by the production orchestration, a redacted cloud review. The cloud result is validated against a strict schema and is evidence only.

### Actual hybrid flow

Email fusion combines the local email signal, local indicator support, and validated cloud assessment. The current website/URL result is deliberately not an input to email fusion. URL fusion is separate: a local `SAFE` URL is green with non-guarantee wording; a local warning remains suspicious unless a high-confidence clean hostname review is allowed to clear it, otherwise disagreement is caution. There is no overall numeric risk score and no weighted score formula.

## 4. Model Artifact Integrity

### Verified controls

- RF SHA-256 is hard-coded and checked **before** `joblib.load`: `4fd1417fbca11cc60a1eb1f16e9f71c1db0d76f6ce042feae5abcc2bde528c4c`.
- RF model version, feature extractor version, exact 52 feature names/order, label meanings `{0: legitimate, 1: phishing}`, and threshold `0.547` are checked after load.
- URL V4-B fallback is intentionally disabled in the active server path.
- Email manifest checks declared artifact paths, sizes, and SHA-256 values for `calibration.json`, `config.json`, both Safetensors shards, the Safetensors index, `tokenizer.json`, and `tokenizer_config.json`.
- Email `config.json` is additionally anchored to the hard-coded expected SHA-256; its two-label mapping, model type, and 512-token capacity are checked.
- Email calibration is checked against the hard-coded run ID, method, temperature, positive class, probability definition, threshold, and config hash.
- Transformers loading uses `local_files_only=True`; the Dockerfile copies the frozen runtime artifacts explicitly and the architecture disables runtime model downloads.
- Safetensors avoids Python-pickle code execution for the transformer weights. The RF Joblib file remains a trusted local serialized artifact and is only loaded after the hash check.
- Missing required paths or failed contract validation raise startup/runtime errors rather than selecting an unverified fallback.

`python scripts\\verify_models.py` passed. The manifest and tamper tests also passed.

### Integrity limitation

The email manifest is the source of truth for the hashes of the weight shards, tokenizer, and index, but the manifest itself is not independently anchored by a hard-coded manifest hash or signed release metadata. An actor able to replace both the manifest and those files could make a substituted shard/tokenizer set satisfy the manifest; the hard-coded config/calibration checks do not cryptographically anchor the weight and tokenizer bytes. This is a supply-chain/build-integrity gap, not an observed tamper event.

## 5. Training/Inference Consistency

### URL

**Observed status: contract-consistent, with source-data confirmation unavailable.** Both dataset feature generation and production inference call `one_feature_vector` from `backend/extract_url_features.py`. The artifact stores the same extractor version and 52-name schema, and the inference engine rejects mismatched names or width. Both paths use the same parsed host, registrable domain, provider domain, and IP indicator inputs. Production additionally applies the shared validation/repair path before feature extraction, which is expected for deployment but cannot be compared against the unavailable authoritative training input-generation history.

The features are float32 at batch-generation time. There is no learned preprocessing, external DNS call, timing feature, or runtime API feature in `one_feature_vector`. `tldextract` is configured offline with a bundled snapshot in the inference path.

### NLP

**Observed status: runtime contract verified; independent training-source diff unavailable.** `email_model.py` implements the documented `subject_head_tail` contract: max length 512, body cleaning disabled, subject budget 96, subject tail fraction 0.25, body tail fraction 0.35, explicit subject/body structure, tokenizer special tokens, and no padding requirement for a single request. The model is loaded with the local tokenizer/configuration and tests verify determinism, special tokens, truncation, label mapping, calibration, and endpoint metadata.

The source training implementation referenced in the code comment (`phase4_common.py`) and the authoritative training environment are not present in the checkout. Therefore the following cannot be independently verified against training: tokenizer package revision beyond the checkpoint metadata, dynamic padding strategy, truncation-side configuration in the training dataloader, exact Unicode/whitespace preprocessing in the training job, and the underlying text-source normalization. These are **training-inference consistency conditions**, not observed runtime mismatches.

## 6. URL Feature Audit

All 52 actual features are lexical/statistical values derived from the supplied URL and parsed domain fields. No feature name contains the target label, source name, database name, split identifier, or manually assigned risk label. The production source is deterministic and local.

| Feature | Type | Description | Production Source |
|---|---|---|---|
| `url_length` | count | Length of normalized URL | Exact validated URL |
| `host_length` | count | Hostname length | Parsed normalized host |
| `registrable_domain_length` | count | Private-aware registrable domain length | Offline PSL domain fields |
| `provider_domain_length` | count | ICANN provider domain length | Offline PSL domain fields |
| `path_length` | count | Path length | `urlsplit` path |
| `query_length` | count | Query length | `urlsplit` query |
| `fragment_length` | count | Fragment length | `urlsplit` fragment |
| `path_depth` | count | Non-empty path segments | Path split |
| `query_param_count` | count | Ampersand-delimited query count | Query string |
| `subdomain_count` | count | Host labels above registrable domain | Host/domain fields |
| `tld_length` | count | Provider suffix length | Provider domain |
| `digit_count` | count | Digit count in URL | URL characters |
| `letter_count` | count | Alphabetic count in URL | URL characters |
| `special_count` | count | Non-letter/non-digit count | URL characters |
| `digit_ratio` | ratio | Digits divided by URL length | URL characters |
| `letter_ratio` | ratio | Letters divided by URL length | URL characters |
| `special_ratio` | ratio | Special characters divided by URL length | URL characters |
| `dot_count` | count | Period count | URL characters |
| `hyphen_count` | count | Hyphen count | URL characters |
| `underscore_count` | count | Underscore count | URL characters |
| `slash_count` | count | Slash count | URL characters |
| `at_count` | count | At-sign count | URL characters |
| `question_count` | count | Question-mark count | URL characters |
| `equals_count` | count | Equals-sign count | URL characters |
| `ampersand_count` | count | Ampersand count | URL characters |
| `percent_count` | count | Percent-sign count | URL characters |
| `colon_count` | count | Colon count | URL characters |
| `semicolon_count` | count | Semicolon count | URL characters |
| `host_digit_count` | count | Digits in host | Parsed host |
| `host_digit_ratio` | ratio | Host digits divided by host length | Parsed host |
| `host_hyphen_count` | count | Hyphens in host | Parsed host |
| `host_dot_count` | count | Dots in host | Parsed host |
| `domain_digit_count` | count | Digits in registrable domain | Registrable domain |
| `domain_hyphen_count` | count | Hyphens in registrable domain | Registrable domain |
| `is_https` | binary | HTTPS scheme indicator | Parsed scheme |
| `is_http` | binary | HTTP scheme indicator | Parsed scheme |
| `is_ip_host` | binary | Host is an IP literal | Validation/domain fields |
| `has_explicit_port` | binary | Explicit port present | Parsed URL |
| `has_userinfo` | binary | Userinfo present | Parsed URL |
| `has_fragment` | binary | Fragment present | Parsed URL |
| `has_query` | binary | Query present | Parsed URL |
| `has_punycode` | binary | `xn--` in host | Parsed host |
| `is_suffixless_host` | binary | Host lacks a provider suffix and is not IP | Host/provider fields |
| `host_equals_registrable` | binary | Host equals registrable domain | Host/domain fields |
| `url_entropy` | continuous | Shannon entropy of URL characters | URL characters |
| `token_count` | count | Alphanumeric token count | Lowercased URL regex |
| `mean_token_length` | continuous | Mean token length | URL tokens |
| `max_token_length` | count | Longest token length | URL tokens |
| `suspicious_token_count` | count | Matches from the fixed suspicious lexical regex | Lowercased URL regex |
| `encoded_octet_count` | count | Percent-encoded octets | URL regex |
| `max_repeated_char_run` | count | Longest repeated-character run | URL characters |
| `path_extension_length` | count | Last path-segment extension length | Parsed path |

### Leakage and instability assessment

No target or source field enters the feature vector. Features are deterministic and do not depend on live DNS, page content, redirects, third-party APIs, or current domain reputation. Shortcut-learning risk remains plausible because lexical length, host structure, digits, separators, HTTPS, and suspicious-token counts can correlate with dataset construction. The artifact does not prove that such correlations generalize.

## 7. URL Model Performance

**METRIC REPRODUCTION NOT POSSIBLE.** No ML-ready URL corpus, feature matrix, locked test set, confusion matrix, or evaluation output is present in this checkout. The RF bundle includes training/validation feature hashes and `locked_test_accessed: false`, but those hashes are not enough to recreate rows or metrics.

| Metric | Result |
|---|---:|
| Accuracy | N/A |
| Precision | N/A |
| Recall | N/A |
| Specificity | N/A |
| F1 | N/A |
| FPR | N/A |
| FNR | N/A |
| ROC-AUC | N/A |
| PR-AUC | N/A |
| TP/TN/FP/FN | N/A |

No claim of URL accuracy or production false-positive/false-negative performance is supported.

## 8. URL Confusion Matrix

Not available. There is no labeled evaluation set. The 14-row `DUAL_DETECTOR_VALIDATION_TRACKER.csv` is a manual QA checklist, not a URL dataset and has no target labels.

## 9. URL Threshold Analysis

The active threshold is `0.547`, defined in the RF manifest, the frozen inference contract, the server response contract, and tests. The comparison is inclusive (`probability >= threshold` means phishing). Threshold identity and boundary behavior are verified.

Nearby-threshold precision/recall/F1/FPR/FNR analysis is **NOT ASSESSABLE** because no labeled validation data is available. No alternative threshold was evaluated for selection, and the deployed value was not changed.

## 10. URL Hard Negatives

**NOT ASSESSABLE as performance.** No labeled legitimate corpus exists for long authentication URLs, secure banking portals, government portals, complex redirects, or URLs containing `login`, `verify`, `secure`, `account`, `update`, `signin`, or `auth`.

Controlled static probes are not false-positive measurements. They showed that `https://example.com/account` scored `0.032693`, while `https://secure.example.com/account` scored `0.978782` and `https://example-login.com/account` scored `0.615977` (crossing `0.547`). These are synthetic observations and do not establish whether either transformed URL is legitimate in deployment.

## 11. URL Hard Positives

**NOT ASSESSABLE as performance.** No labeled phishing corpus exists for HTTPS phishing, compromised domains, short URLs, clean paths, normal-looking subdomains, or phishing without keywords. No suspicious URL was visited.

## 12. URL Robustness

The following offline synthetic transformations were scored by the frozen model. The tests measure sensitivity only; they do not provide ground truth.

| Test | Original Score | Modified Score | Difference | Concern |
|---|---:|---:|---:|---|
| Baseline `https://example.com/account` | 0.032693 | — | — | Reference only |
| Case change | 0.032693 | 0.032693 | 0.000000 | Good case stability |
| Trailing slash | 0.032693 | 0.018868 | -0.013825 | Small change |
| Query `?ref=123` | 0.032693 | 0.193725 | +0.161032 | Moderate score movement from benign-looking query addition |
| Fragment `#section` | 0.032693 | 0.022964 | -0.009729 | Small change |
| `secure.` subdomain | 0.032693 | 0.978782 | +0.946089 | Large movement; crosses threshold |
| Percent-encoded `a` | 0.032693 | 0.350099 | +0.317406 | Large movement without an operational site change |
| Digits in registrable host | 0.032693 | 0.031335 | -0.001358 | Stable in this case |
| Hyphenated host | 0.032693 | 0.615977 | +0.583284 | Large movement; crosses threshold |
| Added `/verify/login` path | 0.032693 | 0.092763 | +0.060070 | Moderate movement, did not cross threshold |
| Removed path | 0.032693 | 0.040708 | +0.008014 | Small movement |

**ROBUSTNESS OBSERVATION:** The model is stable to case but sensitive to host/subdomain/encoding/lexical-structure changes. Some changes are semantically meaningful, so this is not proof of a defect; it is evidence that hard-negative and controlled metamorphic evaluation is required before enforcement.

## 13. URL Feature Importance

The calibrated wrapper itself does not expose `feature_importances_`; the audit inspected the single underlying frozen RF estimator. The following are impurity importances, not causal explanations and not permutation importance.

| Rank | Feature | Importance |
|---:|---|---:|
| 1 | `host_length` | 0.115819 |
| 2 | `path_length` | 0.075409 |
| 3 | `digit_count` | 0.071019 |
| 4 | `digit_ratio` | 0.064324 |
| 5 | `slash_count` | 0.062161 |
| 6 | `path_depth` | 0.054250 |
| 7 | `url_entropy` | 0.051584 |
| 8 | `dot_count` | 0.043410 |
| 9 | `max_token_length` | 0.040840 |
| 10 | `is_https` | 0.034850 |
| 11 | `is_http` | 0.034731 |
| 12 | `registrable_domain_length` | 0.033098 |
| 13 | `special_ratio` | 0.024338 |
| 14 | `provider_domain_length` | 0.024152 |
| 15 | `host_hyphen_count` | 0.022160 |

The dominance of host/path/digit/separator/length features is consistent with a lexical URL model, but without data and permutation tests it is a **POTENTIAL SHORTCUT**, not a proven leakage finding.

## 14. NLP Architecture

- Base architecture: `XLMRobertaForSequenceClassification`; model type `xlm-roberta`.
- Checkpoint identity: `full_taglish_xlmr_512_headtail_seed13`.
- Local model: two Safetensors shards, 278,045,186 parameters, 556,090,372 bytes according to the index metadata.
- Configuration: 2 labels, class 0 `LEGITIMATE`, class 1 `PHISHING_SOCIAL_ENGINEERING`; hidden size 768; 12 layers; 12 attention heads; vocabulary size 250,002; `max_position_embeddings=514`.
- Tokenizer: local `tokenizer.json` and `tokenizer_config.json`; no runtime download.
- Maximum input: 512 tokens including special tokens.
- Preprocessing: `Subject: ` segment plus subject head/tail within a 96-token subject budget, then `Body: ` and body head/tail allocation; body cleaning disabled.
- Truncation: head/tail, subject tail fraction 0.25, body tail fraction 0.35.
- Calibration: temperature scaling with `T=2.2198894341340183`; class-1 probability is `softmax(logits / T)[1]`.
- Decision: suspicious when calibrated class-1 probability is at least `0.6923658179915227`.
- Production loading: local-only, `eval()` mode, CPU or available CUDA device, inference mode.

## 15. NLP Performance

**NLP METRIC REPRODUCTION NOT POSSIBLE.** No email, SMS, chat, social-media-style text corpus, split manifest, confusion matrix, or metric output is present. `calibration.json` references a historical metrics path and describes the evidence as retrospective, but that metrics file is absent from this checkout.

| Metric | Result |
|---|---:|
| Accuracy | N/A |
| Precision | N/A |
| Recall | N/A |
| F1 / macro F1 / weighted F1 | N/A |
| ROC-AUC / PR-AUC | N/A |
| Confusion matrix | N/A |
| Legitimate-notification FPR | N/A |
| Subtle social-engineering FNR | N/A |

Controlled offline probes are not a replacement for evaluation. With an empty subject, synthetic neutral messages scored between `0.008486` and `0.662411`; with notification-style wording and a synthetic subject, several messages scored above threshold. These observations warrant review but cannot estimate production rates.

## 16. NLP Confusion Matrix

Not available. There is no labeled evaluation corpus. No TP, TN, FP, or FN counts are reported.

## 17. NLP Calibration

The implementation correctly divides both logits by the frozen temperature before softmax and verifies the positive class and probability definition. The calibration metadata says fitting, acceptance, and threshold selection used group-disjoint validation subsets and that the test set was not used for those operations. However:

- the referenced calibration metrics JSON is absent;
- the underlying calibration and validation records are absent;
- ECE, Brier score, reliability bins, and confidence-vs-correctness cannot be recomputed;
- the metadata explicitly calls the evidence a retrospective test estimate and requires a new external test.

Therefore the mathematical calibration implementation is verified, but calibration quality is **NOT ASSESSABLE**. The value displayed by the API is a calibrated-model probability by contract, not a demonstrated 90%-correct operational guarantee.

## 18. NLP Threshold Analysis

The production threshold is `0.6923658179915227`, defined in `calibration.json`, enforced by `email_model.py`, returned by the API, and protected by boundary tests. Nearby threshold tradeoffs were not calculated because no labeled validation data is available. No threshold modification was performed.

The security/usability tradeoff is explicit: a lower threshold could increase recall while raising legitimate-message warnings; a higher threshold could reduce warnings while increasing missed subtle social engineering. The repository does not contain evidence to choose between those outcomes.

## 19. English / Tagalog / Taglish Performance

| Language | Samples | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| English | N/A | N/A | N/A | N/A |
| Tagalog | N/A | N/A | N/A | N/A |
| Taglish | N/A | N/A | N/A | N/A |
| Other Philippine language | N/A | N/A | N/A | N/A |
| Unknown | N/A | N/A | N/A | N/A |

No language-labeled corpus is present. Synthetic Taglish probes were run only for robustness and cannot establish language performance. **PHILIPPINE GENERALIZATION NOT YET ESTABLISHED.**

## 20. Social Engineering Coverage

No tactic-labeled corpus is available. Recall for urgency, fear, authority, impersonation, account suspension, OTP, financial request, prize, delivery, government/bank/e-wallet impersonation, job, investment, or charity scams is N/A. The deterministic indicator engine contains explicit rules for many of these categories, including English/Filipino patterns, but rule presence is not empirical coverage.

## 21. NLP Robustness

The runtime tests verify deterministic output, head/tail preservation, maximum length, and synthetic special-token behavior. The model itself was probed with capitalization, Taglish ordering, honorifics, abbreviations, misspellings, punctuation, emoji, and protective wording. All examples were synthetic.

Examples with subject `Synthetic notice` produced suspicious probabilities from `0.821354` to `0.995798`, including the protective text `Never share your OTP or password...`; this suggests possible lexical/context shortcut sensitivity. When the subject was empty, neutral messages were below threshold but some account/billing/security notification texts were close to the threshold (`0.551396`, `0.580280`, `0.662411`). This is a module-level robustness signal, not a population FPR.

The indicator engine separately guards against treating protective OTP advice as an OTP request, and the hybrid fusion generally prevents a lone local model warning from becoming red. Those controls reduce user-facing impact but do not make the NLP model itself robust.

## 22. Tokenization and Truncation

The code preserves the beginning and end of the subject and body according to the frozen fractions and caps encoded input at 512. Tests confirm that long synthetic content retains head/tail markers and that the analyzed token count does not exceed 512.

Dataset-level truncation counts are unavailable:

- Number truncated: N/A
- Percentage truncated: N/A
- Indicator position beyond the truncation boundary: N/A

Long-message risk remains real: indicators in the middle can be lost, while the head/tail scheme mitigates beginning-only truncation. The selection and safety of the fractions cannot be validated without the original corpus and a labeled long-message evaluation set.

## 23. Philippine Context Performance

No `.ph`, Philippine brand, bank, e-wallet, telco, government, school, delivery, job-scam, or local-payment evaluation subset is present. English/Tagalog/Taglish suitability for Philippine users is therefore **NOT ASSESSABLE** and **PHILIPPINE GENERALIZATION NOT YET ESTABLISHED**.

The indicator engine and cloud prompts include Philippine-context terms such as GCash, Maya, local banks, government organizations, OTP/MPIN, and Taglish examples. This demonstrates intended coverage in code, not validated model performance.

## 24. Bias / Shortcut Risks

No unfairness or causal bias claim is made. Evidence supports only the following potential risks:

- URL impurity importance is concentrated in host/path/length/digit/separator features; this can reflect lexical shortcuts or dataset construction.
- URL TLD, HTTPS, IP, subdomain, and brand-like tokens may correlate with labels in ways that are not stable across Philippine legitimate sites.
- NLP model responses changed materially with a synthetic subject and included protective/notification wording; this suggests possible brand, phrase, or message-style shortcut risk.
- Language, country, brand, source, temporal, and message-channel correlations cannot be tested because metadata and records are absent.

These are **POTENTIAL SHORTCUT** findings only. A domain-grouped, template-grouped, time-aware, language-stratified external evaluation is required.

## 25. Reproducibility

**Assessment: PARTIALLY REPRODUCIBLE for inference; NOT REPRODUCIBLE for training/evaluation from this checkout.**

Available:

- frozen artifacts and hashes/contracts;
- RF selected configuration metadata (`depth24_leaf2_sqrt`, max depth 24, leaf size 2, sqrt features, seed 42);
- URL feature and validation hashes;
- XLM-R model/config/tokenizer/calibration files;
- runtime preprocessing and verification code;
- pinned/locked runtime dependency files.

Unavailable:

- authoritative training corpora and labels;
- split manifests and locked evaluation data;
- complete training scripts/checkpoints/hyperparameter history for the active releases;
- provenance, licensing, collection dates, and transformation history;
- calibration metrics artifact referenced by `calibration.json`;
- external Philippine/Taglish test set.

A serialized model plus an inference script is not sufficient evidence of full reproducibility.

## 26. Overfitting Review

Training curves, train/validation/test metrics, fold metrics, OOB score, learning curves, and epoch history are absent. RF hyperparameters are visible in the bundle, but overfitting cannot be assessed without results. Transformer training loss/F1 and validation loss/F1 are absent. No retraining or re-estimation was performed.

## 27. Dataset Leakage Dependency

The existing `BANTAI_DATASET_AUDIT.md` reports that no ML-ready URL/text corpus, train/validation/test split, external evaluation set, provenance manifest, or language/Philippine metadata is present. It explicitly states that exact URL/text, canonical, registered-domain, near-duplicate, campaign, source, and template leakage are not testable.

Accordingly, model evaluation validity remains conditional. The RF bundle's `locked_test_accessed: false` and the absence of the referenced datasets prevent an independent leakage audit. No zero-overlap claim is made.

## 28. Fusion Logic

### Email Rules A-H as implemented

- With cloud review unavailable/off, a local clean email with no strong indicators returns `NO_STRONG_WARNING_SIGNS` under Rule H; a suspicious model plus strong indicators returns `SUSPICIOUS_SIGNS_FOUND`; other local ambiguity returns `NEEDS_CAUTION`.
- With a validated cloud assessment, at least two suspicious sources among XLM-R, local indicators, and LLM review are required for red (Rule F).
- All available evidence clean returns green (Rule A).
- Disagreement, a lone warning, or incomplete evidence returns caution (Rules B-E/G).
- An LLM warning alone cannot produce red.
- A SAFE webmail/address-bar result cannot suppress suspicious email evidence because website state is absent from the email fusion signature.

### URL fusion

- Local URL SAFE remains `NO_STRONG_WARNING_SIGNS` with non-guarantee wording.
- Local URL SUSPICIOUS plus high-confidence clean cloud hostname review can clear to green under a narrow condition.
- Local warning plus medium/low-confidence clean or caution review remains caution.
- Local warning plus corroborating suspicious review remains red.
- URL cloud receives minimized origin/hostname only and no page content; no navigation or resolution is performed.
- URL module unavailable is not converted to SAFE; the email path preserves independent local email evidence.

The logic and associated tests are consistent with the intended deterministic design. The main residual risk is communication: consumers must keep `UNAVAILABLE`, `CHECKING`, and `NEEDS_CAUTION` distinct from a completed green result.

## 29. Score Semantics

- URL `phishing_probability` is the class-1 probability returned by the frozen sigmoid-calibrated classifier. It is not a global system risk score.
- Email `suspicious_probability` is the class-1 probability after frozen temperature scaling. Calibration quality is not independently demonstrated here.
- Heuristic counts are evidence counts, not probabilities or risk scores.
- LLM confidence and assessment are schema-constrained contextual evidence, not calibrated probability.
- Fusion returns categorical outcomes and explicitly reports `overall_numeric_risk_score: false`.
- User-facing language consistently says no strong warning signs are not a guarantee, and no “definitely safe,” “definitely phishing,” or “guaranteed safe” claims were found in the audited detector/fusion paths.

No material score-semantics defect was observed. Any UI or downstream analytics that renders a raw probability as a guaranteed likelihood would be a **RISK COMMUNICATION ISSUE** and should be checked separately in a live product review.

## 30. Failure Handling

Verified behavior includes:

- missing or invalid model artifacts fail verification/startup;
- RF hash mismatch is rejected before Joblib loading;
- missing email artifacts/config/calibration fail contract validation;
- missing loaded models return service-unavailable errors rather than a model SAFE result;
- invalid/rejected URLs return HTTP 400;
- empty subject and body are rejected as unanalyzable;
- oversized fields/body are bounded and tested;
- malformed cloud output and provider exceptions become `UNAVAILABLE` without fabricated assessments;
- cloud unavailable does not erase local evidence;
- automatic popups wait for complete cloud results and do not reopen on focus or duplicate extraction.

The direct email fusion of a completed local SAFE result with cloud unavailable can return `NO_STRONG_WARNING_SIGNS` under Rule H. This is semantically “no strong local warning was detected,” not “the cloud confirmed safety,” and the production popup gating is tested. Downstream consumers must not flatten the outcome and cloud status into a generic SAFE flag.

## 31. Performance and Resource Usage

A local Windows CPU benchmark was run with synthetic inputs and the frozen artifacts, excluding network and server overhead. It is descriptive only; sample sizes were five URL warm calls and three email warm calls.

| Measurement | Observed |
|---|---:|
| URL model cold load | 5.46 s |
| URL warm inference, 2 URLs, median | 39.80 ms |
| URL warm inference, 2 URLs, small-sample P95 | 40.90 ms |
| XLM-R cold load | 5.62 s |
| XLM-R warm inference, 1 synthetic email, median | 39.83 ms |
| XLM-R warm inference, small-sample P95 | 39.83 ms |
| Combined process working set after both models | 2.71 GiB |
| Combined process peak working set | 3.23 GiB |
| Combined process private bytes | 3.57 GiB |

The benchmark process used CPU. Cold-start latency and multi-gigabyte memory use are material capacity concerns for a single-worker deployment, especially with concurrent requests. No destructive load test or production capacity claim was made. A controlled concurrency and container-capacity test is required before public scale decisions.

## 32. Security and Supply Chain

Positive controls: local-only transformer loading, explicit Docker artifact copies, RF pre-load hash validation, email artifact size/hash checks, no runtime model downloads, backend-only cloud credentials, redaction before provider calls, no raw body logging, bounded in-memory TTL caches, strict cloud schema, and prompt-injection tests.

Residual risks:

- email weight/tokenizer/index integrity relies on a mutable local manifest that is not itself signed or externally hash-pinned;
- Joblib remains a code-executing serialization format if the pre-load hash trust boundary is bypassed;
- dependency/runtime supply-chain evidence is separate from model validity and does not prove release-image provenance;
- redaction is best effort and is not a formal privacy guarantee;
- cloud provider quality, availability, and model drift are not an ML validation substitute.

## 33. Testing Gaps

Existing automated coverage is strong for contracts and integration. The full test suite completed with **144 tests, OK**. `verify_models.py` and `verify_project.py` passed; required Python compilation and Node syntax checks passed. No Chrome/Edge interactive test was performed, so Chromium behavior is not claimed.

Important missing tests/evidence:

- locked external URL and message evaluation with TP/TN/FP/FN;
- domain/template/campaign duplicate and leakage checks against authoritative data;
- URL hard-negative and hard-positive suites with labels;
- nearby-threshold analysis;
- ECE/Brier/reliability analysis;
- English/Tagalog/Taglish/other-language stratification;
- tactic/channel/brand/Philippine-context analysis;
- labeled adversarial/metamorphic robustness;
- measured truncation rate and indicator-position analysis;
- formal email artifact release signature/manifest anchoring;
- controlled concurrency, memory-growth, and repeated-inference leak tests;
- independent container cold-start and capacity tests;
- live but sanitized Chrome/Edge integration validation.

## 34. Findings Summary

| ID | Severity | Component | Finding | Impact | Confidence |
|---|---|---|---|---|---|
| DATA-001 | CRITICAL | URL/NLP | No auditable ML corpus or locked evaluation set is available | Model validity, leakage, and generalization cannot be established | High |
| URL-001 | HIGH | URL-ML | URL performance and threshold tradeoffs cannot be reproduced | FP/FN behavior and enforcement suitability are unknown | High |
| URL-002 | MEDIUM | URL-ML | Synthetic host/encoding/hyphen transformations cause large score shifts | Potential lexical shortcut/metamorphic robustness risk | Medium |
| NLP-001 | HIGH | NLP-XLMR | Synthetic benign notification/protective wording can produce near-threshold or suspicious scores | Potential legitimate-message warning burden; no measured FPR | Medium |
| NLP-002 | HIGH | NLP-XLMR | Philippine, Tagalog, Taglish, channel, and tactic performance is unverified | Intended-market suitability is unsubstantiated | High |
| CAL-001 | HIGH | NLP-XLMR | Calibration implementation is frozen and verified, but its metrics/evaluation artifact is absent | Confidence semantics and calibration quality are unverified | High |
| THRESH-001 | MEDIUM | URL/NLP | Threshold identities are protected, but operating-point tradeoffs cannot be evaluated | Cannot justify current FP/FN balance from available evidence | High |
| FUSION-001 | MEDIUM | HYBRID | Logic preserves local evidence, but downstream consumers must not flatten unavailable cloud state into green | Communication and operational-state confusion risk | Medium |
| ROBUST-001 | MEDIUM | URL/NLP | No labeled hard-negative, hard-positive, adversarial, or long-message corpus exists | Evasion resistance and stability remain unknown | High |
| PERF-001 | MEDIUM | Runtime | Combined local process uses approximately 2.71 GiB working set and has multi-second cold load | Capacity/concurrency risk for interactive deployment | Medium |
| MODELSEC-001 | HIGH | Artifact supply chain | Email manifest is not independently anchored; selected weight/tokenizer bytes could be replaced with the manifest | Silent model substitution risk in a compromised build/release path | High |
| REPRO-001 | HIGH | Training/evaluation | Training data, split manifests, provenance, and complete training history are absent | Retraining and historical claims cannot be reproduced or audited | High |

## 35. Detailed Findings

### [DATA-001] ML evaluation evidence absent

Severity: CRITICAL
Confidence: High
Model: URL-ML and NLP-XLMR
Affected Component: Training/evaluation evidence

Description: No ML-ready URL, email, SMS, social-engineering, train, validation, test, holdout, external, or Philippine evaluation corpus is present. The only populated CSV is a 14-row manual QA checklist.

Evidence: `BANTAI_DATASET_AUDIT.md`, `dataset_leakage_summary.csv`, absence of `outputs/`, and repository discovery.

Observed Impact: TP/TN/FP/FN, accuracy, recall, precision, F1, AUC, calibration, leakage, and language/category results cannot be independently calculated.

Security/ML Impact: Historical metrics, if they exist outside the checkout, cannot be treated as auditable evidence.

Production Impact: Public-deployment suitability is not demonstrated.

Recommended Action: Obtain immutable, access-controlled, privacy-approved corpora and split manifests; create a separately locked external evaluation set before model remediation or release approval.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: Unknown
Deployment Blocking: Yes

### [URL-001] URL performance and operating point are not assessable

Severity: HIGH
Confidence: High
Model: URL-ML
Affected Component: Evaluation and threshold justification

Description: The frozen URL threshold and model contract are internally consistent, but no labeled URL evaluation data is available to reproduce performance or threshold tradeoffs.

Evidence: `MODEL_MANIFEST.json`, `bantai_inference.py`, tests, and absent evaluation artifacts.

Observed Impact: FP/FN counts, hard-negative behavior, hard-positive recall, category metrics, and nearby-threshold curves are N/A.

Security/ML Impact: A shadow model can be contract-correct while still being poorly calibrated or poorly generalized.

Production Impact: Moving from shadow to enforcement would be unsupported by current evidence.

Recommended Action: Supply a locked domain-grouped and temporally newer evaluation set with Philippine legitimate and phishing subsets; report confusion matrices and threshold curves.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: Unknown
Deployment Blocking: Yes

### [URL-002] Lexical/metamorphic sensitivity requires hard-negative review

Severity: MEDIUM
Confidence: Medium
Model: URL-ML
Affected Component: Robustness

Description: Synthetic variants of one harmless-looking URL produced large probability shifts, including `secure.` subdomain, percent encoding, and hyphenation.

Evidence: Section 12 offline results; no live navigation occurred.

Observed Impact: Score shifts of +0.946, +0.317, and +0.583 were observed for the tested transformations; two crossed the frozen threshold.

Security/ML Impact: The model may be sensitive to lexical structure in ways that create hard-negative false positives or evasion opportunities.

Production Impact: User warnings may vary for closely related addresses; enforcement could amplify this effect.

Recommended Action: Build a labeled metamorphic suite with legitimate authentication/subdomain/encoding cases and phishing counterparts; inspect grouped performance before any threshold decision.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: No
Deployment Blocking: Yes for enforcement; No for shadow-only operation

### [NLP-001] Synthetic legitimate-text false-positive signal

Severity: HIGH
Confidence: Medium
Model: NLP-XLMR
Affected Component: Legitimate-message robustness

Description: Several hand-authored benign notification/protective examples produced high or near-threshold probabilities. This is not a measured FPR, but it is direct evidence that the module needs real hard-negative evaluation.

Evidence: With subject `Synthetic notice`, notification/protective examples scored approximately `0.975`–`0.994`; with an empty subject, billing/verification/security-awareness examples scored `0.551`–`0.662` below a threshold of `0.6923658`.

Observed Impact: A lone local model warning could create caution outcomes for legitimate notifications; exact impact depends on the indicator and cloud results.

Security/ML Impact: If representative, this could reduce user trust and obscure higher-value warnings.

Production Impact: Do not interpret the synthetic results as an FPR, but require a human-written legitimate-notification set before public deployment.

Recommended Action: Evaluate benign billing, delivery, account, security-awareness, marketing, and routine service messages with matched suspicious messages; calculate class-specific metrics and inspect subject-only effects.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: Unknown
Deployment Blocking: Yes for public ML approval

### [NLP-002] Philippine and Taglish generalization unverified

Severity: HIGH
Confidence: High
Model: NLP-XLMR
Affected Component: Language and market coverage

Description: The model name and prompts indicate Taglish intent, but no auditable language-labeled or Philippine-context corpus is present.

Evidence: `BANTAI_DATASET_AUDIT.md` reports no text corpus or Philippine subset; no language metrics exist.

Observed Impact: English, Tagalog, Taglish, other Philippine-language, channel, tactic, and brand performance are N/A.

Security/ML Impact: Language, brand, source, or market shortcuts cannot be ruled out.

Production Impact: Suitability for Philippine users is not established.

Recommended Action: Evaluate balanced, privacy-approved human-written English/Tagalog/Taglish and local-context sets, grouped by template/campaign and separated by channel.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: Unknown
Deployment Blocking: Yes

### [CAL-001] Calibration quality cannot be independently verified

Severity: HIGH
Confidence: High
Model: NLP-XLMR
Affected Component: Probability semantics

Description: The code implements and enforces the frozen temperature contract, but the calibration metrics artifact and its records are absent.

Evidence: `calibration.json` references `outputs/phase6_calibration_metrics.json`, which is not present, and declares retrospective evidence requiring a new external test.

Observed Impact: ECE, Brier score, reliability bins, and confidence-vs-correctness are N/A.

Security/ML Impact: A displayed probability cannot be assumed to be empirically calibrated on current users or channels.

Production Impact: Probability-based reporting and threshold interpretation remain conditional.

Recommended Action: Re-run a read-only calibration audit on the frozen model using an independent locked set; report ECE/Brier and confidence bins without changing `T` or the threshold in this phase.

Requires Retraining: No for the audit; Unknown for remediation
Requires Dataset Change: Yes
Requires Threshold Change: No in this audit
Deployment Blocking: Yes for probability claims

### [THRESH-001] Threshold tradeoffs are unmeasured

Severity: MEDIUM
Confidence: High
Model: URL-ML and NLP-XLMR
Affected Component: Operating point

Description: Both production thresholds match their frozen contracts and tests, but no available labeled data supports precision/recall/FPR/FNR tradeoff analysis.

Evidence: URL `0.547` and email `0.6923658179915227` are verified; nearby threshold evaluation is impossible without labeled validation data.

Observed Impact: The current balance between user friction and missed attacks is unknown.

Security/ML Impact: A correct configuration can still be an unsuitable operating point for a new population.

Production Impact: No threshold change is recommended or authorized by this audit.

Recommended Action: Run an analysis-only threshold sweep on a locked validation set after evidence access is granted; retain the frozen value until a separately approved remediation decision.

Requires Retraining: No
Requires Dataset Change: Yes
Requires Threshold Change: Unknown
Deployment Blocking: Yes for enforcement approval

### [FUSION-001] Unavailable-state communication must remain explicit

Severity: MEDIUM
Confidence: Medium
Model: HYBRID
Affected Component: Fusion/consumer contract

Description: Fusion preserves local evidence and avoids unsafe suppression, but a completed local clean result plus unavailable cloud can still return the categorical green outcome `NO_STRONG_WARNING_SIGNS`. This is intentional Rule H behavior, not proof of cloud safety.

Evidence: `fusion_engine.py` Rule H and partial-failure tests; popup tests require completed cloud state before automatic display.

Observed Impact: A downstream client that discards `llm_review.status` could misrepresent incomplete evidence as fully cleared.

Security/ML Impact: State flattening could violate the principle that unavailable is not automatically safe.

Production Impact: API consumers and UI must preserve layer status and non-guarantee language.

Recommended Action: Keep contract tests for `UNAVAILABLE`, `CHECKING`, and green local outcomes; add an end-to-end assertion that incomplete cloud state is visibly distinct from a completed green review.

Requires Retraining: No
Requires Dataset Change: No
Requires Threshold Change: No
Deployment Blocking: No for current tested integration; yes if consumer state is flattened

### [ROBUST-001] Robustness and evasion coverage is absent

Severity: MEDIUM
Confidence: High
Model: URL-ML and NLP-XLMR
Affected Component: Adversarial/metamorphic evaluation

Description: The repository has contract tests and a few synthetic probes, but no labeled robustness set for hard negatives, hard positives, long messages, Unicode/homoglyphs, abbreviations, emoji, URL masking, or channel shift.

Evidence: No evaluation corpus or supporting analysis files; Section 12 and Section 21 synthetic observations.

Observed Impact: Evasion resistance and false-positive stability are unknown.

Security/ML Impact: Attackers can exploit transformation sensitivity or indicators beyond truncation boundaries.

Production Impact: Treat model warnings as decision support; do not enable blocking based on current evidence.

Recommended Action: Add a controlled, non-operational robustness suite with labels and metamorphic expectations.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: No in this audit
Deployment Blocking: Yes for blocking/enforcement

### [PERF-001] Combined local resource footprint needs capacity validation

Severity: MEDIUM
Confidence: Medium
Model: URL-ML and NLP-XLMR
Affected Component: Runtime capacity

Description: A local CPU process holding both models used approximately 2.71 GiB working set and peaked around 3.23 GiB, with roughly 5.5-second cold loading for each model.

Evidence: Controlled local benchmark in Section 31; no production load test.

Observed Impact: Memory and cold-start cost may constrain worker count and concurrency.

Security/ML Impact: Resource pressure can create timeouts or availability failures around security decisions.

Production Impact: Interactive latency was acceptable warm in this small test, but capacity is not established.

Recommended Action: Run bounded container concurrency and memory-growth tests on the target hardware/runtime; retain fail-closed unavailable behavior.

Requires Retraining: No
Requires Dataset Change: No
Requires Threshold Change: No
Deployment Blocking: Yes for scale approval; No for local audit completion

### [MODELSEC-001] Email artifact manifest is not independently anchored

Severity: HIGH
Confidence: High
Model: NLP-XLMR
Affected Component: Model supply chain

Description: The email manifest validates hashes and sizes, but the manifest itself is not signed or checked against an immutable expected hash. A compromised release path could replace the manifest together with the weight/tokenizer/index artifacts.

Evidence: `email_model.py` validates values read from `EMAIL_MODEL_MANIFEST.json`; only the config hash and calibration constants are additionally hard-coded.

Observed Impact: Selected model bytes could be silently substituted within a compromised build/release boundary.

Security/ML Impact: Model integrity is weaker than the RF's hard-coded artifact hash.

Production Impact: A deployment may pass local manifest verification while serving altered transformer behavior.

Recommended Action: Sign the complete release manifest or pin its hash in the verifier/build provenance; verify the image digest and artifact provenance in CI/CD.

Requires Retraining: No
Requires Dataset Change: No
Requires Threshold Change: No
Deployment Blocking: Yes until release-path trust is addressed

### [REPRO-001] Training and historical evaluation are not reproducible from checkout

Severity: HIGH
Confidence: High
Model: URL-ML and NLP-XLMR
Affected Component: Reproducibility/provenance

Description: Inference artifacts and contracts are available, but the corpora, labels, split manifests, source/licensing metadata, complete training history, and calibration metrics are not.

Evidence: `BANTAI_DATASET_AUDIT.md`, absent `outputs/`, RF bundle `locked_test_accessed: false`, and absent authoritative training pipeline files.

Observed Impact: Historical metrics and leakage claims cannot be recreated.

Security/ML Impact: Dataset/source/template leakage and representativeness remain unverified.

Production Impact: A model artifact alone cannot support a public ML readiness claim.

Recommended Action: Preserve versioned, hash-recorded data manifests and locked evaluation artifacts; document training environment, seeds, preprocessing, and metrics.

Requires Retraining: Unknown
Requires Dataset Change: Yes
Requires Threshold Change: No
Deployment Blocking: Yes

## 36. Deployment Blockers

Model-related blockers only:

1. No auditable ML corpus or locked evaluation set; URL/NLP performance and leakage are not assessable.
2. Philippine, Tagalog, Taglish, channel, tactic, and hard-negative/hard-positive generalization are not established.
3. Calibration quality cannot be independently reproduced from the absent metrics/evaluation artifacts.
4. Email weight/tokenizer/index release integrity is not anchored beyond a mutable manifest.
5. Synthetic tests show enough score sensitivity and possible legitimate-text warnings to require labeled review before enforcement or public ML approval.
6. Combined local memory/cold-start capacity has not been validated under bounded concurrency on the target deployment environment.

The URL model should remain shadow/non-blocking until these blockers are addressed. No model was deployed or changed by this audit.

## 37. Recommended Remediation Order

### Priority 0 — Invalidates Model or Safety

1. Obtain immutable, privacy-approved corpora, split manifests, provenance, and the referenced calibration metrics artifact.
2. Reproduce URL and NLP confusion matrices, class-specific metrics, leakage checks, and calibration metrics on locked data without changing frozen artifacts.
3. Resolve the email release-integrity gap with a signed or hard-pinned complete artifact manifest.
4. Verify that all production consumers preserve `UNAVAILABLE`/`CHECKING` state and never treat inference failure as SAFE.

### Priority 1 — Required Before Public Deployment

1. Evaluate legitimate Philippine URLs/messages and phishing/social-engineering examples, including Tagalog/Taglish and local services.
2. Evaluate current thresholds and hard-negative/hard-positive operating points without selecting a new threshold automatically.
3. Run bounded concurrency, memory, cold-start, and target-environment tests.
4. Validate the complete remote detector/API/extension flow in sanitized Chrome/Edge tests.

### Priority 2 — Robustness and Generalization

1. Add labeled URL metamorphic and evasion tests.
2. Add long-message/truncation-position tests and language/channel/tactic/brand slices.
3. Group duplicate URL domains and message templates/campaigns; hold out newer and external samples.
4. Investigate the synthetic NLP false-positive signal and URL feature sensitivity.

### Priority 3 — Monitoring and Maintenance

1. Version models, data manifests, calibration artifacts, and release signatures.
2. Monitor false-positive reports, false-negative reports, score distributions, class distribution, language/channel distribution, and cloud-unavailable rates.
3. Establish periodic independent evaluation and drift review. Do not enable online retraining automatically.

## 38. Model Readiness Checklist

### URL MODEL

- [x] Artifact integrity verified
- [x] Feature order verified
- [x] Runtime feature schema matched to artifact
- [x] Label mapping verified
- [x] Threshold verified
- [ ] Metrics independently reproduced
- [ ] False-positive behavior reviewed on labeled data
- [ ] False-negative behavior reviewed on labeled data
- [ ] Hard negatives tested with labels
- [ ] Hard positives tested with labels
- [ ] Philippine subset tested
- [ ] Leakage ruled out or documented from authoritative data
- [ ] Robustness tested with labeled transformations

### NLP MODEL

- [x] Artifact manifest, config, and local loading verified
- [x] Tokenizer files verified
- [x] Runtime preprocessing contract verified
- [x] Label mapping verified
- [x] Calibration implementation and constants verified
- [x] Threshold verified
- [ ] Metrics independently reproduced
- [ ] English evaluated on locked data
- [ ] Tagalog evaluated on locked data
- [ ] Taglish evaluated on locked data
- [ ] Social-engineering categories reviewed on labeled data
- [ ] Truncation rate and indicator position reviewed
- [ ] Robustness tested on labeled examples
- [ ] Leakage ruled out or documented from authoritative data

### HYBRID SYSTEM

- [x] Fusion rules reviewed
- [x] Detector failure is not converted to a model SAFE signal
- [x] Conflicting detector results tested
- [x] Score semantics documented as probability/evidence/category
- [x] Cloud unavailability handling tested
- [x] Automatic warning gating waits for complete assessment
- [ ] Target-environment UI/consumer state handling verified in Chrome/Edge
- [ ] User warning behavior validated against an independent labeled set

## 39. Final Assessment

**URL Model:** NOT ASSESSABLE
**NLP Model:** NOT ASSESSABLE
**Fusion:** READY WITH CONDITIONS
**Overall ML/NLP Risk:** NOT ASSESSABLE, with critical evidence blocker and high pre-deployment risk.

### Top 5 Issues

1. No auditable ML corpora, locked evaluation sets, or reproducible historical metrics.
2. Philippine/Tagalog/Taglish generalization and leakage validity are unverified.
3. Calibration quality and threshold tradeoffs cannot be independently reproduced.
4. Synthetic robustness probes show strong URL score sensitivity and possible NLP legitimate-text false positives.
5. Email weight/tokenizer integrity depends on a mutable, non-anchored manifest.

### Most Important Recommendation

Obtain and lock privacy-approved training/evaluation evidence, independently reproduce frozen-model metrics/calibration/leakage checks, and keep the URL detector in shadow mode until the evidence and release-integrity blockers are resolved.

## 40. Supporting Analysis Files and Limitations

The requested analysis CSVs were not generated because no labeled evaluation data is available. Creating placeholder metric files would falsely imply that evaluation occurred. No replacement training data, cleaned dataset, split, or model artifact was created.

Unavailable evidence explicitly recorded:

- DATASET NOT AVAILABLE
- LOCKED TEST SET NOT AVAILABLE
- EXTERNAL TEST SET NOT AVAILABLE
- TRAINING HISTORY NOT AVAILABLE
- TRAINING METRICS NOT AVAILABLE
- URL CONFUSION MATRIX NOT AVAILABLE
- NLP CONFUSION MATRIX NOT AVAILABLE
- TAGLISH LABELS NOT AVAILABLE
- PHILIPPINE SUBSET NOT AVAILABLE
- CALIBRATION METRICS ARTIFACT NOT AVAILABLE
- LIVE CHROME/EDGE VALIDATION NOT PERFORMED
- PRODUCTION CONCURRENCY/CAPACITY NOT VALIDATED

The audit relied on repository code, manifests, model metadata, existing tests, static analysis, and local synthetic inference only. Synthetic results are robustness observations and must not be presented as accuracy, FPR, FNR, or language-performance claims.

## Audit Verification Record

- `python scripts\\verify_models.py`: PASS
- `python scripts\\verify_project.py`: PASS
- `python -m unittest discover -s tests -v`: PASS, 144 tests
- Required Python `py_compile`: PASS
- Required Node `--check` commands: PASS
- No model retraining, threshold modification, calibration modification, fusion-weight modification, preprocessing replacement, dataset regeneration, deployment, live URL request, or real external LLM request performed.

BANTAI ML & NLP MODEL AUDIT COMPLETE

Report generated: `BANTAI_ML_NLP_MODEL_AUDIT.md`

URL Model: NOT ASSESSABLE
NLP Model: NOT ASSESSABLE
Hybrid/Fusion: READY WITH CONDITIONS

Critical findings: 1
High findings: 6
Medium findings: 5
Low findings: 0
Informational findings: 0

Overall ML/NLP risk: NOT ASSESSABLE

Recommended next action: DATASET ACCESS REQUIRED / REMEDIATION

No model retraining or threshold modification has been performed.
