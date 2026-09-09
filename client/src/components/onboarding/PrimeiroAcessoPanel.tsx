import { BuildingIcon, ChevronRightIcon, UploadIcon, WalletIcon, type IconlyIcon } from "@/components/IconlyIcons";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";

/*
 * "Você pode refazer esses passos em Configurações".
 *
 * A promessa aparece duas vezes no primeiro acesso, e precisava de um lugar
 * onde ela se cumprisse. Não é o assistente de novo: o assistente existe para
 * quem tem a conta vazia, e reabri-lo com o razão cheio seria um túnel que não
 * leva a lugar nenhum.
 *
 * O que esta tela faz é apontar cada passo para onde ele mora de verdade — e
 * dizer o que já está feito, para a pessoa saber o que falta em vez de
 * adivinhar.
 */
export function PrimeiroAcessoPanel() {
  const [, setLocation] = useLocation();
  const [tourAberto, setTourAberto] = useState(false);

  const empresa = trpc.settings.company.useQuery();
  const organizacao = trpc.organization.overview.useQuery();

  const temEmpresa = Boolean(empresa.data?.legalName);
  const contas = organizacao.data?.accounts.length ?? 0;
  const lancamentos = organizacao.data?.accounts.reduce((soma, conta) => soma + conta.transactionCount, 0) ?? 0;

  const passos: Array<{ icone: IconlyIcon; titulo: string; apoio: string; feito: boolean; detalhe: string; destino: string; acao: string }> = [
    {
      icone: BuildingIcon,
      titulo: "Empresa",
      apoio: "Razão social, CNPJ, início do exercício e regime tributário.",
      feito: temEmpresa,
      detalhe: temEmpresa ? empresa.data!.legalName : "Ainda não preenchida",
      destino: "/configuracoes?aba=empresa",
      acao: "Abrir",
    },
    {
      icone: WalletIcon,
      titulo: "Contas",
      apoio: "Cada conta com o seu saldo inicial e a data a que ele se refere.",
      feito: contas > 0,
      detalhe: contas > 0 ? `${contas} ${contas === 1 ? "conta cadastrada" : "contas cadastradas"}` : "Nenhuma conta ainda",
      destino: "/organizacao",
      acao: "Abrir",
    },
    {
      icone: UploadIcon,
      titulo: "Extrato",
      apoio: "Importar OFX ou CSV do internet banking, quantas vezes precisar.",
      feito: lancamentos > 0,
      detalhe: lancamentos > 0 ? `${lancamentos.toLocaleString("pt-BR")} lançamentos no razão` : "Nada importado ainda",
      destino: "/lancamentos",
      acao: "Importar",
    },
  ];

  return (
    <>
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
        <div>
          <h2 className="text-[16px] font-bold tracking-[-.01em]">Os passos do primeiro acesso</h2>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-[#4C6355]">
            Cada um pode ser refeito quantas vezes você quiser, e nenhum deles apaga o que já existe —
            cadastrar outra conta ou importar outro extrato só acrescenta.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {passos.map(passo => {
            const Icone = passo.icone;
            return (
              <article key={passo.titulo} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#E3EBE6] p-4">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${passo.feito ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#F1F4F2] text-[#4C6355]"}`}>
                  <Icone size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block text-[13.5px]">{passo.titulo}</strong>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-[#4C6355]">{passo.apoio}</span>
                </div>
                {/* O estado aparece em texto, não só na cor do ícone: "verde
                    quer dizer feito" é uma convenção que ninguém explicou. */}
                <span className={`text-[12.5px] ${passo.feito ? "font-semibold text-[#0A7A42]" : "text-[#8A968D]"}`}>
                  {passo.detalhe}
                </span>
                <button
                  type="button"
                  onClick={() => setLocation(passo.destino)}
                  className="flex h-10 items-center gap-1.5 rounded-[12px] border border-[#E3EBE6] px-4 text-[13px] font-semibold text-[#4C6355] transition hover:border-[#12B85C] hover:bg-[#F1FBF6] hover:text-[#0A7A42]"
                >
                  {passo.acao}
                  <ChevronRightIcon size={14} />
                </button>
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#E3EBE6] pt-4">
          <span className="text-[12.5px] text-[#8A968D]">
            Quer rever o que cada tela faz?
          </span>
          <button
            type="button"
            onClick={() => setTourAberto(true)}
            className="h-10 rounded-[12px] bg-[#12B85C] px-4 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E]"
          >
            Ver o tour de 90s
          </button>
        </div>
      </section>

      {tourAberto && <OnboardingTour onClose={() => setTourAberto(false)} />}
    </>
  );
}
