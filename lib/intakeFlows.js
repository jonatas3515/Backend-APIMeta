// ============================================================================
// FLUXOS DE COLETA GUIADA DE INFORMAÇÕES JURÍDICAS
// ============================================================================

// ============================================================================
// TRIAGEM ESTRUTURADA: opções e mapeamento por área
// ============================================================================

export const CASE_TYPES_BY_AREA = {
  trabalhista: [
    'Demissão sem justa causa',
    'Demissão por justa causa',
    'Pedido de demissão',
    'Rescisão indireta',
    'FGTS',
    'Adicional de insalubridade',
    'Adicional de periculosidade',
    'Horas extras',
    'Saldo de salário / 13º / férias',
    'Acidente de trabalho',
    'Assédio moral',
    'Reconhecimento de vínculo',
    'Outro'
  ],
  administrativo: [
    'Licença prêmio',
    'Licença saúde',
    'Adicional de tempo de serviço',
    'Progressão / Promoção',
    'Estágio probatório',
    'Exoneração / Demissão de servidor',
    'FGTS de contratado',
    'Concurso público',
    'Readaptação / Aposentadoria servidor',
    'Remuneração / Vencimentos',
    'Outro'
  ],
  previdenciario: [
    'Aposentadoria por idade',
    'Aposentadoria por tempo de contribuição',
    'Aposentadoria por invalidez',
    'Auxílio-doença',
    'LOAS / BPC',
    'Pensão por morte',
    'Revisão de benefício',
    'Tempo especial',
    'Outro'
  ],
  civel: [
    'Contratos',
    'Indenização por dano material / moral',
    'Família e sucessões',
    'Imóveis / Usucapião',
    'Direito do consumidor',
    'Cobrança / Inadimplência',
    'Outro'
  ],
  consumidor: [
    'Defeito de produto',
    'Serviço não prestado',
    'Cobrança indevida',
    'Golpe / Fraude',
    'Plano de saúde',
    'Cartão de crédito / Bancário',
    'Procon / CDC',
    'Outro'
  ]
};

export const CLIENT_ROLES = [
  'Servidor efetivo',
  'Servidor contratado',
  'Servidor comissionado',
  'Empregado CLT',
  'Empregador / Empresa',
  'Autônomo',
  'Beneficiário / Cidadão',
  'Outro'
];

export const TRIAGE_FIELDS = [
  { field: 'municipality', question: 'Qual o município envolvido? (cidade do cliente ou do órgão público)' },
  { field: 'agency', question: 'Qual o órgão/entidade? (prefeitura, câmara, autarquia, empresa privada etc.)' },
  { field: 'client_role', question: 'Qual seu papel? (servidor efetivo, contratado, comissionado, empregado CLT, empregador etc.)' },
  { field: 'case_type', ask: (area) => {
    const options = CASE_TYPES_BY_AREA[area]?.join(', ') || 'caso geral';
    return `Qual o tipo específico do caso? Opções comuns: ${options}.`;
  }}
];

export function suggestCaseTypes(area) {
  return CASE_TYPES_BY_AREA[area] || CASE_TYPES_BY_AREA.civel;
}

export function isTriageComplete(triage) {
  if (!triage) return false;
  return TRIAGE_FIELDS.every(f => {
    if (f.field === 'case_type') return !!triage.case_type;
    return true; // os demais são opcionais
  });
}

export function getTriageQuestion(area, field) {
  const found = TRIAGE_FIELDS.find(f => f.field === field);
  if (!found) return null;
  if (field === 'case_type' && found.ask) {
    return found.ask(area);
  }
  return found.question;
}

export const INTAKE_FLOWS = {
  trabalhista: {
    displayName: 'Trabalhista',
    triggerKeywords: ['trabalhista', 'trabalho', 'emprego', 'demissão', 'demitido', 'fgts', 'insalubridade', 'periculosidade', 'horas extras', 'rescisão', 'salário'],
    questions: [
      { field: 'tempo_trabalho', question: 'Quanto tempo você trabalhou na empresa? (ex: 2 anos e 3 meses)' },
      { field: 'data_admissao', question: 'Qual a data de admissão? (DD/MM/AAAA)' },
      { field: 'data_demissao', question: 'Qual a data de demissão, se houver? (DD/MM/AAAA)' },
      { field: 'cargo_funcao', question: 'Qual era seu cargo/função?' },
      { field: 'ultimo_salario', question: 'Qual era seu último salário? (R$)' },
      { field: 'motivo_demissao', question: 'Qual foi o motivo da demissão? Justa causa? Pedido? Sem justa causa?' },
      { field: 'avisos', question: 'Você trabalhou no aviso prévio? Foi dispensado e parou imediatamente?' },
      { field: 'verbas', question: 'Quais verbas você acha que tem a receber? (FGTS, férias, 13º, horas extras, insalubridade?)' },
      { field: 'extrato_fgts', question: 'Você tem acesso ao extrato do FGTS?' },
      { field: 'hierarquia', question: 'Você respondia diretamente a algum superior que pode testemunhar?' },
      { field: 'acordo_previo', question: 'Já teve alguma conversa/tentativa de acordo com a empresa?' },
      { field: 'contato_email', question: 'Qual seu melhor e-mail para envio de documentos e proposta?' }
    ]
  },

  previdenciario: {
    displayName: 'Previdenciário',
    triggerKeywords: ['aposentadoria', 'inss', 'benefício', 'auxílio', 'previdência', 'aposentar', 'pensão', 'loas', 'bpc', 'tempo de serviço'],
    questions: [
      { field: 'tipo_beneficio', question: 'Qual benefício você quer ou já solicitou? (Aposentadoria por idade/tempo/contribuição, LOAS, auxílio, pensão?)' },
      { field: 'data_nascimento', question: 'Qual sua data de nascimento? (DD/MM/AAAA)' },
      { field: 'tempo_contribuicao', question: 'Quanto tempo de contribuição você tem? (anos/meses)' },
      { field: 'carteira_vinculos', question: 'Você tem acesso à CNIS (carteira de vínculos)?' },
      { field: 'profissoes_risco', question: 'Já exercia alguma atividade especial/insalubre? Qual?' },
      { field: 'doencas', question: 'Você tem algum problema de saúde ou deficiência que pode justificar aposentadoria por invalidez?' },
      { field: 'beneficio_negado', question: 'Seu benefício já foi negado? Se sim, qual foi o motivo informado?' },
      { field: 'salarios_contribuicao', question: 'Sabe qual sua média salarial de contribuição?' },
      { field: 'documentos_pendentes', question: 'Você tem: RG, CPF, CNIS, carteira de trabalho, comprovante de endereço?' },
      { field: 'contato_email', question: 'Qual seu melhor e-mail para envio de documentos e proposta?' }
    ]
  },

  administrativo: {
    displayName: 'Direito Administrativo / Servidor Público',
    triggerKeywords: ['concurso', 'servidor', 'prefeitura', 'câmara', 'autarquia', 'estágio probatório', 'concurso público', 'licença', 'aposentadoria servidor', 'professor'],
    questions: [
      { field: 'orgao_lotacao', question: 'Em qual órgão você trabalha? (Prefeitura, Câmara, Autarquia, outro?)' },
      { field: 'municipio', question: 'Qual município?' },
      { field: 'cargo', question: 'Qual seu cargo/função? (Professor, agente comunitário, servidor efetivo, comissionado?)' },
      { field: 'data_posse', question: 'Qual a data da posse/nomeação? (DD/MM/AAAA)' },
      { field: 'situacao', question: 'Qual sua situação atual? (Estágio probatório, efetivo, em processo, licenciado?)' },
      { field: 'problema', question: 'Qual o problema/objetivo? (Concurso, licença, aposentadoria, direitos, sanção, remuneração?)' },
      { field: 'atos_praticados', question: 'Houve algum ato administrativo? (Portaria, decreto, notificação?)' },
      { field: 'prazo_recurso', question: 'Existe algum prazo para recurso/administrativo? Qual?' },
      { field: 'sindicato', question: 'Você tem sindicato ou associação que acompanha o caso?' },
      { field: 'documentos_pendentes', question: 'Quais documentos você já tem: portarias, contracheques, edital, cartão de ponto?' },
      { field: 'contato_email', question: 'Qual seu melhor e-mail para envio de documentos e proposta?' }
    ]
  },

  civel: {
    displayName: 'Cível',
    triggerKeywords: ['contrato', 'indicação', 'dano', 'indenização', 'família', 'divórcio', 'pensão', 'guarda', 'inventário', 'usucapião', 'imóvel'],
    questions: [
      { field: 'area_especifica', question: 'Dentro do Direito Cível, qual é o tema? (Contratos, indenização, família, imóvel, consumidor?)' },
      { field: 'parte_contraria', question: 'Quem é a parte contrária ou interessada no caso?' },
      { field: 'valor_causa', question: 'Há um valor estimado envolvido? Qual?' },
      { field: 'fatos_relevantes', question: 'Resuma os fatos mais importantes cronologicamente.' },
      { field: 'provas', question: 'Quais documentos/comprovantes você possui?' },
      { field: 'prazo_relevante', question: 'Existe algum prazo importante (prescrição, decadência, vencimento)?' },
      { field: 'objetivo', question: 'Qual seu objetivo com a ação/consulta?' },
      { field: 'contato_email', question: 'Qual seu melhor e-mail para envio de documentos e proposta?' }
    ]
  },

  consumidor: {
    displayName: 'Consumidor',
    triggerKeywords: ['procon', 'consumidor', 'compra', 'produto', 'defeito', 'golpe', 'fraude', 'cartão', 'loja', 'plano saúde', 'internet'],
    questions: [
      { field: 'empresa_fornecedor', question: 'Qual empresa/fornecedor envolvida?' },
      { field: 'produto_servico', question: 'Qual produto ou serviço contratado?' },
      { field: 'valor_pago', question: 'Quanto você pagou ou tem a pagar?' },
      { field: 'problema', question: 'Qual o problema? (Defeito, cobrança indevida, atraso, não entrega, propaganda enganosa?)' },
      { field: 'tentativa_solucao', question: 'Você já tentou resolver com a empresa? Como?' },
      { field: 'provas', question: 'Você tem: contrato, nota fiscal, prints, áudio, protocolo de atendimento?' },
      { field: 'prejuizo', question: 'Qual seu prejuízo financeiro ou dano sofrido?' },
      { field: 'contato_email', question: 'Qual seu melhor e-mail para envio de documentos e proposta?' }
    ]
  }
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

export function detectArea(message) {
  const lowerMessage = message.toLowerCase();
  
  for (const [area, flow] of Object.entries(INTAKE_FLOWS)) {
    for (const keyword of flow.triggerKeywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return area;
      }
    }
  }
  
  return null;
}

export function getFlow(area) {
  return INTAKE_FLOWS[area] || null;
}

export function getNextQuestion(area, currentStep, previousAnswers = {}) {
  const flow = getFlow(area);
  if (!flow) return null;
  
  if (currentStep >= flow.questions.length) {
    return null;
  }
  
  return flow.questions[currentStep];
}

export function isIntakeComplete(area, currentStep) {
  const flow = getFlow(area);
  if (!flow) return false;
  return currentStep >= flow.questions.length;
}
