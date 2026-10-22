import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotAnamneseTemplate, patientAnamneseSnapshot, selectPatientAnamnese } from "../lib/anamneseVersions.mjs";

test("patient's first selection stores an independent template revision", () => {
  const patient = { anamnese: {}, anamnese_template_id: null };
  const template = { id: "template1", name: "TEA", revision: 3, questions: [{ id: "q1", label: "Fala?", field_type: "single", options: ["Sim", "Talvez", "Não"] }] };
  const next = selectPatientAnamnese(patient, template.id, template);
  template.questions[0].label = "Nova pergunta";
  template.questions[0].options.pop();
  assert.equal(next.anamnese.template_snapshots.template1.questions[0].label, "Fala?");
  assert.deepEqual(next.anamnese.template_snapshots.template1.questions[0].options, ["Sim", "Talvez", "Não"]);
  assert.equal(next.anamnese.template_snapshots.template1.revision, 3);
});

test("reselecting after template edits keeps original answers and wording", () => {
  const template = { id: "t", name: "Padrão", revision: 1, questions: [{ id: "q", label: "Original", field_type: "single", options: ["Sim", "Não"] }] };
  let patient = selectPatientAnamnese({ anamnese: {}, anamnese_template_id: null }, "t", template);
  patient.anamnese.template_answers = { t: { q: "Não" } };
  patient = selectPatientAnamnese(patient, "t", { ...template, revision: 9, questions: [] });
  const snapshot = patientAnamneseSnapshot(patient.anamnese, "t", { ...template, revision: 9, questions: [] });
  assert.equal(snapshot.questions[0].label, "Original");
  assert.equal(snapshot.questions[0].options[1], "Não");
  assert.equal(patient.anamnese.template_answers.t.q, "Não");
  assert.equal(snapshot.revision, 1);
});

test("legacy missing questions are visible with their saved answer", () => {
  const snapshot = snapshotAnamneseTemplate({
    id: "t", name: "Padrão", questions: [{ id: "q1", label: "Existe" }]
  }, { q1: "Sim", deleted: "Talvez", deletedMulti: ["Sim"] });
  assert.deepEqual(snapshot.questions.map(q => q.id), ["q1", "deleted", "deletedMulti"]);
  assert.equal(snapshot.questions[1].field_type, "text");
  assert.equal(snapshot.questions[2].field_type, "multiple");
});

test("clearing selected model keeps all snapshots and answers", () => {
  const patient = selectPatientAnamnese({ anamnese: { template_answers: { t: { q: "Sim" } } } }, "t",
    { id: "t", questions: [{ id: "q", label: "Original" }] });
  const cleared = selectPatientAnamnese(patient, "", null);
  assert.equal(cleared.anamnese_template_id, null);
  assert.deepEqual(cleared.anamnese, patient.anamnese);
});

test("switching models preserves history from both", () => {
  let patient = selectPatientAnamnese({ anamnese: {} }, "a", { id: "a", revision: 1, questions: [{ id: "q", label: "A" }] });
  patient = selectPatientAnamnese(patient, "b", { id: "b", revision: 1, questions: [{ id: "r", label: "B" }] });
  assert.deepEqual(Object.keys(patient.anamnese.template_snapshots), ["a", "b"]);
});
