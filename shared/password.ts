/**
 * A política de senha, num lugar só.
 *
 * A mesma função mede a barrinha na tela e valida no servidor. Se cada lado
 * tivesse a sua regra, a barra diria "senha forte" para algo que o cadastro
 * recusa — ou, pior, o servidor aceitaria o que a tela pintou de fraco.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordChecks = {
  length: boolean;
  number: boolean;
  special: boolean;
};

/** Qualquer coisa que não seja letra nem dígito conta como caractere especial. */
const SPECIAL = /[^A-Za-z0-9]/;

export function passwordChecks(value: string): PasswordChecks {
  return {
    length: value.length >= PASSWORD_MIN_LENGTH,
    number: /\d/.test(value),
    special: SPECIAL.test(value),
  };
}

/** As três exigências precisam passar. Não existe "quase". */
export function isPasswordValid(value: string) {
  const checks = passwordChecks(value);
  return checks.length && checks.number && checks.special;
}

export const PASSWORD_RULE_LABELS: Array<{ key: keyof PasswordChecks; label: string }> = [
  { key: "length", label: `pelo menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { key: "number", label: "um número" },
  { key: "special", label: "um caractere especial" },
];

export const PASSWORD_REQUIREMENT_MESSAGE =
  `A senha precisa ter ao menos ${PASSWORD_MIN_LENGTH} caracteres, um número e um caractere especial`;

export type PasswordStrength = {
  /** 0 a 4, que é o número de segmentos acesos na barra. */
  score: number;
  label: string;
  /** Só é aceitável a partir daqui. */
  valid: boolean;
};

/**
 * A força que a barra mostra.
 *
 * Os três primeiros segmentos são as exigências obrigatórias; o quarto é o
 * comprimento extra, que é o que de fato separa uma senha aceitável de uma
 * difícil de quebrar. Uma senha inválida nunca chega a três segmentos, para a
 * barra não parecer aprovar o que o cadastro vai recusar.
 */
export function passwordStrength(value: string): PasswordStrength {
  if (value.length === 0) return { score: 0, label: "", valid: false };

  const checks = passwordChecks(value);
  const atendidas = [checks.length, checks.number, checks.special].filter(Boolean).length;
  const valid = atendidas === 3;

  if (!valid) {
    return {
      score: Math.max(1, atendidas),
      label: atendidas <= 1 ? "Senha fraca" : "Senha incompleta",
      valid: false,
    };
  }

  const forte = value.length >= 12;
  return { score: forte ? 4 : 3, label: forte ? "Senha forte" : "Senha boa", valid: true };
}
