# BantAI Dataset Audit

**Audit date:** 2026-09-15  
**Audit scope:** The working tree at `D:\COOOODE\Capstone\BantAI`, excluding dependency/vendor trees (`.venv`, `node_modules`, and template dependencies). This was a static, non-mutating audit: no URLs were visited, no records were changed, no model was loaded or trained, and no cleaned dataset was created.

## 1. Executive Summary

**Overall dataset quality:** Cannot be established from this checkout. No ML-ready URL, email, SMS, social-engineering, training, validation, or test corpus is present.

**Suitability for training:** **NOT SUITABLE FOR TRAINING** from the material available in this checkout.  
**Suitability for production-quality evaluation:** Not demonstrable. There are no locked test, external-validation, or split-manifest artifacts to audit.

| Severity | Findings |
|---|---:|
| Critical | 1 |
| High | 3 |
| Medium | 0 |
| Low | 0 |
| Informational | 2 |

The only populated tabular artifact found is a 14-row manual browser-validation checklist. It is not an ML dataset: it has no URL/text feature, label, source, date, or split fields. The only database-format artifact is an empty local runtime cache. Frozen model files and tokenizer/configuration files are model artifacts, not evidence of the corpora from which they were trained.

**Major risks:** no auditable input corpus; no train/validation/test split artifacts; no provenance, license, collection-date, or source manifests; no way to evaluate Philippine or Taglish coverage; and no way to perform leakage, label, PII, feature, or representativeness checks.

## 2. Dataset Inventory

| Dataset or artifact | Purpose | Rows | Columns | Format | Source | Status |
|---|---|---:|---:|---|---|---|
| `DUAL_DETECTOR_VALIDATION_TRACKER.csv` | Manual browser/extension validation checklist | 14 | 6 | CSV | Project-authored; no external provenance needed | Tabular QA checklist; **not** an ML dataset |
| `web/.wrangler/state/v3/cache/miniflare-CacheObject/metadata.sqlite` | Local Miniflare/Wrangler runtime alarm metadata | 0 | 2 | SQLite | Local development runtime cache | Empty runtime cache; **not** an ML dataset |
| URL/email/SMS/social-engineering corpora | Model development/evaluation | Not present | Not present | Not present | UNKNOWN SOURCE | Absent from audit scope |
| Train/validation/test/holdout/external evaluation sets | Leakage and performance evaluation | Not present | Not present | Not present | UNKNOWN SOURCE | Absent from audit scope |

The tracker is 1,134 bytes and has these string columns: `Test ID`, `Area`, `Provider or Browser Case`, `Expected Result`, `Actual Result`, `Pass or Fail`, and `Notes`. The 4,096-byte SQLite runtime cache contains a single `_cf_ALARM(actor_id, scheduled_time)` table with zero rows.

## 3. Dataset Architecture

The repository contains frozen inference artifacts for the URL RF and email XLM-R models, a local empty Miniflare runtime cache, and code that can accept an externally supplied URL CSV. It does not contain the raw/processed corpus, a generated candidate dataset, feature matrices, an assigned split, or an evaluation set. `backend/prepare_bantai_dataset.py` is a preparation workflow, not evidence that its required primary input or its output existed in this checkout.

The validation tracker is a manual acceptance checklist and must not be treated as model training data.

## 4. Class Distribution

No ML label column or class-bearing dataset was found. Therefore phishing/legitimate, spam/scam, language, and attack-type distributions are **not testable**. The checklist has 14 unique test IDs and no target labels.

## 5. Duplicate Analysis

The checklist has 14 distinct complete rows and 14 distinct `Test ID` values; no exact duplicate checklist records were found. URL and text exact, normalized, domain, campaign, and cross-label duplicate analysis is **not testable** because no URL or text corpus exists.

## 6. Train/Test Leakage

No train, validation, test, holdout, external-validation, or Philippine evaluation artifact was located. Exact URL/text overlap, normalized overlap, domain/registered-domain overlap, near-duplicate overlap, and campaign overlap are all **not testable**. Zero overlap is not claimed.

## 7. Label Quality

No ML labels were available for inspection. No conclusion can be made about label vocabulary, class mapping, null labels, contradictory labels, or label conflicts. The URL model manifest documents its runtime mapping as `0 = legitimate` and `1 = phishing`; that is a deployment contract, not a label audit of source records.

## 8. URL Quality Findings

No URL-record dataset was present. Malformed URLs, protocol distribution, raw IP hosts, private addresses, domain concentration, TLD distribution, URL length, hard negatives, hard positives, and static URL quality are **not testable**. No URL requests were made.

## 9. Philippine Dataset Representation

No `.ph`, Philippine-brand, government, educational, banking, e-wallet, telco, marketplace, delivery, or other Philippine-related samples were available. Philippine phishing and legitimate counts are unknown. Adequacy of Philippine representation cannot be established.

## 10. NLP and Taglish Dataset Analysis

No email, SMS, or social-engineering text dataset was found. English, Tagalog, Taglish, other Philippine-language, text-length, template-duplicate, social-engineering-category, entity/brand, and language-label correlation analyses are **not testable**.

## 11. Data Source Bias

Source metadata is absent along with the data. The audit cannot determine whether labels are confounded with sources such as PhishTank or Tranco, nor whether source-specific fields are available to training. **SOURCE BIAS / SOURCE LEAKAGE remains unassessed, not disproved.**

## 12. Temporal Analysis

No collection timestamps or source dates were found for ML records. Temporal drift, age imbalance, and evaluation-on-newer-data cannot be assessed.

## 13. Dataset Bias and Representativeness

Geographic, language, domain, TLD, brand, platform, source, and temporal representativeness cannot be assessed without records and metadata. In particular, the repository cannot show that legitimate Philippine domains or legitimate URLs containing terms such as `login`, `verify`, `account`, `secure`, or `update` were included.

## 14. Hard Negative Coverage

Not testable. No legitimate URL corpus is available to count legitimate long URLs, secure portals, authentication flows, redirect URLs, query-heavy URLs, or suspicious-looking legitimate URLs.

## 15. Hard Positive Coverage

Not testable. No phishing corpus is available to count normal-looking phishing URLs, compromised-domain URLs, short URLs, or HTTPS phishing URLs.

## 16. Privacy Review

No raw email, SMS, or text records were found, so a dataset PII scan could not be performed. The repository’s `backend/validation/README.txt` directs researchers to store only privacy-reviewed validation files and states that routine email bodies are not automatically written there; this is a useful control but does not replace a corpus-level PII review. No personal data is reproduced in this report.

## 17. Dataset Provenance

No corpus-level source, collection date, license, author, download location, merge history, transformation log, checksum, or metadata file was present. Model manifests identify frozen deployed artifacts, but do not document training data provenance. All corpus sources must be recorded as **UNKNOWN SOURCE** until authoritative evidence is supplied.

## 18. Reproducibility

**Assessment: NOT REPRODUCIBLE from this checkout.**

`backend/prepare_bantai_dataset.py` contains useful deterministic-oriented safeguards (hashing, row IDs, conservative URL validation, conflict logging, and split-overlap checks) but requires a separately supplied primary CSV and may write candidate/cleaning outputs when invoked. That workflow was not run because this audit must not create replacement datasets. The raw inputs, provenance mappings, locked evaluation artifacts, and complete generation history needed to reconstruct the model-development corpus are unavailable.

## 19. Findings Summary

| ID | Severity | Dataset | Finding | Impact | Confidence |
|---|---|---|---|---|---|
| DATA-001 | CRITICAL | All ML corpora | No ML-ready corpus is present in the audit scope | Training/evaluation data quality cannot be verified | High |
| LEAK-001 | HIGH | Train/validation/test | No locked split or evaluation artifacts | Leakage and evaluation validity cannot be tested | High |
| DATA-002 | HIGH | All ML corpora | Provenance, license, source, date, and transformation records are absent | Label/source/temporal bias and reproducibility remain unverified | High |
| BIAS-001 | HIGH | URL and NLP corpora | Philippine and Taglish representation cannot be measured | Intended operating-context coverage is unsubstantiated | High |
| DATA-003 | INFORMATIONAL | `DUAL_DETECTOR_VALIDATION_TRACKER.csv` | A 14-row QA checklist is the sole tabular artifact | It must not be mistaken for model data | High |
| PRIV-001 | INFORMATIONAL | Text corpora | No text corpus was available for PII analysis | Privacy risk remains unassessed, not absent | High |

## 20. Detailed Findings

### DATA-001 — ML corpus absent from audit scope

Severity: CRITICAL  
Confidence: High  
Dataset: All URL, text, training, validation, and test corpora  
Affected Records: Unknown; no corpus present  
Affected Percentage: Not calculable

Description: Discovery found no ML-ready CSV, TSV, JSON/JSONL, Parquet, spreadsheet, database export, feature matrix, or split artifact outside excluded dependencies. The sole CSV is a manual checklist.

Evidence: The working-tree discovery found `DUAL_DETECTOR_VALIDATION_TRACKER.csv` and model/configuration artifacts, but no URL/text examples or labels.

Impact on ML Training: No data quality gate can approve retraining.

Impact on Evaluation: No dataset-based performance, calibration, or generalization claim can be independently supported.

Recommended Action: Obtain immutable, access-controlled copies or manifests of every raw, processed, and split dataset before retraining or evaluation.

Requires Manual Review: No

### LEAK-001 — Split and evaluation artifacts unavailable

Severity: HIGH  
Confidence: High  
Dataset: Train/validation/test/holdout/external evaluation  
Affected Records: Unknown  
Affected Percentage: Not calculable

Description: No split assignments or locked evaluation datasets are available.

Evidence: The existing preparation workflow itself reports that a final-test/holdout/external-validation dataset is required for overlap analysis; none is present in the audit scope.

Impact on ML Training: Random row splitting could preserve duplicate or domain/campaign correlations.

Impact on Evaluation: Exact, normalized, domain, and near-duplicate leakage cannot be ruled out; reported metrics would not be auditable.

Recommended Action: Supply immutable split manifests and locked evaluation sets, then audit exact URL/text, canonical URL, registered-domain, and near-duplicate intersections.

Requires Manual Review: No

### DATA-002 — Provenance and regeneration evidence unavailable

Severity: HIGH  
Confidence: High  
Dataset: All ML corpora  
Affected Records: Unknown  
Affected Percentage: Not calculable

Description: No source/licensing/collection-date/merge/transformation metadata accompanies an auditable corpus.

Evidence: No dataset metadata or corpus-level source manifest was found. Model calibration metadata says the frozen email model was fitted/accepted/thresholded on group-disjoint validation subsets, but it does not identify the underlying corpus or its records.

Impact on ML Training: Source and target leakage checks cannot be confirmed.

Impact on Evaluation: Temporal, source, and licensing assumptions cannot be reproduced or reviewed.

Recommended Action: Create a versioned, hash-recorded data manifest for every input and transformation; preserve source licenses and collection dates.

Requires Manual Review: Yes

### BIAS-001 — Philippine and Taglish coverage unmeasurable

Severity: HIGH  
Confidence: High  
Dataset: URL and NLP corpora  
Affected Records: Unknown  
Affected Percentage: Not calculable

Description: There are no records or metadata to assess Philippine legitimate/phishing balance, `.ph` prevalence, local brand coverage, English/Tagalog/Taglish distribution, or language-label correlation.

Evidence: No URL or text corpus was found.

Impact on ML Training: A retrained model could learn geography, language, brand, source, or TLD shortcuts without detection.

Impact on Evaluation: Philippine-focused suitability cannot be claimed.

Recommended Action: Supply labeled, provenance-backed samples with explicit `language`, `country_or_market`, `source`, `collection_date`, and Philippine relevance metadata where available.

Requires Manual Review: Yes

### DATA-003 — Validation checklist is not a training dataset

Severity: INFORMATIONAL  
Confidence: High  
Dataset: `DUAL_DETECTOR_VALIDATION_TRACKER.csv`  
Affected Records: 14  
Affected Percentage: 100%

Description: The CSV contains browser/provider test cases and blank result fields, not observations or ML labels.

Evidence: Its six columns contain test metadata only; 14/14 `Actual Result`, `Pass or Fail`, and `Notes` fields are blank by design.

Impact on ML Training: None if excluded from ML inputs; severe target/schema confusion if misused.

Impact on Evaluation: It can guide manual acceptance testing only.

Recommended Action: Keep it separate from ML data pipelines and document it as a QA artifact.

Requires Manual Review: No

### PRIV-001 — Corpus PII status cannot be verified

Severity: INFORMATIONAL  
Confidence: High  
Dataset: Email/SMS/text corpora  
Affected Records: Unknown  
Affected Percentage: Not calculable

Description: There is no text corpus to scan for phone numbers, email addresses, account identifiers, names, addresses, or other PII.

Evidence: No records were found; no raw contents were inspected or reproduced.

Impact on ML Training: Privacy suitability cannot be established.

Impact on Evaluation: Privacy claims about held-out data cannot be established.

Recommended Action: Run a masked PII audit after approved corpus access is provided; preserve only counts, masked examples, and row IDs in audit output.

Requires Manual Review: Yes

## 21. Dataset Cleaning Recommendations

These actions are recommendations only; none was executed.

1. Preserve and hash each authoritative raw dataset before any audit or transformation.
2. Create a versioned, access-controlled working copy and a metadata manifest for every source.
3. Record source, license, collection date, acquisition method, intended split, label definition, language, and Philippine-relevance metadata where known.
4. Run label, schema, malformed-record, PII, exact/normalized duplicate, and cross-label-conflict audits on the supplied records.
5. Quarantine—not silently repair—ambiguous records and conflicts pending human label verification.
6. Exclude provenance/source fields and target-adjacent fields from model features.
7. Create a domain-grouped split for URL data; preserve a locked, newer external/Philippine evaluation set where feasible.
8. Audit split leakage at exact, canonical, host/path, registered-domain, campaign/template, and text-normalized levels.
9. Recalculate class, source, language, Philippine, TLD, and brand distributions after only approved cleaning actions.
10. Publish dataset hashes, a changelog, and reproducible build instructions before retraining.

## 22. Recommended Train/Validation/Test Strategy

| Strategy | Assessment for BantAI |
|---|---|
| Random stratified row split | Insufficient alone; likely to leak repeated URLs, domains, campaigns, or message templates |
| Domain-grouped split | Recommended baseline for URL data; group by private-suffix-aware registrable domain or exact normalized IP |
| Source-grouped split | Required as a stress test when sources are label-correlated (for example, phishing feed versus popularity list) |
| Temporal split | Recommended external/generalization evaluation when collection dates are available |

Use a domain-grouped, class-aware development split for URLs, with source-distribution review. Keep a locked newer evaluation set, including an independently sourced Philippine subset. For text, group near-duplicate/template families and, where ethically and operationally appropriate, use time-aware and source-aware holdouts. Do not select a final strategy until the missing records and provenance are audited.

## 23. Dataset Readiness Checklist

- [ ] Dataset source documented
- [ ] Labels standardized
- [ ] Missing labels resolved
- [ ] Exact duplicates addressed
- [ ] Conflicting labels resolved
- [ ] Train/test leakage eliminated
- [ ] Domain leakage evaluated
- [ ] Source bias evaluated
- [ ] Class balance reviewed
- [ ] Philippine representation reviewed
- [ ] Taglish representation reviewed
- [ ] Hard negatives included
- [ ] Hard positives included
- [ ] PII reviewed
- [ ] Dataset versioned
- [ ] Dataset hash recorded
- [ ] Preprocessing reproducible
- [ ] Final split documented

None of these checks is marked complete because the required ML corpus and evidence are unavailable. The checklist CSV’s schema was reviewed, but it does not satisfy any ML dataset readiness item.

## 24. Final Assessment

**Overall Dataset Risk:** Critical  
**Training Recommendation:** NOT SUITABLE FOR TRAINING from this repository checkout. Do not retrain from the validation checklist or model artifacts.  
**Evaluation Reliability:** Not assessable; do not represent current repository evidence as leakage-safe or production-quality dataset evaluation.

**Top 5 Dataset Issues:**

1. Auditable ML corpora are absent.
2. Train/validation/test/holdout artifacts are absent.
3. Provenance, source, licensing, and temporal metadata are absent.
4. Philippine and Taglish representation cannot be measured.
5. Text-corpus PII status cannot be verified.

**Most Important Recommendation:** Provide immutable, provenance-backed raw and split datasets (or privacy-safe manifests plus approved secure access) before any retraining, model comparison, or production-quality evaluation.

## Assumptions and Limitations

- Discovery was limited to the supplied working tree and excluded dependency/vendor trees. Git-ignore rules indicate that private research/validation data may intentionally be excluded from version control; no such data was available in this checkout.
- The audit did not infer labels, sources, country association, phishing status, or legitimacy from URLs, model filenames, or code comments.
- Model serialization artifacts were not opened or reverse-engineered because they are not datasets and the frozen-model contract forbids reinterpretation.
- No real LLM request, browser navigation, HTTP request, dataset modification, row deletion, automatic relabeling, cleaning, splitting, or retraining was performed.

DATASET AUDIT COMPLETE

Report generated: `BANTAI_DATASET_AUDIT.md`

Datasets analyzed: 0 ML datasets (1 non-ML tabular QA artifact reviewed)

Total records analyzed: 0 ML records (14 QA checklist rows reviewed)

Critical findings: 1  
High findings: 3  
Medium findings: 0  
Low findings: 0  
Informational findings: 2

Dataset recommendation: NOT SUITABLE FOR TRAINING

Training or cleaning has NOT been performed.
