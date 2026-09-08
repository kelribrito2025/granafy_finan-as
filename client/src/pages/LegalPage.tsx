import { GranafyLogo } from "@/components/GranafyLogo";
import { COMPANY, PRIVACY_SECTIONS, TERMS_SECTIONS, type Section } from "@/lib/legalContent";
import { Link } from "wouter";

/** Só os "1.", "2." do começo do título viram âncora legível. */
function anchorOf(title: string) {
  return `s${title.split(".")[0].trim()}`;
}

/**
 * Termos de uso e política de privacidade.
 *
 * O texto mora em `lib/legalContent.ts`; aqui só existe a moldura. O índice
 * lateral é gerado das próprias seções, então acrescentar uma cláusula lá
 * aparece aqui sem ninguém precisar lembrar de atualizar dois lugares.
 */
export default function LegalPage({ document }: { document: "termos" | "privacidade" }) {
  const termos = document === "termos";
  const sections: Section[] = termos ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <main className="min-h-screen w-full bg-white text-[#28382E]">
      {/*
        O mesmo cabeçalho da landing: quem chega aqui por um link do site não
        deveria sentir que trocou de produto no meio do caminho.
      */}
      <header className="sticky top-0 z-40 border-b border-[#E3EBE6] bg-white/[.92] backdrop-blur-[10px]">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-7 px-6 py-3.5">
          <a href="/site" className="flex items-center gap-2.5" aria-label="GranaFy">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#12B85C]">
              <svg width="21" height="21" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <circle cx="32" cy="32" r="23" stroke="#FFFFFF" strokeWidth="10" opacity=".38" />
                <path d="M55 32a23 23 0 01-36 19" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-[18px] font-bold tracking-[-.02em] text-[#0B1F14]">
              Grana<span className="text-[#0A7A42]">Fy</span>
            </span>
          </a>

          <nav className="hidden items-center gap-[22px] sm:flex">
            {[["Recursos", "recursos"], ["Como funciona", "como-funciona"], ["Planos", "planos"]].map(([rotulo, ancora]) => (
              <a key={ancora} href={`/site#${ancora}`} className="text-[14px] text-[#4C6355] transition hover:text-[#0A7A42]">
                {rotulo}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link href="/login" className="flex h-[42px] items-center rounded-[12px] px-4 text-[14px] font-semibold text-[#28382E] transition hover:bg-[#F1FBF6]">
              Entrar
            </Link>
            <Link href="/cadastro" className="flex h-[42px] items-center rounded-[12px] bg-[#12B85C] px-[18px] text-[14px] font-bold text-white transition hover:bg-[#0F9E4E]">
              Testar 14 dias grátis
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-2.5 border-b border-[#E3EBE6] pb-8">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#8A968D]">Jurídico</span>
          <h1 className="text-[32px] font-bold leading-tight tracking-[-.02em] text-[#0B1F14] sm:text-[44px]">
            {termos ? "Termos de uso" : "Política de privacidade"}
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[#4C6355]">
            {COMPANY.legalName} · CNPJ {COMPANY.taxId}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <span className="text-[13.5px] text-[#4C6355]">
              <strong className="font-semibold text-[#28382E]">Última atualização:</strong> {COMPANY.updatedAt}
            </span>
            <Link
              href={termos ? "/privacidade" : "/termos"}
              className="flex items-center gap-2 rounded-[12px] border border-[#C7E8D6] bg-[#F1FBF6] px-3.5 py-2 text-[13px] font-bold text-[#0A7A42] transition hover:bg-[#DFF6EA]"
            >
              {termos ? "Ver a Política de Privacidade" : "Ver os Termos de Uso"} →
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-10 pt-8 lg:flex-row lg:gap-12">
          <nav aria-label="Índice" className="w-full shrink-0 lg:sticky lg:top-[88px] lg:h-fit lg:w-[300px]">
            <span className="mb-3 block text-[11px] font-semibold uppercase tracking-[.1em] text-[#8A968D]">
              Nesta página
            </span>
            <ol className="flex flex-col gap-0.5">
              {sections.map(section => (
                <li key={section.title}>
                  <a
                    href={`#${anchorOf(section.title)}`}
                    className="block rounded-[10px] px-3 py-2 text-[13.5px] text-[#4C6355] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42]"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="flex min-w-0 flex-1 flex-col gap-9">
            {sections.map(section => (
              <section
                key={section.title}
                id={anchorOf(section.title)}
                className="flex scroll-mt-24 flex-col gap-3.5"
              >
                <h2 className="text-[20px] font-bold text-[#0B1F14] sm:text-[24px]">{section.title}</h2>
                {section.paragraphs.map(paragraph => (
                  <p key={paragraph} className="text-[15px] leading-[1.7] text-[#28382E]">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>
        </div>
      </div>

      <footer className="bg-[#0B1F14] text-[#C5DACE]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-5 py-10 sm:px-8">
          <GranafyLogo size={32} tone="onDark" />
          <p className="text-[12.5px] leading-relaxed text-[#8FB39E]">
            {COMPANY.legalName} · CNPJ {COMPANY.taxId}
          </p>
          <p className="flex flex-wrap gap-4 text-[12.5px]">
            <Link href="/termos" className="transition hover:text-white">Termos de uso</Link>
            <Link href="/privacidade" className="transition hover:text-white">Política de privacidade</Link>
            <Link href="/login" className="transition hover:text-white">Entrar</Link>
          </p>
        </div>
      </footer>
    </main>
  );
}
