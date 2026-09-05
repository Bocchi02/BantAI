# Local model migration checklist

- [ ] Extract the Codex-ready project.
- [ ] Run `scripts\models\MIGRATE_EXISTING_MODELS.ps1`.
- [ ] Confirm the calibrated email model files exist under
      `models\email_text_xlmr_v2\full_taglish_xlmr_512_headtail_seed13`.
- [ ] Confirm the prior checkpoint remains under
      `models\email_text_xlmr_v1\rollback_archive\checkpoint-15666` for rollback only.
- [ ] Confirm `bantai_rf_grouped_v1.0.0.joblib` exists under
      `models\url_random_forest_grouped_v1` and its SHA-256 is verified.
- [ ] Keep V4-B under `models\url_random_forest_v4b` for rollback/audit only.
- [ ] Run `python scripts\verify_models.py`.
- [ ] Run `python scripts\verify_project.py`.
- [ ] Run `START_BANTAI.ps1`.
- [ ] Open `http://127.0.0.1:8000/health`.
- [ ] Confirm both trained models are loaded.
- [ ] Initialize Git only after model files are confirmed ignored.
- [ ] Run `scripts\codex\VERIFY_GIT_SAFETY.ps1`.
