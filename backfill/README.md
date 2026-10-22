# Backfill — instrumentos, anamneses e sessões

Data do backfill: 21/10/2026 (BRT). Definitions are stored in the dedicated Supabase Painel Psico database, scoped by user through existing RLS. **No patient records, questionnaire responses, or report text were imported or modified.**

## Source material
- Uploaded TEA anamnesis (18-page Word file) and SCARED Parents (41 questions).
- Photographed CARS, M-CHAT-R, SNAP-IV Familiar, EFA, Vineland-3 parent/teacher protocols and the instrument control list.
- Existing laudo result tables from the Drive folder supplied by the user; including the locally supplied DOCX and representative Google Docs.
- Photos and restricted test questions are not committed to the public repository.

## Seeded definitions (per account)
- Anamnese: exactly two active models, **Padrão** (empty) and **TEA** (183 questions; sections preserved). A previous test template is archived, not deleted.
- Instruments: **38 active models**; **20** have result tables (**23** tables total). Fixed row labels and editable result cells reflect verified report table structures, not individual patients' scores.
- Externally answerable questionnaires: **SCARED (41)**, **SNAP-IV Familiar (18)**, **M-CHAT-R (20)**, **EFA (50)** — **129** question definitions.
- Sessões: three configurable fields: checklist of applied/pending/corrected/in-report status; worked-on instruments; next instruments/pending tasks.

## Incomplete / requiring source confirmation
- The supplied Vineland-3 photo sequence does not establish a complete, verified questionnaire for either respondent type. The result tables are present, but patient-facing forms are **not** enabled.
- CARS scoring sheets are for professional use; the result table is present, but no patient-facing form is enabled.
- Instruments without confirmed laudo result-table layout retain empty tables rather than a fabricated format. Examples: ADOS, ADI-R, IDADI, HTP, RAVEN, TISD, TCLPP, SSRS, ASRS-18, ETDAH-AD, PROTEA-R and more.
- Source table geometry/headers/rows were replicated in editable table definitions where verified. Exact pixel-for-pixel Word/PDF formatting and automated norm conversions are **not** asserted.
- Human review of questionnaire transcription, scoring, and copyright/licensing requirements is necessary before clinical release or sending protected tests to patients.

This file records status and provenance only; the sensitive question bodies live in the authenticated database.
