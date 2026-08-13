// ============================================================================
// TEMPLATES DE DOCUMENTOS PADRÃO
// ============================================================================

export const DOCUMENT_TEMPLATES = {
  contrato_honorarios: {
    name: 'Contrato de Honorários',
    description: 'Contrato completo de prestação de serviços advocatícios',
    fields: [
      { field: 'contratante_nome', label: 'Nome completo do CONTRATANTE', required: true },
      { field: 'contratante_nacionalidade', label: 'Nacionalidade do CONTRATANTE', required: true, default: 'brasileiro(a)' },
      { field: 'contratante_estado_civil', label: 'Estado civil do CONTRATANTE', required: true },
      { field: 'contratante_profissao', label: 'Profissão do CONTRATANTE', required: true },
      { field: 'contratante_rg', label: 'RG do CONTRATANTE', required: true },
      { field: 'contratante_cpf', label: 'CPF do CONTRATANTE', required: true },
      { field: 'contratante_nascimento', label: 'Data de nascimento do CONTRATANTE', required: false },
      { field: 'contratante_endereco', label: 'Endereço do CONTRATANTE (rua, nº, bairro)', required: true },
      { field: 'contratante_cidade', label: 'Cidade do CONTRATANTE', required: true },
      { field: 'contratante_estado', label: 'UF do CONTRATANTE', required: true, default: 'Bahia' },
      { field: 'contratante_cep', label: 'CEP do CONTRATANTE', required: false },

      { field: 'contratado1_nome', label: 'Nome do advogado CONTRATADO 1', required: true },
      { field: 'contratado1_oab', label: 'OAB/UF do advogado 1', required: true },
      { field: 'contratado2_nome', label: 'Nome do advogado CONTRATADO 2 (opcional)', required: false },
      { field: 'contratado2_oab', label: 'OAB/UF do advogado 2', required: false },
      { field: 'escritorio_endereco', label: 'Endereço do escritório', required: true },

      { field: 'objeto', label: 'Objeto do contrato (qual ação/assunto)', required: true },
      { field: 'empresa_re', label: 'Nome da empresa-ré (se houver)', required: false },
      { field: 'percentual_honorarios', label: 'Percentual de honorários de êxito (%)', required: true, default: '30' },

      { field: 'data', label: 'Data do contrato', required: true, default: () => new Date().toLocaleDateString('pt-BR') },
      { field: 'cidade_foro', label: 'Cidade do foro', required: true },
      { field: 'estado_foro', label: 'UF do foro', required: true, default: 'Bahia' }
    ],
    generate: (data) => `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS

Pelo presente instrumento particular de contrato de prestação de serviços advocatícios, de um lado o(a) CONTRATADO(A) ${data.contratado1_nome}, inscrito(a) na ${data.contratado1_oab} ${data.contratado2_nome ? 'e ' + data.contratado2_nome + ', inscrito(a) na ' + data.contratado2_oab : ''}, com escritório profissional situado na ${data.escritorio_endereco}, doravante denominado(a) CONTRATADO(A) e, de outro lado, ${data.contratante_nome}, ${data.contratante_nacionalidade}, ${data.contratante_estado_civil}, ${data.contratante_profissao}, portador(a) do RG n.º ${data.contratante_rg} e inscrito(a) no CPF sob o n.º ${data.contratante_cpf} ${data.contratante_nascimento ? ', nascido(a) em ' + data.contratante_nascimento : ''}, residente e domiciliado(a) na ${data.contratante_endereco}, na cidade de ${data.contratante_cidade} – ${data.contratante_estado} ${data.contratante_cep ? ', CEP n.º ' + data.contratante_cep : ''}, doravante denominado(a) CONTRATANTE.

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços Advocatícios, que será regido pelas cláusulas seguintes e pelas condições descritas a seguir:

1 – DO OBJETO - O(a) CONTRATADO(A) compromete-se a prestar seus serviços profissionais em defesa dos interesses do(a) CONTRATANTE no âmbito judicial para propor ${data.objeto} ${data.empresa_re ? 'contra ' + data.empresa_re : ''}.
1.1 - O presente contrato não tem caráter personalíssimo, podendo o(a) CONTRATADO(A) ser representado(a) por outros advogados em qualquer ato processual.

2 - DO PRAZO - O prazo do presente iniciar-se-á com a assinatura do mesmo e perdurará até a decisão final.

3 – DO VALOR - Como contraprestação dos trabalhos contratados pagar-lhe-á o valor de ${data.percentual_honorarios}% (${data.percentual_honorarios} por cento) sobre o valor auferido com o resultado.
3.1 - Fica estabelecido que o valor fixado ou arbitrado judicialmente, a título de honorários de sucumbência porventura existentes, pertencerá, por direito, ao(à) CONTRATADO(A), de acordo com o estabelecido na lei n.º 8.906, de 4 de julho de 1994, em seus artigos. 22 e 23.

3.2 - Ficam o(a) CONTRATADO(A) autorizado(a) desde já a fazer a retenção de seus honorários quando do recebimento de valores devidos a(o) CONTRATANTE, advindos de êxito da demanda, ainda que parcial.

4 - DAS CUSTAS, TAXAS E DESPESAS GERAIS - As custas, taxas processuais, e, despesas gerais, tais como material reprográfico, diligências, viagens e deslocamentos, correrão por conta do(a) CONTRATANTE, que se reserva o direito de exigir a devida comprovação.

5 - DA PRESTAÇÃO DE CONTAS - O(a) CONTRATADO(A) obriga-se a prestar contas de quaisquer valores caso sejam recebidos ou dos valores das despesas adiantadas pelo(a) CONTRATANTE, tais como despesas cartorárias, cópias, viagens ou outras necessárias ao prosseguimento de ação judicial ou procedimentos administrativos perante órgãos públicos.

6 - DA RESCISÃO - O presente contrato poderá ser rescindido pelas partes mediante notificação prévia, com o prazo de 15 (quinze) dias e atendendo aos prazos processuais, de modo a não causar prejuízo aos termos judiciais.
6.1 - A inobservância por parte do(a) CONTRATANTE, de qualquer cláusula deste instrumento acarretará a rescisão deste contrato, independente de notificações e avisos, ficando sujeito(a) aos honorários pactuados, bem como multa contratual de 20% sobre os mesmos, mais juros de 1% ao mês e correção monetária pelo índice INPC.

7 - DO FORO - Fica eleito o foro da Comarca de ${data.cidade_foro}-${data.estado_foro}, para a solução das questões, por ventura decorrente do presente Contrato, renunciando a qualquer outro.

E, para firmeza e como prova de assim haverem contratado, fizeram este instrumento particular, impresso em 2(duas) vias de igual teor e forma, assinado pelas partes contratantes e pelas testemunhas abaixo.

${data.cidade_foro} - ${data.estado_foro}, ${data.data}

CONTRATADO(A):


${data.contratado1_nome}
${data.contratado1_oab}
${data.contratado2_nome ? '\n' + data.contratado2_nome + '\n' + data.contratado2_oab + '\n' : ''}

CONTRATANTE:


${data.contratante_nome}`
  },

  procuracao: {
    name: 'Procuração',
    description: 'Procuração ad judicia e extra com amplos poderes',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo do OUTORGANTE', required: true },
      { field: 'cliente_nacionalidade', label: 'Nacionalidade do OUTORGANTE', required: true, default: 'brasileiro(a)' },
      { field: 'cliente_estado_civil', label: 'Estado civil do OUTORGANTE', required: true },
      { field: 'cliente_profissao', label: 'Profissão do OUTORGANTE', required: true },
      { field: 'cliente_rg', label: 'RG do OUTORGANTE', required: true },
      { field: 'cliente_rg_orgao', label: 'Órgão emissor do RG', required: true, default: 'SSP/BA' },
      { field: 'cliente_cpf', label: 'CPF do OUTORGANTE', required: true },
      { field: 'cliente_endereco', label: 'Endereço do OUTORGANTE', required: true },
      { field: 'cliente_cidade', label: 'Cidade do OUTORGANTE', required: true },
      { field: 'cliente_estado', label: 'UF do OUTORGANTE', required: true, default: 'Bahia' },

      { field: 'advogado1_nome', label: 'Nome do advogado OUTORGADO 1', required: true },
      { field: 'advogado1_oab', label: 'OAB/UF do advogado 1', required: true },
      { field: 'advogado1_nacionalidade', label: 'Nacionalidade do advogado 1', required: false, default: 'brasileiro(a)' },
      { field: 'advogado1_estado_civil', label: 'Estado civil do advogado 1', required: false, default: 'casado(a)' },

      { field: 'advogado2_nome', label: 'Nome do advogado OUTORGADO 2 (opcional)', required: false },
      { field: 'advogado2_oab', label: 'OAB/UF do advogado 2', required: false },
      { field: 'advogado2_nacionalidade', label: 'Nacionalidade do advogado 2', required: false, default: 'brasileiro(a)' },
      { field: 'advogado2_estado_civil', label: 'Estado civil do advogado 2', required: false, default: 'solteiro(a)' },

      { field: 'escritorio_endereco', label: 'Endereço do escritório', required: true, default: 'Rua Palmeiras, n.° 105, Novo Prado, Itamaraju/BA, CEP: 45.836-000' },
      { field: 'data', label: 'Data da procuração', required: true, default: () => new Date().toLocaleDateString('pt-BR') },
      { field: 'local', label: 'Local da procuração', required: true, default: 'Itamaraju' }
    ],
    generate: (data) => `PROCURAÇÃO AD JUDICIA E EXTRA

Por este instrumento particular, a parte outorgante ao lado qualificada, nomeia e constitui seus bastantes procuradores, o(a)(s) advogado(s) ${data.advogado1_nome}, ${data.advogado1_nacionalidade}, ${data.advogado1_estado_civil}, inscrito(a) na ${data.advogado1_oab} ${data.advogado2_nome ? 'e ' + data.advogado2_nome + ', ' + data.advogado2_nacionalidade + ', ' + data.advogado2_estado_civil + ', inscrito(a) na ' + data.advogado2_oab : ''}, com escritório profissional situado na ${data.escritorio_endereco}, onde recebem intimações (art. 106, I CPC), a quem confere os poderes de cláusula ad judicia et extra, para agir na defesa de seus direitos e interesses, em qualquer foro, juízo, tribunal ou instância, ou ainda fora deles, utilizando-se dos mais amplos poderes em direito permitidos, podendo propor e contestar ações; variar e desistir delas; interpor recursos, seguindo umas e outras até o final da decisão, usando os recursos legais; e ainda os poderes especiais para arguir suspeição ou falsidade; transigir; receber valores e dar quitação; firmar compromissos; concordar, apresentar e impugnar cálculos; assinar termos de homologação, requerer, retirar e receber alvarás judiciais, juntos a bancos públicos e/ou privados, inclusive aqueles relativos a contas de FGTS e do seguro-desemprego, junto aos Poder Judiciário e Bancos Federais, inclusive justiça gratuita, obrigando-se a prestar serviços profissionais advocatícios na defesa dos direitos e interesses do OUTORGANTE/CONTRATANTE, desempenhando com zelo a atividade a seu encargo, podendo praticar todos os demais atos necessários ao bom e fiel cumprimento deste mandato, agindo em conjunto ou separadamente, podendo ainda substabelecer a presente, no todo ou em parte, com ou sem reserva de poderes.

OUTORGANTE: ${data.cliente_nome}, ${data.cliente_nacionalidade}, ${data.cliente_estado_civil}, ${data.cliente_profissao}, portador(a) do RG n.º ${data.cliente_rg} expedido pela ${data.cliente_rg_orgao} e inscrito(a) no CPF sob o n.º ${data.cliente_cpf}, residente e domiciliado(a) na ${data.cliente_endereco}, na cidade de ${data.cliente_cidade} - ${data.cliente_estado}.

${data.local}, ${data.data}


_________________________________
${data.cliente_nome}
OUTORGANTE`
  },

  declaracao_hipossuficiencia: {
    name: 'Declaração de Hipossuficiência',
    description: 'Declaração de pobreza para justiça gratuita',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo', required: true },
      { field: 'cliente_cpf', label: 'CPF', required: true },
      { field: 'data', label: 'Data', required: true, default: () => new Date().toLocaleDateString('pt-BR') },
      { field: 'local', label: 'Local', required: true, default: 'Itamaraju' }
    ],
    generate: (data) => `DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA

O(a) outorgante/contratante ${data.cliente_nome}, inscrito(a) no CPF sob o n.º ${data.cliente_cpf}, DECLARA SER "POBRE" NA ACEPÇÃO JURÍDICA DO TERMO, segundo os preceitos do art. 790, §3º, da CLT c/c art. 98 do CPC, fazendo jus aos benefícios da Justiça Gratuita, por não ter condições de arcar com as custas judiciais, honorários periciais e demais despesas do processo, sob pena de colocar em risco seu sustento próprio e de sua família, nos termos da Lei 1.060/50 e está ciente das implicações desta sua declaração, nos termos da Lei 7.510/86.

${data.local} – Bahia, ${data.data}


_________________________________
${data.cliente_nome}
CPF: ${data.cliente_cpf}`
  },

  declaracao_endereco: {
    name: 'Declaração de Endereço',
    description: 'Declaração para comprovação de endereço completo',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo', required: true },
      { field: 'cliente_nacionalidade', label: 'Nacionalidade', required: true, default: 'brasileiro(a)' },
      { field: 'cliente_estado_civil', label: 'Estado civil', required: true },
      { field: 'cliente_profissao', label: 'Profissão', required: true },
      { field: 'cliente_rg', label: 'RG', required: true },
      { field: 'cliente_rg_orgao', label: 'Órgão emissor do RG', required: true, default: 'SSP/BA' },
      { field: 'cliente_cpf', label: 'CPF', required: true },
      { field: 'cliente_nascimento', label: 'Data de nascimento', required: false },
      { field: 'cliente_pai', label: 'Filiação - pai', required: false, default: 'não informado' },
      { field: 'cliente_mae', label: 'Filiação - mãe', required: false, default: 'não informado' },
      { field: 'cliente_endereco', label: 'Endereço completo', required: true },
      { field: 'cliente_bairro', label: 'Bairro', required: true },
      { field: 'cliente_cidade', label: 'Cidade', required: true },
      { field: 'cliente_estado', label: 'UF', required: true, default: 'Bahia' },
      { field: 'cliente_cep', label: 'CEP', required: true },
      { field: 'data', label: 'Data', required: true, default: () => new Date().toLocaleDateString('pt-BR') },
      { field: 'local', label: 'Local', required: true, default: 'Itamaraju' }
    ],
    generate: (data) => `DECLARAÇÃO DE ENDEREÇO

Eu, ${data.cliente_nome}, ${data.cliente_nacionalidade}, ${data.cliente_estado_civil}, ${data.cliente_profissao}, portador(a) do RG n.º ${data.cliente_rg} expedido pela ${data.cliente_rg_orgao} e inscrito(a) no CPF sob o n.º ${data.cliente_cpf} ${data.cliente_nascimento ? ', nascido(a) em ' + data.cliente_nascimento : ''}, filho(a) de ${data.cliente_pai} e ${data.cliente_mae}, declaro para os devidos fins legais, nos termos da lei n.º 7.115, de 29 de agosto de 1983 e sob minha responsabilidade, que mantenho residência na ${data.cliente_endereco}, ${data.cliente_bairro}, na cidade de ${data.cliente_cidade} - ${data.cliente_estado}, CEP ${data.cliente_cep}. Por ser a expressão da verdade, firmo o presente para efeitos legais.

${data.local} – ${data.cliente_estado}, ${data.data}


_________________________________
${data.cliente_nome}
CPF: ${data.cliente_cpf}`
  }
};

export function getTemplateList() {
  return Object.entries(DOCUMENT_TEMPLATES).map(([key, template]) => ({
    id: key,
    name: template.name,
    description: template.description,
    fields: template.fields
  }));
}

export function generateDocument(templateId, data) {
  const template = DOCUMENT_TEMPLATES[templateId];
  if (!template) throw new Error('Template não encontrado');

  for (const field of template.fields) {
    if (field.required && !data[field.field]) {
      throw new Error(`Campo obrigatório não preenchido: ${field.label}`);
    }
    if (!data[field.field] && field.default) {
      data[field.field] = typeof field.default === 'function' ? field.default() : field.default;
    }
  }

  return template.generate(data);
}
