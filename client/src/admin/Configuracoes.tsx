import { trpc } from "@/lib/trpc";
import { toast } from "@/lib/toast";
import { DESCONTO_ANUAL, DIAS_DE_TESTE, PLANOS, PLANO_DO_TESTE } from "@shared/planos";
import { useState } from "react";
import { AdminHeader, AdminShell, Avatar, Cartao, Interruptor, Kpi, Pilula, Traco, dataCurta, haQuanto } from "./comum";
import { useMostrarAssinaturas } from "@/lib/sistema";

/*
 * As configurações do sistema, com fonte de verdade.
 *
 * Tudo nesta tela vem do banco ou do ambiente do processo. O que não tem
 * fonte não virou número: a contagem de empresas por plano depende da tabela
 * de assinaturas, que ainda não existe, e por isso aparece como "—" com a
 * razão — a mesma regra do resto do admin.
 *
 * Os preços vivem em `shared/planos.ts`, não aqui: quando a assinatura
 * existir, é de lá que ela vai ler. Preço repetido em dois arquivos vira
 * preço diferente em dois arquivos.
 */
export function AdminConfiguracoes() {
  const consulta = trpc.admin.configuracoes.useQuery(undefined, { staleTime: 30_000 });
  const d = consulta.data;
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const mostrarAssinaturas = useMostrarAssinaturas();
  const alternarAssinaturas = trpc.admin.definirMostrarAssinaturas.useMutation({
    onSuccess: async resultado => {
      toast.success(resultado.mostrarAssinaturas ? "Planos e Assinatura ligados" : "Planos e Assinatura desligados", {
        description: resultado.mostrarAssinaturas
          ? "As duas telas voltaram para o menu do admin e para os clientes."
          : "As duas telas sumiram do menu do admin e dos clientes.",
      });
      /* Todo mundo lê a mesma consulta: invalidar aqui redesenha a barra
         lateral e o cartão abaixo no mesmo instante. */
      await utils.configuracaoDoSistema.invalidate();
    },
    onError: erro => toast.error("Não deu para mudar", { description: erro.message }),
  });

  const recarregar = async () => {
    await Promise.all([utils.admin.configuracoes.invalidate(), utils.admin.usuarios.listar.invalidate()]);
  };
  const promover = trpc.admin.usuarios.promover.useMutation({
    onSuccess: async pessoa => {
      toast.success("Agora é admin do sistema", { description: pessoa.email ?? undefined });
      setEmail("");
      await recarregar();
    },
    onError: erro => toast.error("Não deu para promover", { description: erro.message }),
  });
  const rebaixar = trpc.admin.usuarios.rebaixar.useMutation({
    onSuccess: async pessoa => {
      toast.success("Voltou a ser usuário comum", { description: pessoa.email ?? undefined });
      await recarregar();
    },
    onError: erro => toast.error("Não deu para tirar o papel", { description: erro.message }),
  });

  const producao = d?.ambiente.modo === "production";
  const emailOk = Boolean(d?.email.configurado);

  return (
    <AdminShell>
      <AdminHeader
        titulo="Configurações"
        subtitulo={d ? `${d.ambiente.banco ?? "banco não identificado"} · servidor no ar ${haQuanto(d.ambiente.noArDesde)}` : "carregando…"}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Empresas" valor={d?.numeros.empresas ?? "…"} apoio="cadastradas no sistema" tom="escuro" />
        <Kpi rotulo="Logins" valor={d?.numeros.usuarios ?? "…"} apoio={d ? `${d.equipe.length} ${d.equipe.length === 1 ? "admin" : "admins"}` : undefined} />
        <Kpi rotulo="Lançamentos" valor={d ? d.numeros.lancamentos.toLocaleString("pt-BR") : "…"} apoio="em todas as empresas" />
        <Kpi
          rotulo="Ambiente"
          valor={d ? (producao ? "Produção" : "Desenvolvimento") : "…"}
          apoio={d?.ambiente.banco ?? undefined}
          tom={producao ? "bom" : "neutro"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Cartao titulo="Planos e Assinatura">
          <div className="flex items-start gap-3 rounded-[14px] bg-[#F8FAF9] p-3.5">
            <Interruptor
              ligado={mostrarAssinaturas}
              rotulo="Mostrar Assinaturas e Planos"
              onAlternar={mostrar => {
                /* Um clique por vez: sem isto, dois cliques seguidos mandam
                   duas gravações e a última a chegar é que vale — nem sempre
                   a última clicada. */
                if (!alternarAssinaturas.isPending) alternarAssinaturas.mutate({ mostrar });
              }}
            />
            <span className="flex flex-col gap-0.5">
              <strong className="text-[13.5px]">Mostrar Assinaturas e Planos</strong>
              <span className="text-[12.5px] leading-relaxed text-[#4C6355]">
                Desligado, as abas <strong>Planos</strong> e <strong>Assinatura</strong> somem das
                Configurações do cliente e do menu do perfil dele, a área de Assinaturas some da barra
                lateral do admin e o cartão de planos some desta tela. Nada é apagado: tudo volta
                quando você religar.
              </span>
            </span>
          </div>
          <p className="text-[12px] leading-relaxed text-[#8A968D]">
            Esta escolha vale para o <strong>sistema inteiro</strong>: fica gravada no banco e alcança
            todos os clientes, os outros admins e os outros computadores. Quem já estiver com a tela
            aberta vê a mudança no próximo carregamento.
          </p>
        </Cartao>

        {mostrarAssinaturas && <Cartao titulo="Planos e preços" acao={<span className="text-[12px] text-[#8A968D]">anual −{Math.round(DESCONTO_ANUAL * 100)}%</span>}>
          {PLANOS.map(plano => (
            <div key={plano.chave} className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] p-3.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <strong className="text-[14px]">{plano.nome}</strong>
                  {plano.chave === PLANO_DO_TESTE && <Pilula tom="bom">teste de {DIAS_DE_TESTE} dias</Pilula>}
                </span>
                <span className="text-[12px] text-[#8A968D]">{plano.descricao}</span>
              </span>
              <span className="flex flex-col items-end">
                <strong className="text-[20px] tracking-[-.02em]">R$ {plano.preco}<span className="text-[12px] font-normal text-[#8A968D]">/mês</span></strong>
                <span className="text-[11px] text-[#8A968D]"><Traco razao="sem fonte: a tabela de assinaturas ainda não existe" /> contas</span>
              </span>
            </div>
          ))}
          <p className="text-[12px] leading-relaxed text-[#8A968D]">
            Os preços moram em <code className="rounded bg-[#F1F4F2] px-1 py-0.5 text-[11.5px]">shared/planos.ts</code> e já são os definitivos.
            Quantas empresas estão em cada um só dá para dizer quando a assinatura tiver tabela — até lá, traço.
          </p>
        </Cartao>}

        <Cartao titulo="Equipe do admin" acao={<span className="text-[12px] text-[#8A968D]">quem tem role = admin agora</span>}>
          {consulta.isPending && <p className="text-[13px] text-[#8A968D]">carregando…</p>}
          {(d?.equipe ?? []).map(pessoa => (
            <div key={pessoa.id} className="flex items-center gap-3 rounded-[14px] bg-[#F8FAF9] p-3">
              <Avatar nome={pessoa.name ?? pessoa.email ?? "?"} tom="escuro" />
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-[13.5px]">{pessoa.name ?? "sem nome"}</strong>
                <span className="truncate text-[12px] text-[#8A968D]">{pessoa.email} · #{pessoa.id} · desde {dataCurta(pessoa.createdAt)}</span>
              </span>
              <button
                type="button"
                onClick={() => rebaixar.mutate({ id: pessoa.id })}
                disabled={rebaixar.isPending}
                className="shrink-0 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold text-[#8A968D] transition hover:bg-[#FDECEA] hover:text-[#B3261E] disabled:pointer-events-none disabled:opacity-40"
              >
                Tirar o papel
              </button>
            </div>
          ))}

          {/*
            Promover pede o e-mail inteiro, digitado, e não um nome escolhido
            numa lista: admin do sistema enxerga todas as empresas, e isso
            não se concede por engano de clique.
          */}
          <form
            className="flex flex-wrap items-end gap-2.5 border-t border-[#F1F4F2] pt-3.5"
            onSubmit={evento => { evento.preventDefault(); if (email.trim()) promover.mutate({ email: email.trim() }); }}
          >
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className="text-[12px] text-[#4C6355]">Promover pelo e-mail exato do login</span>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                autoComplete="off"
                placeholder="pessoa@empresa.com.br"
                className="h-10 rounded-[12px] bg-white px-3.5 text-[13px] outline-none ring-1 ring-[#DFE6E1] focus:ring-2 focus:ring-[#12B85C]"
              />
            </label>
            <button
              type="submit"
              disabled={!email.trim() || promover.isPending}
              className="h-10 rounded-[12px] bg-[#0B1F14] px-4 text-[13px] font-bold text-white transition hover:bg-[#153021] disabled:pointer-events-none disabled:opacity-40"
            >
              {promover.isPending ? "Promovendo…" : "Tornar admin"}
            </button>
          </form>
          <p className="text-[12px] leading-relaxed text-[#8A968D]">
            O servidor recusa duas coisas sempre: mexer no próprio papel e rebaixar o último admin.
          </p>
        </Cartao>

        <Cartao titulo="Integrações">
          <Integracao
            nome="Envio de e-mail"
            texto={d ? (emailOk ? `Resend · remetente ${d.email.remetente}` : "Resend · falta RESEND_API_KEY ou o remetente") : "Resend · transacionais"}
            situacao={emailOk ? "Conectado" : "Não configurado"}
            tom={emailOk ? "bom" : "ruim"}
          />
          <Integracao
            nome="Endereço público"
            texto={d?.email.enderecoPublico ?? "sem PUBLIC_URL: o e-mail sai sem logo e com o botão sem destino"}
            situacao={d?.email.enderecoPublico ? "Definido" : "Faltando"}
            tom={d?.email.enderecoPublico ? "bom" : "ruim"}
          />
          <Integracao nome="Gateway de pagamento" texto="cobrança recorrente e retentativas" situacao="Não configurado" tom="neutro" />
          <Integracao nome="Emissão de nota fiscal" texto="ainda emitindo manualmente" situacao="Não configurado" tom="neutro" />
          <Integracao nome="Analytics de produto" texto="marcos de ativação e coortes" situacao="Não configurado" tom="neutro" />
        </Cartao>

        <Cartao titulo="Regras do teste grátis">
          <p className="text-[13px] leading-relaxed text-[#28382E]">
            Cadastro novo entra no plano <strong>{PLANOS.find(p => p.chave === PLANO_DO_TESTE)?.nome}</strong> liberado
            por <strong>{DIAS_DE_TESTE} dias</strong>, sem cartão. As treze empresas que já existiam nascem ativas no mesmo plano.
          </p>
          <p className="rounded-[12px] border border-dashed border-[#E0C48A] bg-[#FFF9EB] p-3.5 text-[12.5px] font-semibold leading-relaxed text-[#8A4B00]">
            A regra está decidida e escrita em <code className="rounded bg-white/60 px-1 py-0.5">shared/planos.ts</code>, mas ainda
            não há onde gravar a assinatura de cada empresa — então nada nesta tela liga ou desliga o teste. Isso chega com a
            tabela, na sentada das assinaturas.
          </p>
          <p className="text-[12px] leading-relaxed text-[#8A968D]">
            Estender o teste automaticamente, pedir cartão no cadastro e suspender após recusas são decisões que dependem da
            mesma tabela. Enquanto ela não existe, um interruptor aqui seria enfeite.
          </p>
        </Cartao>
      </div>

      <Cartao titulo="Este servidor">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Linha rotulo="Modo" valor={d ? d.ambiente.modo : "…"} />
          <Linha rotulo="Banco" valor={d?.ambiente.banco ?? <Traco razao="a URL do banco não foi lida" />} />
          <Linha rotulo="No ar desde" valor={d ? `${dataCurta(d.ambiente.noArDesde)} ${new Date(d.ambiente.noArDesde).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "…"} />
          <Linha rotulo="Hora do servidor" valor={d ? new Date(d.ambiente.agora).toLocaleString("pt-BR") : "…"} />
        </div>
        {d && !producao && (
          <p className="rounded-[12px] bg-[#FFF9EB] p-3 text-[12.5px] font-semibold text-[#8A4B00]">
            Este processo está em modo de desenvolvimento. Em produção o modo tem que ser "production".
          </p>
        )}
      </Cartao>
    </AdminShell>
  );
}

function Integracao({ nome, texto, situacao, tom }: { nome: string; texto: string; situacao: string; tom: "bom" | "neutro" | "ruim" }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] p-3.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="text-[13.5px]">{nome}</strong>
        <span className="truncate text-[12px] text-[#8A968D]">{texto}</span>
      </span>
      <Pilula tom={tom}>{situacao}</Pilula>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">{rotulo}</span>
      <span className="text-[13.5px]">{valor}</span>
    </div>
  );
}
