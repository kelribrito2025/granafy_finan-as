import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { AdminHeader, AdminShell, Avatar, Busca, Cartao, Kpi, Pilula, dataCurta, haQuanto } from "./comum";
import { ModalDeExclusao } from "./ModalDeExclusao";

export default function AdminUsuarios() {
  const [busca, setBusca] = useState("");
  const { user } = useAuth();
  const [apagando, setApagando] = useState<number | null>(null);
  const lista = trpc.admin.usuarios.listar.useQuery({ busca }, { placeholderData: anterior => anterior });
  const d = lista.data;

  return (
    <AdminShell>
      <AdminHeader titulo="Usuários" subtitulo={d ? `${d.total} ${d.total === 1 ? "login" : "logins"} · ${d.admins} ${d.admins === 1 ? "admin" : "admins"} do sistema` : "carregando…"}>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome ou e-mail" />
      </AdminHeader>

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi rotulo="Logins" valor={d?.total ?? "…"} />
        <Kpi rotulo="Entraram em 7 dias" valor={d?.ativos7d ?? "…"} tom="bom" />
        <Kpi rotulo="Admins do sistema" valor={d?.admins ?? "…"} />
      </section>

      <Cartao>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[.08em] text-[#8A968D]">
                <th className="pb-2 pr-3 font-semibold">Pessoa</th><th className="pb-2 pr-3 font-semibold">Entrada</th><th className="pb-2 pr-3 font-semibold">Papel</th>
                <th className="pb-2 pr-3 text-right font-semibold">Empresas</th><th className="pb-2 pr-3 text-right font-semibold">Cadastro</th><th className="pb-2 pr-3 text-right font-semibold">Último acesso</th><th className="pb-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {(d?.itens ?? []).map(u => (
                <tr key={u.id} className="border-t border-[#F1F4F2] transition hover:bg-[#F8FAF9]">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-3">
                      <Avatar nome={u.name ?? u.email ?? "?"} tom={u.role === "admin" ? "escuro" : "claro"} />
                      <span className="flex min-w-0 flex-col"><span className="truncate text-[13.5px] font-semibold">{u.name ?? "sem nome"}</span><span className="truncate text-[12px] text-[#8A968D]">{u.email}</span></span>
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-[12.5px] text-[#4C6355]">{u.loginMethod === "password" ? "senha" : u.loginMethod ?? "—"}</td>
                  <td className="py-2.5 pr-3">{u.role === "admin" ? <Pilula tom="aviso">Admin do sistema</Pilula> : <Pilula tom="neutro">Usuário</Pilula>}</td>
                  <td className="py-2.5 pr-3 text-right text-[13px]">{u.empresas}</td>
                  <td className="py-2.5 pr-3 text-right text-[13px] text-[#4C6355]">{dataCurta(u.createdAt)}</td>
                  <td className="py-2.5 pr-3 text-right text-[13px] text-[#4C6355]">{haQuanto(u.lastSignedIn)}</td>
                  <td className="py-2.5 text-right">
                    {/*
                      Admin do sistema e o próprio login não têm o botão: o
                      servidor recusa os dois de qualquer jeito, e oferecer o
                      caminho seria mentir sobre o que a tela pode fazer.
                    */}
                    <button
                      type="button"
                      aria-label={`Apagar ${u.email ?? u.name ?? `#${u.id}`}`}
                      title={u.role === "admin" ? "Admin do sistema não é apagado pela tela" : u.id === user?.id ? "Você não apaga o próprio login" : "Apagar este login"}
                      onClick={() => setApagando(u.id)}
                      disabled={u.role === "admin" || u.id === user?.id}
                      className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#B3261E] transition hover:bg-[#FDECEA] disabled:pointer-events-none disabled:text-[#C9D4CD]"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {d && d.itens.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-[13px] text-[#8A968D]">Nenhum usuário corresponde à busca.</td></tr>}
            </tbody>
          </table>
        </div>
      </Cartao>

      {apagando !== null && (
        <ModalDeExclusao alvo="usuario" id={apagando} aoFechar={() => setApagando(null)} aoApagar={() => setApagando(null)} />
      )}
    </AdminShell>
  );
}
