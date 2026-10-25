# Backfill — instrumentos, anamneses e sessões

Data do backfill: 21/10/2026 (BRT). Definitions are stored in the dedicated Supabase Painel Psico database, scoped by user through existing RLS. **No patient records, questionnaire responses, or report text were imported or modified.**

## Source material
- Uploaded TEA anamnesis (18-page Word file), Regina's Padrão anamnesis (16-page Word file), and SCARED Parents (41 questions).
- Photographed CARS, M-CHAT-R, SNAP-IV Familiar, EFA, Vineland-3 parent/teacher protocols and the instrument control list.
- Existing laudo result tables from the Drive folder supplied by the user; including the locally supplied DOCX and representative Google Docs.
- Photos and restricted test questions are not committed to the public repository.

## Seeded definitions (per account)
- Anamnese: exactly two active models, **Padrão** (209 questions, grouped by the 12 sections of Regina's 16-page Word document; revision 2) and **TEA** (183 questions; sections preserved). Original Padrão revision 1 and previous patient answers remain intact; a previous test template is archived, not deleted.
- Instruments: **38 active models**; **27** have result tables (**38** tables total). Fixed row labels and editable result cells reflect verified report table structures, not individual patients' scores.
- Externally answerable questionnaires: **SCARED (41)**, **SNAP-IV Familiar (18)**, **M-CHAT-R (20)**, **EFA (50)** — **129** question definitions.
- Sessões: three configurable fields: checklist of applied/pending/corrected/in-report status; worked-on instruments; next instruments/pending tasks.

## Incomplete / requiring source confirmation
- The supplied Vineland-3 photo sequence does not establish a complete, verified questionnaire for either respondent type. The result tables are present, but patient-facing forms are **not** enabled.
- CARS scoring sheets are for professional use; the result table is present, but no patient-facing form is enabled.
- **11 instruments** without confirmed laudo result-table layout retain empty tables rather than a fabricated format. Examples: ADOS, ADI-R, IDADI, HTP, ASRS-18, PROTEA-R and other tests without verified quantitative tables. TCLPP was matched to a Drive laudo and now includes the reported word-type result table.
- Source table geometry/headers/rows were replicated in editable table definitions where verified. Exact pixel-for-pixel Word/PDF formatting and automated norm conversions are **not** asserted.
- Human review of questionnaire transcription, scoring, and copyright/licensing requirements is necessary before clinical release or sending protected tests to patients.

This file records status and provenance only; the sensitive question bodies live in the authenticated database.

## Validation
- SQL validation: zero malformed table structures and zero invalid questionnaire questions.
- Both registered account scopes have exactly 2 active anamnesis templates, 38 active instrument definitions, 4 complete questionnaires, and 3 active session checklist fields.
- Vercel status for the section-grouping update: deployment completed successfully.
- Verified result-table formats from additional Drive laudos: TAVIS-4 (reaction time, correct responses and omission/action errors), TISD (subtests and total) and TDE II (additional efficiency table).

- Additional layout sources: Raven-CPM result grid, three respondent-specific SSRS layouts (including behavior and academic subscales), and ETDAH-AD factor table from Drive laudos. These contain blank editable results only, never patient scores.

- 25/10/2026: Padrão model backfilled in both authenticated accounts; version 2 created automatically by database triggers, previous revisions preserved. Settings now display one collapsed card per anamnesis template, and the Agenda settings section precedes Configurar Laudo.
