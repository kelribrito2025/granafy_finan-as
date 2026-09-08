/**
 * Os dois documentos jurídicos, no texto aprovado.
 *
 * Ficam separados da tela porque são texto, não interface: quem revisa um
 * termo não precisa passar por JSX para mexer numa cláusula. Cada seção vira
 * um item do índice lateral automaticamente.
 */
export type Section = { title: string; paragraphs: string[] };

export const COMPANY = {
  legalName: "GranaFy Tecnologia LTDA",
  taxId: "48.221.905/0001-72",
  updatedAt: "setembro de 2026",
};

export const TERMS_SECTIONS: Section[] = [
  {
    title: "1. Aceite dos termos",
    paragraphs: [
      "Estes Termos de Uso regem o acesso e a utilização da plataforma GranaFy, disponibilizada por GranaFy Tecnologia LTDA, inscrita no CNPJ sob o n.º 48.221.905/0001-72, com sede na Rua Lauro Linhares, 2055, Trindade, Florianópolis, Santa Catarina (a “GranaFy”), a você, pessoa física ou jurídica que contrata o serviço (o “Cliente”).",
      "1.1. Ao criar uma conta, iniciar o período de teste ou utilizar a plataforma, ainda que parcialmente, o Cliente declara ter lido, compreendido e aceito integralmente estes Termos e a Política de Privacidade.",
      "1.2. Caso não concorde com qualquer disposição aqui prevista, o Cliente deve interromper imediatamente o uso da plataforma.",
      "1.3. Estes Termos aplicam-se a todos os planos, incluindo o período gratuito de avaliação.",
    ],
  },
  {
    title: "2. Definições",
    paragraphs: [
      "2.1. Plataforma: o sistema de gestão financeira GranaFy, acessível pelo site granafy.com.br e por seus aplicativos.",
      "2.2. Conta: o cadastro individual e intransferível que dá acesso à Plataforma.",
      "2.3. Organização: cada empresa (CNPJ) cadastrada pelo Cliente dentro da Plataforma.",
      "2.4. Usuário: cada pessoa autorizada pelo Cliente a acessar uma Organização, com o perfil de permissão que lhe for atribuído.",
      "2.5. Dados do Cliente: lançamentos, extratos, documentos, cadastros e demais informações inseridas ou importadas pelo Cliente.",
      "2.6. Instituição Participante: banco, cooperativa, adquirente ou instituição de pagamento cujos dados o Cliente autoriza compartilhar com a GranaFy.",
    ],
  },
  {
    title: "3. Licença de uso",
    paragraphs: [
      "3.1. A GranaFy concede ao Cliente licença de uso não exclusiva, não transferível e revogável da Plataforma, na modalidade software como serviço (SaaS), limitada ao plano contratado e válida enquanto vigorar a contratação.",
      "3.2. A licença não implica cessão de código-fonte, venda ou transferência de propriedade sobre qualquer elemento da Plataforma.",
      "3.3. A GranaFy poderá evoluir, alterar ou descontinuar funcionalidades, comunicando previamente o Cliente quando a mudança afetar de forma relevante o uso contratado.",
    ],
  },
  {
    title: "4. Cadastro e conta",
    paragraphs: [
      "4.1. O Cliente é responsável pela veracidade e pela atualização dos dados informados no cadastro, inclusive razão social, CNPJ, endereço e e-mail de contato financeiro.",
      "4.2. As credenciais de acesso são pessoais. O Cliente responde por todo uso feito com as suas credenciais e deve comunicar imediatamente qualquer suspeita de acesso indevido.",
      "4.3. A GranaFy recomenda a ativação da autenticação em dois fatores para todos os Usuários com perfil de administrador.",
      "4.4. O Cliente é o controlador dos acessos dentro de cada Organização e responde pela concessão e revogação de permissões a sócios, colaboradores e contadores.",
    ],
  },
  {
    title: "5. Restrições de uso",
    paragraphs: [
      "5.1. É vedado ao Cliente e aos seus Usuários: (a) realizar engenharia reversa, descompilar ou tentar obter o código-fonte da Plataforma; (b) sublicenciar, revender, alugar ou ceder o acesso a terceiros não autorizados; (c) utilizar a Plataforma para atividade ilícita, fraude, lavagem de dinheiro ou ocultação patrimonial; (d) inserir conteúdo que viole direitos de terceiros; (e) empregar robôs, raspagem ou automação não autorizada para extrair dados em massa.",
      "5.2. O descumprimento deste item autoriza a suspensão imediata do acesso, sem prejuízo das medidas legais aplicáveis.",
    ],
  },
  {
    title: "6. Planos, teste e pagamento",
    paragraphs: [
      "6.1. Os planos, limites e preços vigentes são os publicados na página de planos da GranaFy no momento da contratação.",
      "6.2. O período de avaliação gratuita não exige cartão de crédito e converte-se em plano pago apenas com a contratação expressa pelo Cliente.",
      "6.3. A assinatura é pré-paga e renova-se automaticamente ao fim de cada ciclo (mensal ou anual), até que o Cliente solicite o cancelamento.",
      "6.4. O não pagamento por mais de 10 (dez) dias corridos autoriza a suspensão do acesso; após 60 (sessenta) dias, a GranaFy poderá encerrar a Conta, observado o direito à exportação previsto no item 14.",
      "6.5. Reajustes serão comunicados com pelo menos 30 (trinta) dias de antecedência e valerão a partir do ciclo seguinte.",
      "6.6. Impostos e emissão de nota fiscal seguem a legislação aplicável ao domicílio da GranaFy.",
    ],
  },
  {
    title: "7. Conexão bancária e Open Finance",
    paragraphs: [
      "7.1. A conexão com Instituições Participantes ocorre por consentimento expresso do Cliente, no ambiente da própria instituição, nos termos da regulamentação de Open Finance.",
      "7.2. O consentimento concedido à GranaFy é exclusivamente de leitura. A Plataforma não inicia pagamentos, não movimenta saldo, não altera cadastros bancários e não solicita senha de conta ou cartão.",
      "7.3. O Cliente pode revogar o consentimento a qualquer momento, na Plataforma ou diretamente na instituição, cessando a partir daí a atualização automática dos extratos.",
      "7.4. A GranaFy não responde por indisponibilidade, atraso, inconsistência ou interrupção causados pela Instituição Participante ou pelo provedor de dados.",
      "7.5. Para instituições não integradas, o Cliente pode importar extratos em OFX ou CSV, permanecendo responsável pela integridade dos arquivos enviados.",
    ],
  },
  {
    title: "8. Obrigações do usuário",
    paragraphs: [
      "8.1. Utilizar a Plataforma conforme a legislação vigente e estes Termos.",
      "8.2. Conferir a classificação contábil e fiscal dos lançamentos, sugeridos ou não pela Plataforma, antes de utilizá-los para fins societários, fiscais ou de tomada de decisão.",
      "8.3. Manter cópias de segurança dos documentos que julgar essenciais e cumprir os prazos legais de guarda de documentos fiscais.",
      "8.4. Responder pelos dados que insere, inclusive pelo tratamento de dados pessoais de terceiros que vier a registrar na Plataforma.",
    ],
  },
  {
    title: "9. Obrigações da GranaFy e nível de serviço",
    paragraphs: [
      "9.1. Disponibilizar a Plataforma com meta de disponibilidade mensal de 99,5%, excluídas as janelas de manutenção programada, comunicadas com antecedência mínima de 24 (vinte e quatro) horas.",
      "9.2. Prestar suporte por e-mail e canal de mensagens em dias úteis, das 9h às 18h (horário de Brasília), com primeiro retorno em até 1 (um) dia útil.",
      "9.3. Adotar medidas técnicas e administrativas de segurança, incluindo criptografia em trânsito e em repouso, controle de acesso e registro de auditoria.",
      "9.4. Comunicar o Cliente sobre incidentes de segurança que possam acarretar risco relevante, nos prazos e na forma da legislação de proteção de dados.",
      "9.5. A GranaFy é fornecedora de ferramenta de organização financeira e não presta serviços de contabilidade, auditoria, consultoria tributária ou assessoria de investimentos. Os relatórios gerados não substituem a atuação de profissional habilitado.",
    ],
  },
  {
    title: "10. Propriedade intelectual",
    paragraphs: [
      "10.1. A Plataforma, sua marca, identidade visual, código, estrutura de banco de dados, telas e documentação são de propriedade exclusiva da GranaFy e protegidos pela legislação de direito autoral e de propriedade industrial.",
      "10.2. Os Dados do Cliente permanecem de titularidade do Cliente. A GranaFy os trata apenas para prestar o serviço, nos limites da Política de Privacidade.",
      "10.3. A GranaFy poderá utilizar dados agregados e anonimizados, sem qualquer possibilidade de identificação do Cliente, para estatísticas e melhoria do produto.",
    ],
  },
  {
    title: "11. Confidencialidade",
    paragraphs: [
      "11.1. Cada parte se obriga a manter sigilo sobre informações confidenciais a que tiver acesso em razão da relação contratual, adotando o mesmo cuidado que aplica às suas próprias informações.",
      "11.2. A obrigação de sigilo permanece por 5 (cinco) anos após o término da contratação e não se aplica a informações de domínio público ou cuja divulgação seja exigida por autoridade competente.",
    ],
  },
  {
    title: "12. Limitação de responsabilidade",
    paragraphs: [
      "12.1. A GranaFy não responde por decisões de negócio, apuração de tributos ou obrigações acessórias tomadas com base nas informações da Plataforma sem a devida conferência pelo Cliente ou por seu contador.",
      "12.2. Salvo em caso de dolo ou culpa grave, a responsabilidade total da GranaFy fica limitada ao valor efetivamente pago pelo Cliente nos 12 (doze) meses anteriores ao evento que originou a reclamação.",
      "12.3. A GranaFy não responde por lucros cessantes, perda de oportunidade, danos indiretos ou por indisponibilidade decorrente de caso fortuito, força maior, falha de conexão do Cliente ou de terceiros.",
    ],
  },
  {
    title: "13. Vigência e cancelamento",
    paragraphs: [
      "13.1. A contratação vigora por prazo indeterminado, renovando-se automaticamente a cada ciclo.",
      "13.2. O Cliente pode cancelar a qualquer momento, pela própria Plataforma, com efeito no fim do ciclo já pago. Não há multa nem carência.",
      "13.3. Nos planos anuais pagos à vista, o cancelamento antecipado dá direito à devolução proporcional dos meses não utilizados, descontado o desconto concedido em relação ao preço mensal.",
      "13.4. A GranaFy poderá rescindir a contratação em caso de descumprimento destes Termos, mediante notificação e prazo de 10 (dez) dias para regularização, quando cabível.",
    ],
  },
  {
    title: "14. Devolução dos dados",
    paragraphs: [
      "14.1. Durante toda a vigência, o Cliente pode exportar seus dados em CSV e PDF, sem custo e sem limite de solicitações.",
      "14.2. Após o encerramento, os Dados do Cliente permanecem disponíveis para exportação por 30 (trinta) dias e são eliminados dos ambientes ativos em até 90 (noventa) dias, ressalvadas as hipóteses de guarda obrigatória previstas em lei.",
    ],
  },
  {
    title: "15. Alterações destes termos",
    paragraphs: [
      "15.1. Estes Termos podem ser atualizados para refletir mudanças legais, regulatórias ou de produto.",
      "15.2. Alterações relevantes serão comunicadas por e-mail e na Plataforma com pelo menos 30 (trinta) dias de antecedência. O uso após a entrada em vigor caracteriza aceite; caso discorde, o Cliente pode cancelar sem ônus.",
    ],
  },
  {
    title: "16. Legislação e foro",
    paragraphs: [
      "16.1. Estes Termos são regidos pelas leis brasileiras, em especial a Lei n.º 10.406/2002, a Lei n.º 12.965/2014 (Marco Civil da Internet) e a Lei n.º 13.709/2018 (LGPD).",
      "16.2. Fica eleito o foro da Comarca de Florianópolis, Santa Catarina, para dirimir controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.",
      "16.3. Dúvidas sobre estes Termos: juridico@granafy.com.br.",
      "O texto acima foi redigido como ponto de partida para a GranaFy e não substitui a revisão por advogado. Confirme prazos, limites de responsabilidade, política de reembolso e metas de SLA antes de publicar.",
    ],
  },
];

export const PRIVACY_SECTIONS: Section[] = [
  {
    title: "1. Quem somos e a quem se aplica",
    paragraphs: [
      "Esta Política de Privacidade descreve como a GranaFy Tecnologia LTDA (CNPJ 48.221.905/0001-72) coleta, usa, compartilha, armazena e protege dados pessoais e financeiros tratados por meio da plataforma GranaFy.",
      "1.1. Aplica-se ao site granafy.com.br, aos aplicativos e a todas as funcionalidades da Plataforma.",
      "1.2. Para interpretação desta Política, valem as definições dos Termos de Uso.",
      "1.3. Esta Política não se aplica a serviços de terceiros acessados a partir da Plataforma, como o ambiente da sua instituição financeira, que possuem políticas próprias.",
    ],
  },
  {
    title: "2. Segurança dos dados",
    paragraphs: [
      "2.1. Todo o tráfego entre o seu dispositivo e a Plataforma é criptografado (HTTPS/TLS), e os dados em repouso são armazenados de forma criptografada.",
      "2.2. Não vendemos, alugamos ou cedemos os seus dados pessoais ou financeiros para fins comerciais ou publicitários.",
      "2.3. O acesso interno aos dados de um cliente é restrito, registrado em log de auditoria e ocorre apenas quando necessário para prestar suporte solicitado por você ou para cumprir obrigação legal.",
      "2.4. Oferecemos autenticação em dois fatores, controle de sessões e perfis de permissão para que você limite o que cada usuário vê.",
      "2.5. Em caso de incidente de segurança com risco relevante aos titulares, comunicaremos você e a Autoridade Nacional de Proteção de Dados nos prazos legais.",
    ],
  },
  {
    title: "3. Informações que coletamos",
    paragraphs: [
      "3.1. Dados de cadastro: nome, e-mail, telefone, CPF ou CNPJ, razão social, endereço e dados de cobrança.",
      "3.2. Dados financeiros da empresa: extratos, saldos, lançamentos, títulos a pagar e receber, categorias, centros de custo, bens patrimoniais e documentos anexados por você.",
      "3.3. Dados de terceiros inseridos por você: nome e identificação de clientes, fornecedores e colaboradores vinculados aos seus lançamentos. Nesses casos, você atua como controlador dessas informações.",
      "3.4. Dados técnicos: endereço IP, tipo de dispositivo e navegador, páginas acessadas, data, hora e duração do acesso — usados para segurança, prevenção a fraude e diagnóstico.",
      "3.5. Dados de suporte: mensagens, anexos e gravações de atendimento que você nos envia.",
      "3.6. Não coletamos dados pessoais sensíveis e não solicitamos senha de acesso ao seu banco.",
    ],
  },
  {
    title: "4. Como usamos as informações",
    paragraphs: [
      "4.1. Prestar e operar as funcionalidades contratadas: consolidar saldos, conciliar extratos, gerar relatórios, DRE, balanço e projeções.",
      "4.2. Sugerir categorias e pares de conciliação a partir dos seus próprios históricos e regras — sempre sujeitos à sua confirmação.",
      "4.3. Autenticar acessos, prevenir fraude e proteger a Plataforma.",
      "4.4. Emitir cobrança e nota fiscal, e cumprir obrigações contábeis e fiscais da própria GranaFy.",
      "4.5. Comunicar avisos operacionais, mudanças de termos e alertas de segurança. Comunicações de marketing dependem do seu consentimento e podem ser recusadas a qualquer momento.",
      "4.6. Produzir estatísticas e melhorar o produto, exclusivamente a partir de dados agregados e anonimizados, sem possibilidade de identificar você ou a sua empresa.",
      "4.7. Não realizamos decisão automatizada com efeito jurídico sobre você, como concessão ou negativa de crédito.",
    ],
  },
  {
    title: "5. Bases legais do tratamento",
    paragraphs: [
      "5.1. Execução de contrato (art. 7.º, V, LGPD): operação das funcionalidades, cobrança e suporte.",
      "5.2. Cumprimento de obrigação legal ou regulatória (art. 7.º, II): guarda de registros de acesso e obrigações fiscais.",
      "5.3. Consentimento (art. 7.º, I): compartilhamento de dados bancários via Open Finance e envio de comunicações de marketing.",
      "5.4. Legítimo interesse (art. 7.º, IX): segurança da informação, prevenção a fraude e melhoria do produto com dados agregados.",
      "5.5. Exercício regular de direitos (art. 7.º, VI): defesa em processo judicial, administrativo ou arbitral.",
    ],
  },
  {
    title: "6. Open Finance e consentimento bancário",
    paragraphs: [
      "6.1. A conexão com bancos, cooperativas e adquirentes é feita por consentimento que você concede no ambiente da própria instituição, com prazo e escopo definidos.",
      "6.2. O escopo solicitado pela GranaFy é somente de leitura de dados cadastrais, saldos e extratos. Não pedimos permissão de iniciação de pagamento nem de alteração de dados.",
      "6.3. Você pode consultar, renovar ou revogar o consentimento a qualquer momento, na Plataforma ou na instituição. Revogado o consentimento, cessa a atualização automática; os dados já importados permanecem no seu histórico até que você os exclua.",
      "6.4. Utilizamos provedores de integração autorizados a operar no Open Finance brasileiro, que atuam como operadores e estão contratualmente obrigados a tratar os dados apenas conforme as nossas instruções.",
    ],
  },
  {
    title: "7. Compartilhamento de informações",
    paragraphs: [
      "7.1. Compartilhamos dados apenas com: (a) provedores de infraestrutura em nuvem e de integração bancária; (b) processadores de pagamento e emissores de nota fiscal; (c) ferramentas de suporte e comunicação; (d) usuários que você mesmo autoriza, como sócios e o seu contador.",
      "7.2. Todos os operadores atuam sob contrato, com obrigações de confidencialidade e segurança, e não podem usar os dados para finalidade própria.",
      "7.3. Podemos divulgar informações em caso de requisição judicial ou de autoridade competente, ou para defesa de direitos da GranaFy, informando você sempre que a lei permitir.",
      "7.4. Em reorganização societária, os dados podem ser transferidos ao sucessor, mantidas as condições desta Política.",
    ],
  },
  {
    title: "8. Cookies e tecnologias similares",
    paragraphs: [
      "8.1. Necessários: mantêm a sua sessão autenticada e protegem contra fraude. Não podem ser desativados sem inviabilizar o serviço.",
      "8.2. De preferência: guardam escolhas como tema claro ou escuro, empresa ativa e comportamento do menu lateral.",
      "8.3. Analíticos: medem uso agregado das telas para orientar melhorias. Dependem do seu consentimento e podem ser recusados no banner de cookies.",
      "8.4. Você pode gerenciar cookies no seu navegador; a exclusão dos necessários exigirá novo login.",
    ],
  },
  {
    title: "9. Retenção e eliminação",
    paragraphs: [
      "9.1. Mantemos os Dados do Cliente enquanto a conta estiver ativa.",
      "9.2. Após o encerramento, os dados ficam disponíveis para exportação por 30 (trinta) dias e são eliminados dos ambientes ativos em até 90 (noventa) dias; as cópias de segurança expiram em até 180 (cento e oitenta) dias.",
      "9.3. Registros de acesso são guardados por 6 (seis) meses, conforme o Marco Civil da Internet, e dados fiscais pelo prazo exigido pela legislação tributária.",
    ],
  },
  {
    title: "10. Direitos do titular",
    paragraphs: [
      "10.1. Você pode solicitar, a qualquer momento: confirmação da existência de tratamento; acesso aos dados; correção de dados incompletos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; informação sobre compartilhamento; revogação do consentimento; e revisão de decisões automatizadas.",
      "10.2. Atendemos as solicitações em até 15 (quinze) dias, pelo e-mail privacidade@granafy.com.br ou pela própria Plataforma.",
      "10.3. A exportação completa em CSV e PDF está disponível de forma autônoma, sem necessidade de pedido.",
      "10.4. Alguns dados podem ser mantidos mesmo após pedido de exclusão, quando houver obrigação legal de guarda ou necessidade para exercício regular de direitos.",
    ],
  },
  {
    title: "11. Transferência internacional",
    paragraphs: [
      "11.1. Os dados são hospedados preferencialmente em data centers localizados no Brasil.",
      "11.2. Quando algum operador tratar dados fora do país, a transferência observa as hipóteses do art. 33 da LGPD e é acompanhada de cláusulas contratuais de proteção equivalentes às exigidas pela legislação brasileira.",
    ],
  },
  {
    title: "12. Encarregado de dados",
    paragraphs: [
      "12.1. O Encarregado pelo Tratamento de Dados Pessoais (DPO) da GranaFy pode ser contatado em dpo@granafy.com.br.",
      "12.2. Cabe ao Encarregado receber comunicações de titulares e da autoridade nacional, prestar esclarecimentos e adotar providências.",
    ],
  },
  {
    title: "13. Alterações nesta política",
    paragraphs: [
      "13.1. Esta Política pode ser atualizada em razão de mudanças legais, regulatórias ou de produto.",
      "13.2. Alterações relevantes serão comunicadas por e-mail e na Plataforma com pelo menos 30 (trinta) dias de antecedência, e a versão vigente estará sempre datada nesta página.",
    ],
  },
  {
    title: "14. Contato",
    paragraphs: [
      "Privacidade e direitos do titular: privacidade@granafy.com.br Encarregado de dados (DPO): dpo@granafy.com.br Assuntos jurídicos: juridico@granafy.com.br",
      "GranaFy Tecnologia LTDA · Rua Lauro Linhares, 2055 — Trindade, Florianópolis, SC, CEP 88034-100.",
      "O texto acima foi redigido como ponto de partida para a GranaFy e não substitui a revisão por advogado ou pelo seu Encarregado de Dados. Confirme prazos de retenção, bases legais, lista de operadores e local de hospedagem antes de publicar.",
    ],
  },
];
