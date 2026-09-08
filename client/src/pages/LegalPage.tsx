import { GranafyLogo } from "@/components/GranafyLogo";
import { Link } from "wouter";

/**
 * Termos de uso e política de privacidade.
 *
 * O texto descreve o que o sistema de fato faz — que dado entra, onde ele fica
 * e como sair. Nada aqui é promessa que o código não cumpra: se o produto
 * mudar, este texto muda junto.
 */
type Section = { title: string; paragraphs: string[] };

const TERMS: Section[] = [
  {
    title: "O que é o GranaFy",
    paragraphs: [
      "O GranaFy é um sistema de gestão financeira empresarial. Ele registra lançamentos, importa extratos bancários, concilia movimentações e monta relatórios a partir do que você cadastra.",
      "Os números que o sistema mostra são calculados a partir dos seus dados. Ele organiza e apresenta essa informação; ele não presta consultoria contábil, fiscal ou de investimento, e não substitui o seu contador.",
    ],
  },
  {
    title: "Sua conta",
    paragraphs: [
      "Você é responsável por manter a sua senha em segredo e por tudo que for feito com a sua conta. Se desconfiar de acesso indevido, troque a senha imediatamente pela opção “Esqueceu a senha?” na tela de entrada.",
      "Cada conta enxerga apenas os próprios dados.",
    ],
  },
  {
    title: "O que você cadastra continua seu",
    paragraphs: [
      "Os lançamentos, extratos, categorias e documentos que você registra são seus. Nós os guardamos para que o sistema funcione, e você pode exportá-los em CSV a qualquer momento pelas telas de Lançamentos, DRE, Fluxo de caixa e Conciliação.",
      "Você pode pedir a exclusão da sua conta e dos dados dela a qualquer momento pelo e-mail de contato abaixo.",
    ],
  },
  {
    title: "Disponibilidade e limites",
    paragraphs: [
      "O serviço pode ficar indisponível para manutenção ou por falha de terceiros dos quais ele depende, como o provedor de banco de dados.",
      "O sistema não se responsabiliza por decisões tomadas com base nos relatórios: a conferência dos números lançados é sua.",
    ],
  },
];

const PRIVACY: Section[] = [
  {
    title: "Que dados são coletados",
    paragraphs: [
      "Cadastro: nome, e-mail e uma senha guardada apenas como hash (scrypt). A senha em texto puro nunca é armazenada.",
      "Uso do sistema: lançamentos financeiros, contas bancárias, categorias, centros de custo, itens patrimoniais, extratos importados e os anexos que você enviar.",
      "Ao entrar com o Google, recebemos do Google apenas o seu nome e e-mail verificado, usados para identificar a conta. Nenhuma senha do Google chega até aqui.",
    ],
  },
  {
    title: "Para que eles são usados",
    paragraphs: [
      "Exclusivamente para operar o sistema: autenticar você, calcular saldos e relatórios, sugerir conciliações e guardar o histórico das ações.",
      "Seus dados financeiros não são vendidos, alugados nem compartilhados com terceiros para publicidade.",
    ],
  },
  {
    title: "Onde eles ficam",
    paragraphs: [
      "Os dados são armazenados em um banco de dados gerenciado TiDB Cloud, com conexão criptografada (TLS). Os anexos ficam no serviço de armazenamento de arquivos usado pela aplicação.",
      "A sessão é mantida por um cookie assinado, com HttpOnly, e o acesso ao sistema é feito por HTTPS.",
    ],
  },
  {
    title: "Seus direitos",
    paragraphs: [
      "Você pode acessar, corrigir e exportar seus dados a qualquer momento dentro do sistema, e pedir a exclusão da conta pelo e-mail de contato.",
      "Excluída a conta, os dados vinculados a ela são apagados, salvo o que a legislação exigir manter.",
    ],
  },
];

export default function LegalPage({ document }: { document: "termos" | "privacidade" }) {
  const termos = document === "termos";
  const sections = termos ? TERMS : PRIVACY;

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="mx-auto flex min-h-screen w-full max-w-[760px] flex-col gap-6 p-5 sm:p-10">
        <header className="flex flex-wrap items-center gap-4">
          <GranafyLogo size={36} className="min-w-0 shrink-0" />
          <Link
            href="/login"
            className="ml-auto rounded-[12px] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6]"
          >
            Voltar para a entrada
          </Link>
        </header>

        <article className="flex flex-col gap-6 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3] sm:p-8">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-.02em]">
              {termos ? "Termos de uso" : "Política de privacidade"}
            </h1>
            <p className="mt-1.5 text-[13px] text-[#4C6355]">
              GranaFy · Número Virtual LTDA · atualizado em setembro de 2026
            </p>
          </div>

          {sections.map(section => (
            <section key={section.title} className="flex flex-col gap-2">
              <h2 className="text-[16px] font-bold">{section.title}</h2>
              {section.paragraphs.map(paragraph => (
                <p key={paragraph} className="text-[13.5px] leading-relaxed text-[#28382E]">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <section className="flex flex-col gap-2 border-t border-[#F1F4F2] pt-5">
            <h2 className="text-[16px] font-bold">Contato</h2>
            <p className="text-[13.5px] leading-relaxed text-[#28382E]">
              Dúvidas sobre estes termos, sobre seus dados ou pedidos de exclusão:{" "}
              <a href="mailto:contato@granafy.com" className="font-semibold text-[#0A7A42] underline-offset-2 hover:underline">
                contato@granafy.com
              </a>.
            </p>
          </section>

          <p className="text-[12.5px] text-[#4C6355]">
            {termos ? (
              <>Veja também a <Link href="/privacidade" className="font-semibold text-[#0A7A42] hover:underline">política de privacidade</Link>.</>
            ) : (
              <>Veja também os <Link href="/termos" className="font-semibold text-[#0A7A42] hover:underline">termos de uso</Link>.</>
            )}
          </p>
        </article>
      </div>
    </main>
  );
}
