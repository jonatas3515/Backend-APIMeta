// ============================================================================
// TEMPLATES DE DOCUMENTOS PADRÃO
// ============================================================================

export const DOCUMENT_TEMPLATES = {
  contrato_honorarios: {
    name: 'Contrato de Honorários',
    description: 'Contrato de prestação de serviços advocatícios',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo do cliente', required: true },
      { field: 'cliente_cpf', label: 'CPF do cliente', required: true },
      { field: 'cliente_endereco', label: 'Endereço do cliente', required: false },
      { field: 'objeto', label: 'Objeto do contrato (qual ação/assunto)', required: true },
      { field: 'valor_entrada', label: 'Valor da entrada (R$)', required: false },
      { field: 'valor_total', label: 'Valor total dos honorários (R$)', required: true },
      { field: 'parcelas', label: 'Número de parcelas', required: false, default: '1' },
      { field: 'advogado_nome', label: 'Nome do advogado', required: true },
      { field: 'advogado_oab', label: 'OAB do advogado', required: true },
      { field: 'data', label: 'Data do contrato', required: true, default: () => new Date().toLocaleDateString('pt-BR') }
    ],
    generate: (data) => `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS

CONTRATANTE: ${data.cliente_nome}, CPF: ${data.cliente_cpf}, endereço: ${data.cliente_endereco || 'não informado'}.
CONTRATADO: ${data.advogado_nome}, OAB: ${data.advogado_oab}.

CLÁUSULA 1ª - OBJETO
O presente contrato tem por objeto a prestação de serviços advocatícios relativos a ${data.objeto}.

CLÁUSULA 2ª - DOS HONORÁRIOS
Pelo serviço contratado, o(a) CONTRATANTE pagará ao(à) CONTRATADO(A) a quantia de R$ ${data.valor_total}.
Entrada: R$ ${data.valor_entrada || '0,00'}.
Parcelamento: ${data.parcelas || '1'} parcela(s).

CLÁUSULA 3ª - DAS OBRIGAÇÕES
O(a) CONTRATADO(A) se obriga a prestar os serviços com zelo e diligência, mantendo o(a) CONTRATANTE informado(a) sobre o andamento do caso.

CLÁUSULA 4ª - VIGÊNCIA
O presente contrato entra em vigor na data de sua assinatura e permanece até o término do objeto.

E, por estarem de comum acordo, firmam o presente contrato.

Data: ${data.data}

_________________________________
${data.cliente_nome}
CONTRATANTE

_________________________________
${data.advogado_nome}
CONTRATADO(A)`
  },

  declaracao_residencia: {
    name: 'Declaração de Residência',
    description: 'Declaração para comprovação de endereço',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo', required: true },
      { field: 'cliente_cpf', label: 'CPF', required: true },
      { field: 'endereco', label: 'Endereço completo', required: true },
      { field: 'municipio', label: 'Município', required: true },
      { field: 'estado', label: 'UF', required: true },
      { field: 'data', label: 'Data', required: true, default: () => new Date().toLocaleDateString('pt-BR') }
    ],
    generate: (data) => `DECLARAÇÃO DE RESIDÊNCIA

Eu, ${data.cliente_nome}, CPF: ${data.cliente_cpf}, declaro, para os devidos fins, que resido no endereço abaixo:

Endereço: ${data.endereco}
Município: ${data.municipio}
UF: ${data.estado}

Declaro que as informações acima são verdadeiras e assumo inteira responsabilidade pelas mesmas.

${data.municipio}, ${data.data}

_________________________________
${data.cliente_nome}
CPF: ${data.cliente_cpf}`
  },

  autorizacao_representacao: {
    name: 'Autorização de Representação',
    description: 'Procuração/advogacia para representar cliente',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo do outorgante', required: true },
      { field: 'cliente_cpf', label: 'CPF do outorgante', required: true },
      { field: 'advogado_nome', label: 'Nome do advogado', required: true },
      { field: 'advogado_oab', label: 'OAB do advogado', required: true },
      { field: 'poderes', label: 'Poderes específicos', required: false, default: 'PODERES PARA ATUAR NA CAUSA' },
      { field: 'data', label: 'Data', required: true, default: () => new Date().toLocaleDateString('pt-BR') }
    ],
    generate: (data) => `PROCURAÇÃO AD JUDICIA

OUTORGANTE: ${data.cliente_nome}, CPF: ${data.cliente_cpf}.
OUTORGADO: ${data.advogado_nome}, OAB: ${data.advogado_oab}.

O OUTORGANTE confere ao OUTORGADO os poderes para representá-lo em todas as instâncias judiciais e extrajudiciais, podendo praticar todos os atos necessários, inclusive firmar compromissos, transigir, desistir, renunciar, receber e dar quitação.

Poderes específicos: ${data.poderes}

${data.data}

_________________________________
${data.cliente_nome}
OUTORGANTE`
  },

  declaracao_renda: {
    name: 'Declaração de Renda',
    description: 'Declaração de renda mensal para ações trabalhistas',
    fields: [
      { field: 'cliente_nome', label: 'Nome completo', required: true },
      { field: 'cliente_cpf', label: 'CPF', required: true },
      { field: 'renda_mensal', label: 'Renda mensal (R$)', required: true },
      { field: 'fonte_renda', label: 'Fonte da renda', required: true },
      { field: 'data', label: 'Data', required: true, default: () => new Date().toLocaleDateString('pt-BR') }
    ],
    generate: (data) => `DECLARAÇÃO DE RENDA

Eu, ${data.cliente_nome}, CPF: ${data.cliente_cpf}, declaro, para os devidos fins, que minha renda mensal é de R$ ${data.renda_mensal}.

Fonte de renda: ${data.fonte_renda}.

Declaro que as informações são verdadeiras e estou ciente de que eventuais omissões podem gerar responsabilização legal.

Data: ${data.data}

_________________________________
${data.cliente_nome}
CPF: ${data.cliente_cpf}`
  },

  requerimento_adm: {
    name: 'Requerimento Administrativo',
    description: 'Requerimento padrão para órgãos públicos',
    fields: [
      { field: 'cliente_nome', label: 'Nome do requerente', required: true },
      { field: 'cliente_cpf', label: 'CPF', required: true },
      { field: 'orgao', label: 'Órgão destinatário', required: true },
      { field: 'assunto', label: 'Assunto do requerimento', required: true },
      { field: 'solicitacao', label: 'Solicitação', required: true },
      { field: 'municipio', label: 'Município', required: true },
      { field: 'data', label: 'Data', required: true, default: () => new Date().toLocaleDateString('pt-BR') }
    ],
    generate: (data) => `REQUERIMENTO

Ilmo. Sr. Responsável pelo(a) ${data.orgao}.

Eu, ${data.cliente_nome}, CPF: ${data.cliente_cpf}, por meio deste, venho requerer:

Assunto: ${data.assunto}

Solicitação:
${data.solicitacao}

Neste ato, requeiro o deferimento do pedido.

${data.municipio}, ${data.data}

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
