export const RECURSOS_PADRAO = [
  {
    id: '1',
    titulo: 'Calendário Jurídico',
    descricao: 'Controle de prazos, audiências e compromissos com alertas automáticos',
    cor: 'blue'
  },
  {
    id: '2',
    titulo: 'Gestão de Clientes',
    descricao: 'Cadastro completo de clientes com histórico de processos e atendimentos',
    cor: 'purple'
  },
  {
    id: '3',
    titulo: 'Controle de Processos',
    descricao: 'Acompanhamento detalhado de processos com status e andamentos',
    cor: 'green'
  },
  {
    id: '4',
    titulo: 'Tarefas e Prioridades',
    descricao: 'Organize tarefas por urgência e não perca nenhum prazo importante',
    cor: 'yellow'
  },
  {
    id: '5',
    titulo: 'Controle Financeiro',
    descricao: 'Honorários, despesas e relatórios financeiros detalhados',
    cor: 'pink'
  },
  {
    id: '6',
    titulo: 'Relatórios e Dashboard',
    descricao: 'Métricas consolidadas e visão analítica completa da performance do escritório',
    cor: 'cyan'
  }
];

export const PLANOS_PADRAO = [
  {
    id: '1',
    tipo: 'basico',
    nome: 'Básico',
    precoMensal: 49,
    precoAnual: 490,
    subtituloLanding: 'Para escritórios iniciantes',
    descricaoLanding: 'Funcionalidades essenciais para começar.',
    tagDestaque: '',
    textoBotao: 'Começar 30 dias grátis',
    funcionalidades: [
      'Calendário jurídico completo',
      'Gestão de casos e processos',
      'Até 50 clientes ativos'
    ]
  },
  {
    id: '2',
    tipo: 'profissional',
    nome: 'Profissional',
    precoMensal: 99,
    precoAnual: 990,
    subtituloLanding: 'Crescimento e gestão avançada',
    descricaoLanding: 'Todas as funcionalidades para escritórios em crescimento.',
    tagDestaque: 'Mais escolhido',
    textoBotao: 'Começar 30 dias grátis',
    funcionalidades: [
      'Tudo do Plano Básico',
      'Clientes e processos ilimitados',
      'Controle e simulador de honorários',
      'Suporte prioritário via WhatsApp'
    ]
  },
  {
    id: '3',
    tipo: 'enterprise',
    nome: 'Enterprise',
    precoMensal: 199,
    precoAnual: 1990,
    subtituloLanding: 'Múltiplas empresas e equipe',
    descricaoLanding: 'Solução completa para grandes bancas e múltiplos advogados.',
    tagDestaque: '',
    textoBotao: 'Começar 30 dias grátis',
    funcionalidades: [
      'Tudo do Plano Profissional',
      'Múltiplos usuários e permissões RBAC',
      'Inteligência Artificial (Gemini RAG)',
      'Backup completo e relatórios executivos'
    ]
  }
];

export const TERMOS_DE_USO_TEXT = `1. Aceitação dos Termos
Ao acessar ou utilizar a plataforma JusJNC e os serviços de atendimento jurídico integrados ("Plataforma", "Nós" ou "JusJNC Tecnologia"), você concorda integralmente com estes Termos de Uso e com a nossa Política de Privacidade. Caso discorde de qualquer disposição, solicitamos que interrompa imediatamente o uso da plataforma.

2. Descrição dos Serviços e Natureza Jurídica
O JusJNC é uma plataforma SaaS (Software as a Service) voltada à gestão de escritórios de advocacia e departamentos jurídicos, combinando automação de atendimento via WhatsApp (Meta Cloud API), triagem processual, acompanhamento de prazos, cálculos e simulações de honorários, inteligência jurídica generativa (RAG) e emissão de contratos eletrônicos.
A atuação jurídica prestada pelo escritório segue rigorosamente o Estatuto da Advocacia e da OAB (Lei nº 8.906/1994), o Código de Ética e Disciplina da OAB e o Provimento nº 205/2021 sobre publicidade e tecnologia jurídica.

3. Uso de Inteligência Artificial e Automação
A plataforma incorpora modelos avançados de Inteligência Artificial (Google Gemini) para apoiar na triagem de mensagens recebidas, redação preliminar de peças, classificação de sentimentos e sugestões contextuais baseadas em conhecimento jurídico (RAG - Retrieval Augmented Generation).
Atenção: Todas as decisões jurídicas, protocolos judiciais e orientações finais são revisadas e homologadas por advogados devidamente inscritos na OAB. A IA atua exclusivamente como ferramenta de produtividade e assistência operacional.

4. Segurança da Conta e Responsabilidades do Usuário
- Você é responsável pela confidencialidade de suas credenciais de acesso (usuário e senha).
- O usuário se compromete a não fornecer dados falsos ou se passar por terceiros.
- É expressamente proibida qualquer tentativa de engenharia reversa, invasão, extração massiva não autorizada (scraping) ou sobrecarga da infraestrutura da plataforma.

5. Proteção de Dados e Privacidade (LGPD)
O tratamento de dados pessoais realizado pela plataforma obedece aos ditames da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD). Garantimos aos titulares o pleno exercício de seus direitos, incluindo acesso, retificação, revogação de consentimento e solicitação de exclusão definitiva ("Direito ao Esquecimento") através de nossos canais oficiais de DPO ({dpo_email}).

6. Planos, Assinaturas e Pagamentos
Para advogados e escritórios terceiros utilizadores do software JusJNC, os planos de assinatura (Básico, Profissional e Enterprise) concedem licença de uso limitada, revogável e não exclusiva durante a vigência do contrato.
O inadimplemento de mensalidades após o período de carência poderá resultar na suspensão temporária do acesso aos módulos premium até a regularização financeira.

7. Backup e Retenção de Dados
A plataforma realiza rotinas periódicas de salvamento e disponibiliza ferramentas para que cada escritório exporte seus dados e relatórios em formato JSON, Excel e PDF a qualquer tempo. Em caso de encerramento contratual, os dados poderão ser mantidos pelo prazo prescricional estipulado pela legislação aplicável e pelo Código de Ética da OAB para guarda de arquivos jurídicos.

8. Foro de Eleição
Estes Termos são regidos pelas leis da República Federativa do Brasil. Para dirimir eventuais controvérsias oriundas deste documento, fica expressamente eleito o Foro da {forum}, com exclusão de qualquer outro, por mais privilegiado que seja.

Dúvidas sobre estes Termos de Uso? Entre em contato pelo e-mail: {email}`;

export const POLITICA_PRIVACIDADE_TEXT = `1. Introdução e Escopo
Esta Política de Privacidade e Proteção de Dados descreve como a plataforma JusJNC ("Plataforma", "Nós" ou "JusJNC Tecnologia"), em conjunto com os escritórios de advocacia conveniados, coleta, utiliza, armazena, processa e protege os dados pessoais de advogados, clientes, leads e colaboradores.
Estamos em estrita conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), o Marco Civil da Internet (Lei nº 12.965/2014) e as diretrizes éticas da Ordem dos Advogados do Brasil (OAB).

2. Dados Pessoais Coletados
- Identificação Pessoal: Nome completo, CPF, RG, data de nascimento, endereço residencial ou comercial, telefone e WhatsApp ({phone}).
- Dados Processuais e Jurídicos: Número do processo (CNJ), tribunal de origem, classe processual, área do direito, documentos probatórios anexados, petições e andamentos.
- Conversas e Comunicações: Mensagens de texto, áudios, imagens e arquivos trocados através do WhatsApp integrado (Meta Cloud API) e do chat interno do sistema.
- Dados de Cobrança e Assinaturas: Dados cadastrais para faturamento dos planos SaaS, registros de transações e comprovantes de honorários.
- Metadados de Uso: Registros de acesso (IP, data/hora, navegador), logs de auditoria e configurações de preferências.

3. Finalidades do Tratamento de Dados
Os dados coletados são tratados exclusivamente para:
- Atendimento automatizado e humanizado de clientes via WhatsApp oficial.
- Gestão processual, controle de prazos processuais e diligências judiciais.
- Redação preliminar e auxílio analítico via Inteligência Artificial (Google Gemini RAG), com supervisão jurídica humana obrigatória.
- Emissão de relatórios gerenciais, dashboards e controles de honorários.
- Cumprimento de obrigações legais, regulatórias e preservação de sigilo profissional (Estatuto da OAB).

4. Integrações com Provedores Terceiros e Segurança
A plataforma utiliza parceiros tecnológicos de alta confiabilidade:
- Meta Cloud API (WhatsApp Business): Processamento seguro das mensagens com criptografia ponta a ponta.
- Google Gemini AI: Processamento de linguagem natural e geração assistida sob contrato de confidencialidade e proteção de dados empresariais.
- ZapSign / Assinatura Digital: Formalização segura de contratos de honorários e procurações digitais.
- Supabase / PostgreSQL: Armazenamento seguro de dados com isolamento por escritório (multitenancy) e criptografia em repouso (AES-256) e em trânsito (TLS 1.3).

5. Direitos dos Titulares (Art. 18 da LGPD)
O titular dos dados tem o direito de solicitar a qualquer momento: confirmação da existência de tratamento, acesso aos dados, correção de dados incompletos ou inexatos, anonimização, bloqueio ou eliminação de dados desnecessários, portabilidade dos dados e revogação do consentimento.
Para exercer seu "Direito ao Esquecimento" ou tirar dúvidas sobre privacidade, envie solicitação para {dpo_email}.

6. Retenção e Descarte de Dados
Os dados serão conservados pelo período necessário para a prestação dos serviços jurídicos contratados ou pelo prazo prescricional legal estabelecido para a guarda de autos e documentos pelo Código de Ética e Disciplina da OAB. Ao término da finalidade, os dados serão excluídos de forma segura.

7. Foro de Eleição
Esta Política é regida pelas leis brasileiras. Fica eleito o Foro da {forum}, como competente para dirimir quaisquer dúvidas ou litígios decorrentes deste instrumento.

Encarregado pelo Tratamento de Dados (DPO): {dpo_email} | Telefone: {phone}`;

export const DEFAULT_LANDING_CONTENT = {
  hero_badge: 'Novo JusJNC 3.0 • IA Jurídica & Automação',
  hero_title_prefix: 'Gerencie seu escritório com',
  hero_title_highlight: 'eficiência e organização',
  hero_subtitle: 'A plataforma completa para advogados modernos: triagem inteligente via WhatsApp, gestão de prazos processuais e controle financeiro de honorários em um só lugar.',
  cta_primary: 'Começar Gratuitamente',
  cta_secondary: 'Já tenho conta',
  dias_teste: 30,
  contact_email: 'contato@nevesecosta.com.br',
  contact_dpo_email: 'contato@nevesecosta.com.br',
  contact_phone: '(73) 99934-8552',
  contact_forum: 'Comarca de Itamaraju - Estado da Bahia',
  footer_dev_title: 'Desenvolvidos por JNC Tecnologia.',
  copyright_ano: 2026,
  copyright_texto: 'Jus JNC. Todos os direitos reservados.',
  recursos: RECURSOS_PADRAO,
  planos: PLANOS_PADRAO,
  termos_de_uso: TERMOS_DE_USO_TEXT.trim(),
  politica_privacidade: POLITICA_PRIVACIDADE_TEXT.trim()
};

export function renderFormattedDoc(template, vars = {}) {
  if (!template) return '';
  const email = vars.contact_email || 'contato@nevesecosta.com.br';
  const dpo = vars.contact_dpo_email || vars.contact_email || 'contato@nevesecosta.com.br';
  const phone = vars.contact_phone || '(73) 99934-8552';
  const forum = vars.contact_forum || 'Comarca de Itamaraju - Estado da Bahia';

  return template
    .replace(/\{email\}/g, email)
    .replace(/\{dpo_email\}/g, dpo)
    .replace(/\{phone\}/g, phone)
    .replace(/\{forum\}/g, forum);
}
