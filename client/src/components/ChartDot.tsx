/**
 * O ponto que marca o fim da curva.
 *
 * Os gráficos de linha usam `preserveAspectRatio="none"` para a curva esticar
 * até as bordas do cartão — e essa mesma escala desigual achata um `<circle>`
 * do SVG numa elipse. O ponto sai então de dentro do SVG e vira um elemento
 * posicionado em porcentagem sobre ele: redondo em qualquer largura.
 *
 * `vectorEffect="non-scaling-stroke"` não resolveria: ele preserva a espessura
 * do traço, não a forma do preenchimento.
 */
export function ChartDot({ x, y, width, height, size, color, ringColor }: {
  /** Coordenadas no mesmo sistema do `viewBox` do gráfico. */
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  color: string;
  /** Anel opcional, para o ponto não sumir quando cai em cima da própria linha. */
  ringColor?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute rounded-full"
      style={{
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
        width: size,
        height: size,
        background: color,
        transform: "translate(-50%, -50%)",
        ...(ringColor ? { boxShadow: `0 0 0 2px ${ringColor}` } : {}),
      }}
    />
  );
}
