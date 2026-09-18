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
  { field: 'case_type', ask: (area) => {
    const options = CASE_TYPES_BY_AREA[area]?.join(', ') || 'caso geral';
    return `Para entender melhor, conte-me o que aconteceu. Você pode falar livremente que eu organizo as informações.`;
  }}
];

export function suggestCaseTypes(area) {
  return CASE_TYPES_BY_AREA[area] || CASE_TYPES_BY_AREA.civel;
}

export function isTriageComplete(triage) {
  if (!triage) return false;
  return TRIAGE_FIELDS.every(f => {
    if (f.field === 'case_type') return !!triage.case_type;
    return true;
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

// ============================================================================
// FUNÇÕES DE EXTRAÇÃO TEMÁTICA DO FLUXO CÍVEL
// ============================================================================

function normalizeForTheme(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function extractCivilTheme(message) {
  const norm = normalizeForTheme(message);
  if (norm.includes('divorcio') || norm.includes('separacao') || norm.includes('guarda') ||
      norm.includes('pensao') || norm.includes('alimentos') ||
      norm.includes('inventario') || norm.includes('heranca')) {
    return 'Família';
  }
  if (norm.includes('contrato') || norm.includes('contratual') || norm.includes('quita') ||
      norm.includes('financiamento') || norm.includes('emprestimo') || norm.includes('banco') ||
      norm.includes('cobranca') || norm.includes('inadimplencia') || norm.includes('atrasado') ||
      norm.includes('atrasada') || norm.includes('veiculo') || norm.includes('vei') ||
      norm.includes('imovel') || norm.includes('imobiliario') || norm.includes('prestacao de servico')) {
    return 'Contratos';
  }
  return null;
}

export function isContractTheme(text) {
  if (!text) return false;
  const norm = normalizeForTheme(String(text));
  return norm.includes('contrato') || norm.includes('contratual');
}

function isAreaEspecificaNeeded(answers, currentMessage) {
  if (answers?.area_especifica) return false;
  if (extractCivilTheme(currentMessage)) return false;
  return true;
}

function shouldAskContractType(answers, currentMessage) {
  return isContractTheme(answers?.area_especifica) || isContractTheme(currentMessage);
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

  familia: {
    displayName: 'Família e Sucessões',
    triggerKeywords: [
      'divórcio', 'divorcio', 'divorci', 'separação', 'separacao', 'separar', 'guarda', 'alimentos',
      'pensão alimentícia', 'pensao alimenticia', 'pensão de alimentos',
      'inventário', 'inventario', 'herança', 'heranca', 'sucessão', 'sucessao', 'regime de bens'
    ],
    questions: [
      { field: 'tipo_processo', question: 'Você quer tratar de divórcio consensual ou litigioso? Há filhos menores, bens ou pensão envolvidos?' },
      { field: 'partes', question: 'Quem são as partes envolvidas (cônjuge, ex, filhos, herdeiros)?' },
      { field: 'tempo_uniao', question: 'Quanto tempo durou o casamento ou união estável?' },
      { field: 'bens', question: 'Há bens a dividir? Quais e onde estão? (Imóvel, veículo, conta bancária, empresa, dívida)' },
      { field: 'filhos_menores', question: 'Há filhos menores de idade ou dependentes? Qual é a situação de guarda e convivência?' },
      { field: 'valor_pensao', question: 'Há pensão alimentícia fixada ou combinada? Qual valor e há atrasos?' },
      { field: 'provas', question: 'Quais documentos você tem? (Certidão de casamento/nascimento, escrituras, contratos, comprovantes de renda)' },
      { field: 'objetivo', question: 'Qual seu objetivo com a ação/consulta?' },
      { field: 'contato_email', question: 'Qual seu melhor e-mail para envio de documentos e proposta?' }
    ]
  },

  previdenciario: {
    displayName: 'Previdenciário',
    triggerKeywords: [
      'aposentadoria', 'inss', 'benefício', 'beneficio', 'auxílio', 'auxilio', 'previdência', 'previdencia',
      'aposentar', 'pensão por morte', 'pensao por morte', 'pensão', 'pensao', 'loas', 'bpc',
      'tempo de serviço', 'tempo de contribuição', 'cnis', 'indeferido', 'indeferimento',
      'negado', 'recusado', 'prazo de recurso', 'revisão'
    ],
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
    triggerKeywords: [
      'contrato', 'prestação de serviços', 'financiamento', 'veículo', 'carro', 'moto', 'imóvel', 'imovel',
      'empréstimo', 'emprestimo', 'banco', 'cobrança', 'cobranca', 'inadimplência', 'inadimplencia',
      'atrasado', 'atrasada', 'parcela atrasada', 'quitação', 'quitacao', 'indicação', 'dano',
      'indenização', 'usucapião',
      'despejo', 'acidente', 'crime', 'boletim', 'boletim de ocorrência'
    ],
    questions: [
      {
        field: 'area_especifica',
        question: 'Dentro do Direito Cível, qual é o tema? (Contratos, indenização, família, imóvel, consumidor?)',
        condition: (answers, currentMessage) => isAreaEspecificaNeeded(answers, currentMessage)
      },
      {
        field: 'contract_type',
        question: 'Que tipo de contrato é — financiamento, prestação de serviços, compra e venda, aluguel ou outro? Se puder, conte também o que aconteceu e o que você deseja confirmar ou contestar.',
        condition: (answers, currentMessage) => shouldAskContractType(answers, currentMessage)
      },
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
    triggerKeywords: [
      'procon', 'consumidor', 'compra', 'produto', 'defeito', 'golpe', 'fraude', 'cartão', 'cartao',
      'loja', 'plano saúde', 'plano saude', 'internet', 'cobrança indevida', 'cobranca indevida',
      'juros abusivos', 'anatel', 'reclamação consumidor', 'cdc', 'cancelamento', 'bancário'
    ],
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

export function getNextQuestion(area, currentStep, previousAnswers = {}, currentMessage = '') {
  const flow = getFlow(area);
  if (!flow) return null;
  
  for (let i = currentStep; i < flow.questions.length; i++) {
    const q = flow.questions[i];
    if (typeof q.condition === 'function') {
      if (!q.condition(previousAnswers, currentMessage)) continue;
    }
    return { ...q, step: i };
  }
  
  return null;
}

export function isIntakeComplete(area, currentStep, previousAnswers = {}) {
  const flow = getFlow(area);
  if (!flow) return false;
  return getNextQuestion(area, currentStep, previousAnswers) === null;
}
