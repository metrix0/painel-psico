"use client";

export default function QuestionAnswerInput({
  field, value, onChange, namePrefix = "question", disabled = false
}) {
  const choices = (field.options || []).map(option => String(option)).filter(option => option.trim());
  const inactive = disabled || Boolean(field.archived);

  return <div className="session-custom-field">
    <span className="custom-field-label">
      {field.label || "Pergunta sem nome"}{field.archived ? " (arquivado)" : ""}
    </span>
    {field.field_type === "textarea" ? (
      <textarea value={typeof value === "string" ? value : ""} disabled={inactive}
        onChange={event => onChange(event.target.value)} />
    ) : field.field_type === "text" ? (
      <input value={typeof value === "string" ? value : ""} disabled={inactive}
        onChange={event => onChange(event.target.value)} />
    ) : field.field_type === "single" ? (
      <div className="custom-choices">
        {choices.map((option, index) => <label className="custom-choice" key={index}>
          <input type="radio" name={namePrefix + "-" + field.id}
            checked={value === option} disabled={inactive} onChange={() => onChange(option)} />
          <span>{option}</span>
        </label>)}
      </div>
    ) : field.field_type === "multiple" ? (
      <div className="custom-choices">
        {choices.map((option, index) => <label className="custom-choice" key={index}>
          <input type="checkbox" checked={Array.isArray(value) && value.includes(option)}
            disabled={inactive}
            onChange={event => {
              const current = Array.isArray(value) ? value : [];
              onChange(event.target.checked
                ? [...current.filter(item => item !== option), option]
                : current.filter(item => item !== option));
            }} />
          <span>{option}</span>
        </label>)}
      </div>
    ) : null}
  </div>;
}
