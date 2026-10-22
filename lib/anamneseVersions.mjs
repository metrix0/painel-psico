export function snapshotAnamneseTemplate(template, answers = {}) {
  if (!template?.id) return null;
  const questions = Array.isArray(template.questions) ? structuredClone(template.questions) : [];
  const recorded = new Set(questions.map(question => String(question.id)));
  for (const [id, answer] of Object.entries(answers || {})) {
    if (recorded.has(id)) continue;
    questions.push({
      id,
      label: "Pergunta anterior (enunciado original indisponível)",
      field_type: Array.isArray(answer) ? "multiple" : "text",
      options: Array.isArray(answer) ? [...answer] : [],
      historical_unknown: true
    });
  }
  return {
    template_id: template.id,
    revision: Number(template.revision) || 1,
    name: template.name || "Modelo anterior",
    questions
  };
}

export function patientAnamneseSnapshot(anamnese, templateId, currentTemplate) {
  if (!templateId) return null;
  const saved = anamnese?.template_snapshots?.[templateId];
  const template = saved || currentTemplate;
  if (!template) return null;
  const stored = {
    ...template,
    id: templateId
  };
  return snapshotAnamneseTemplate(stored, anamnese?.template_answers?.[templateId]);
}

export function selectPatientAnamnese(patient, templateId, template) {
  const existing = patient.anamnese || {};
  if (!templateId) return { ...patient, anamnese_template_id: null };
  const previous = existing.template_snapshots?.[templateId];
  const snapshot = previous || snapshotAnamneseTemplate(template, existing.template_answers?.[templateId]);
  if (!snapshot) return null;
  return {
    ...patient,
    anamnese_template_id: templateId,
    anamnese: {
      ...existing,
      template_snapshots: {
        ...(existing.template_snapshots || {}),
        [templateId]: snapshot
      }
    }
  };
}
