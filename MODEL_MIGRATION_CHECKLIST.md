# Local model migration checklist

- [ ] Extract the Codex-ready project.
- [ ] Run `scripts\models\MIGRATE_EXISTING_MODELS.ps1`.
- [ ] Confirm the checkpoint files exist under
      `models\email_text_xlmr_v1\checkpoint-15666`.
- [ ] Confirm the RF joblib exists under
      `models\url_random_forest_v4b`.
- [ ] Run `python scripts\verify_models.py`.
- [ ] Run `python scripts\verify_project.py`.
- [ ] Run `START_BANTAI.ps1`.
- [ ] Open `http://127.0.0.1:8000/health`.
- [ ] Confirm both trained models are loaded.
- [ ] Initialize Git only after model files are confirmed ignored.
- [ ] Run `scripts\codex\VERIFY_GIT_SAFETY.ps1`.
