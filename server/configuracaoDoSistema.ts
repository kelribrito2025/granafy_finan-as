import { eq } from "drizzle-orm";
import { systemSettings } from "../drizzle/schema";
import {
  CHAVE_MOSTRAR_ASSINATURAS,
  CONFIGURACAO_PADRAO,
  booleanoDoTexto,
  textoDoBooleano,
  type ConfiguracaoDoSistema,
} from "@shared/sistema";
import { getDb } from "./db";

/*
 * A configuração do sistema, lida e gravada.
 *
 * Fica fora de `db.ts` pelo mesmo motivo que `admin/papeis.ts` fica: `db.ts` é
 * o lugar das consultas com escopo, e a sentinela de `guardas.test.ts` guarda
 * aquele arquivo. Estas duas funções não têm dono nem empresa — é justamente o
 * que define uma configuração do sistema —, e deixá-las lá diria à sentinela
 * que existe consulta legítima sem escopo naquele arquivo. Não existe.
 *
 * `ator` em vez de `userId`, como em `admin/papeis.ts`: quem desligou é
 * carimbo de auditoria, não filtro de WHERE. A distinção é a mesma que o
 * estudo do acesso do contador vai precisar.
 */

async function conexao() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

/**
 * O que vale agora, para todo mundo.
 *
 * Nunca lança por causa de linha ausente: uma instalação que ainda não passou
 * pelo interruptor lê o padrão, e o padrão é mostrar. Esconder uma tela exige
 * alguém ter dito que esconde.
 */
export async function lerConfiguracaoDoSistema(): Promise<ConfiguracaoDoSistema> {
  const db = await conexao();
  const [linha] = await db
    .select({ valor: systemSettings.settingValue })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, CHAVE_MOSTRAR_ASSINATURAS))
    .limit(1);

  return {
    mostrarAssinaturas: booleanoDoTexto(linha?.valor, CONFIGURACAO_PADRAO.mostrarAssinaturas),
  };
}

/**
 * Liga ou desliga Planos e Assinatura — no app do cliente e no menu do admin.
 *
 * `onDuplicateKeyUpdate` porque a linha pode não existir: a tabela nasce vazia
 * e a primeira alternância é que a cria. Um INSERT seco falharia na segunda
 * vez, e um UPDATE seco não faria nada na primeira.
 */
export async function definirMostrarAssinaturas(mostrar: boolean, ator: number) {
  const db = await conexao();
  const valor = textoDoBooleano(mostrar);

  await db
    .insert(systemSettings)
    .values({
      settingKey: CHAVE_MOSTRAR_ASSINATURAS,
      settingValue: valor,
      updatedByUserId: ator,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: valor, updatedByUserId: ator } });

  console.warn(`[admin] mostrarAssinaturas=${valor} por ${ator}`);
  return { mostrarAssinaturas: mostrar };
}
