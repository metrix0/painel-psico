"use client";

export default function ChoiceOptionsEditor({ options = [], onChange, multiple = false, label = "Pergunta" }) {
  function update(index, value) {
    onChange(options.map((option, i) => i === index ? value : option));
  }
  function remove(index) {
    onChange(options.filter((_, i) => i !== index));
  }
  return <div className="choice-options-editor" role="group" aria-label={"Opções de " + label}>
    <span className="choice-options-title">Opções de resposta</span>
    <div className="choice-options-list">
      {options.map((option, index) => <div className="choice-option-row" key={index}>
        <span className={"choice-option-symbol" + (multiple ? " multiple" : "")} aria-hidden="true" />
        <input type="text" aria-label={"Opção " + (index + 1) + " de " + label}
          value={option} placeholder={"Opção " + (index + 1)}
          onChange={event => update(index, event.target.value)} />
        <button type="button" className="choice-option-remove" aria-label={"Remover opção " + (index + 1)}
          title="Remover opção" onClick={() => remove(index)}>×</button>
      </div>)}
    </div>
    <button type="button" className="choice-option-add" onClick={() => onChange([...options, ""])}>
      + Adicionar opção
    </button>
  </div>;
}
