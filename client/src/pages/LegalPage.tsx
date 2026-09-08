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
      <header className="sticky top-0 z-30 border-b border-[#E3EBE6] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-4 px-5 py-4 sm:px-8">
          <Link href="/login" aria-label="GranaFy"><GranafyLogo size={34} /></Link>
          <nav className="ml-auto flex items-center gap-2">
            <Link
              href={termos ? "/privacidade" : "/termos"}
              className="rounded-[12px] px-3.5 py-2.5 text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42]"
            >
              {termos ? "Política de privacidade" : "Termos de uso"}
            </Link>
            <Link
              href="/login"
              className="rounded-[12px] bg-[#12B85C] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E]"
            >
              Entrar
            </Link>
          </nav>
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
            <br />
            Atualizado em {COMPANY.updatedAt}
          </p>
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
