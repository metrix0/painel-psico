export const DEFAULT_CHOICES = ["Sim", "Talvez", "Não"];

export function newChoiceQuestion(label = "") {
  return { id: crypto.randomUUID(), label, field_type: "single", options: [...DEFAULT_CHOICES] };
}

export function typeChange(question, fieldType) {
  const options = question.options || [];
  return {
    field_type: fieldType,
    options: ["single", "multiple"].includes(fieldType) && !options.some(option => String(option).trim())
      ? [...DEFAULT_CHOICES] : options
  };
}
