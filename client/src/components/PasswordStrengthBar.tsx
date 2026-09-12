import { PASSWORD_RULE_LABELS, passwordChecks, passwordStrength } from "@shared/password";

/**
 * A barrinha de força.
 *
 * Os três primeiros segmentos são as exigências obrigatórias e o quarto é o
 * comprimento extra. Quem manda no cálculo é o módulo compartilhado, o mesmo
 * que o servidor usa para validar — a barra não pode aprovar o que o cadastro
 * vai recusar.
 */
export function PasswordStrengthBar({ value }: { value: string }) {
  const strength = passwordStrength(value);
  const checks = passwordChecks(value);
  const cor = strength.valid ? "bg-[#12B85C]" : strength.score >= 2 ? "bg-[#F2A93B]" : "bg-[#B3261E]";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" role="img" aria-label={strength.label || "Senha vazia"}>
        {[0, 1, 2, 3].map(index => (
          <span
            key={index}
            className={`h-[6px] flex-1 rounded-full transition-colors ${index < strength.score ? cor : "bg-[#E3EBE6]"}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        {strength.label && (
          <span className={`font-semibold ${strength.valid ? "text-[#0A7A42]" : "text-[#8E1F16]"}`}>
            {strength.label}
          </span>
        )}
        {PASSWORD_RULE_LABELS.map(rule => (
          <span key={rule.key} className={checks[rule.key] ? "text-[#0A7A42]" : "text-[#718077]"}>
            {checks[rule.key] ? "✓" : "•"} {rule.label}
          </span>
        ))}
      </div>
    </div>
  );
}

