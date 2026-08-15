import Head from 'next/head';

export default function PoliticaDePrivacidade() {
  return (
    <>
      <Head>
        <title>Política de Privacidade e Proteção de Dados - Neves & Costa</title>
        <meta name="description" content="Política de Privacidade e Proteção de Dados do Neves & Costa Advocacia e Consultoria" />
      </Head>
      <main className="max-w-4xl mx-auto p-8 bg-white min-h-screen">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">📋 Política de Privacidade e Proteção de Dados</h1>
        <p className="text-sm text-gray-600 mb-2">
          <strong>Última atualização:</strong> 14 de agosto de 2026
        </p>
        <p className="text-sm text-gray-600 mb-8">
          <strong>Versão:</strong> 2.0
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Você pode solicitar a exclusão de seus dados pessoais a qualquer momento. Envie um e-mail para{' '}
          <a href="mailto:contato@nevesecosta.com.br" className="text-blue-600 hover:underline">
            contato@nevesecosta.com.br
          </a>
          {' '}com o assunto &quot;Direito ao Esquecimento&quot;.
        </p>
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">1. Introdução</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Esta Política de Privacidade e Proteção de Dados descreve como o Neves & Costa Advocacia e Consultoria ("Escritório"), no uso do sistema Neves & Costa Chat System, coleta, usa, armazena, compartilha e protege as informações pessoais de clientes, leads e usuários do serviço de atendimento jurídico via WhatsApp e plataforma web.
          </p>
          <p className="text-gray-700 leading-relaxed mb-3">
            O sistema está em conformidade com a Lei Geral de Proteção de Dados (LGPD) — Lei nº 13.709/2018 e demais normas aplicáveis de privacidade e proteção de dados no Brasil.
          </p>
          <p className="text-gray-700 leading-relaxed">
            Ao utilizar nosso serviço, você concorda com as práticas descritas neste documento. Se não concordar, não utilize o serviço.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">2. Dados Coletados</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Coletamos as seguintes categorias de informações, conforme a finalidade descrita:
          </p>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">2.1. Dados de Identificação</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Nome completo (quando informado)</li>
            <li>Número de telefone/WhatsApp</li>
            <li>Endereço de e-mail (quando informado)</li>
            <li>CPF (quando necessário para o caso jurídico)</li>
            <li>Município e estado de residência</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">2.2. Dados da Conversa</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Conteúdo das mensagens trocadas via WhatsApp (texto, áudio, imagens, documentos)</li>
            <li>Data e hora de cada mensagem</li>
            <li>Histórico de interações com o sistema (incluindo respostas automáticas da IA)</li>
            <li>Metadados da conversa (ID da conversa, status, etapa do funil)</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">2.3. Dados do Caso Jurídico</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Área jurídica (ex: Trabalhista, Administrativo, Previdenciário)</li>
            <li>Tipo de caso (ex: Ação Trabalhista, Benefício Previdenciário, Licença Premium)</li>
            <li>Órgão ou agência envolvida (ex: INSS, Prefeitura Municipal, TJBA)</li>
            <li>Status e prioridade do caso</li>
            <li>Prazos e eventos processuais</li>
            <li>Documentos enviados e recebidos</li>
            <li>Anotações internas da equipe</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">2.4. Dados de Uso do Sistema</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Data e hora de login dos usuários (advogados, estagiários, administradores)</li>
            <li>Ações realizadas no sistema (criação de casos, edição, exclusão, exportação)</li>
            <li>Logs de auditoria (quem fez o quê e quando)</li>
            <li>Preferências de notificação e configurações do perfil</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">2.5. Dados Sensíveis (quando aplicável)</h3>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Informações de saúde (laudos, atestados médicos)</li>
            <li>Dados biométricos (RG, CNH com foto)</li>
            <li>Filiação sindical</li>
            <li>Situação trabalhista e previdenciária</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mt-2">
            <strong>Base legal para coleta:</strong> Execução de contrato, obrigação legal, legítimo interesse e consentimento (quando aplicável).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">3. Finalidades do Uso das Informações</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            As informações coletadas são utilizadas exclusivamente para:
          </p>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">3.1. Atendimento ao Cliente</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Responder às mensagens recebidas via WhatsApp</li>
            <li>Realizar triagem automática com inteligência artificial</li>
            <li>Manter histórico completo de atendimento</li>
            <li>Informar andamento de casos e prazos</li>
            <li>Enviar notificações de eventos e lembretes</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">3.2. Gestão de Casos Jurídicos</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Criar e gerenciar casos jurídicos</li>
            <li>Controlar prazos processuais e eventos</li>
            <li>Atribuir casos a advogados responsáveis</li>
            <li>Gerar documentos e rotinas jurídicas</li>
            <li>Acompanhar etapas do funil de atendimento</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">3.3. Melhoria do Serviço</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Analisar métricas de demanda e conversão</li>
            <li>Extrair aprendizados de casos encerrados (insights)</li>
            <li>Treinar modelos de IA para respostas mais precisas</li>
            <li>Identificar gargalos no fluxo de atendimento</li>
            <li>Otimizar processos internos do escritório</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">3.4. Conformidade Legal</h3>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Cumprir obrigações legais e regulatórias</li>
            <li>Manter auditoria de ações no sistema</li>
            <li>Responder a requisições judiciais ou administrativas</li>
            <li>Preservar direitos em processos judiciais</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">4. Compartilhamento de Dados</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Não vendemos, alugamos ou comercializamos dados pessoais. O compartilhamento ocorre apenas nas seguintes hipóteses:
          </p>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">4.1. Prestadores de Serviço (Operadores de Dados)</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>WhatsApp Cloud API (Meta): para recebimento e envio de mensagens</li>
            <li>Google Gemini: para processamento de linguagem natural e respostas automáticas (dados anonimizados quando possível)</li>
            <li>Supabase: para armazenamento em banco de dados (PostgreSQL)</li>
            <li>Vercel: para hospedagem da aplicação web</li>
            <li>Google Cloud / Microsoft Azure: para integração com calendários (quando autorizado)</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-4">
            Todos os prestadores assinam contratos de confidencialidade e estão em conformidade com LGPD.
          </p>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">4.2. Autoridades e Terceiros</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Por exigência legal ou ordem judicial</li>
            <li>Para proteção de direitos do escritório em disputas legais</li>
            <li>Para autoridades competentes em investigações de fraude ou segurança</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">4.3. Dados Anonimizados</h3>
          <p className="text-gray-700 leading-relaxed">
            Podemos compartilhar dados anonimizados ou agregados (que não identificam indivíduos) para fins estatísticos, acadêmicos ou de melhoria de serviço.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">5. Armazenamento e Segurança</h2>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">5.1. Local de Armazenamento</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Dados armazenados em servidores cloud (Supabase, Vercel) com data centers em conformidade com LGPD</li>
            <li>Backups automáticos realizados periodicamente</li>
            <li>Dados criptografados em trânsito (HTTPS/TLS) e em repouso (criptografia no banco)</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">5.2. Medidas de Segurança</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Autenticação de usuários com Supabase Auth</li>
            <li>Controle de acesso baseado em papéis (admin, advogado, estagiário)</li>
            <li>Logs de auditoria de todas as ações no sistema</li>
            <li>Criptografia de tokens e dados sensíveis no banco</li>
            <li>Monitoramento de acessos não autorizados</li>
            <li>Políticas de retenção e exclusão de dados</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">5.3. Retenção de Dados</h3>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Leads não convertidos: 6 meses após último contato (anonimização automática)</li>
            <li>Casos ativos: durante vigência do caso + 5 anos (obrigação legal)</li>
            <li>Casos encerrados: 5 anos após encerramento (prazo prescricional)</li>
            <li>Logs de auditoria: 5 anos</li>
            <li>Dados de saúde: 20 anos (obrigação do Código de Ética da OAB)</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mt-2">
            Após o prazo de retenção, dados são anonimizados ou excluídos, salvo obrigação legal de manutenção.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">6. Direitos do Titular (LGPD)</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Em conformidade com o Art. 18 da LGPD, você tem direito a:
          </p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li><strong>Confirmação:</strong> saber se tratamos seus dados</li>
            <li><strong>Acesso:</strong> solicitar cópia dos dados que mantemos sobre você</li>
            <li><strong>Correção:</strong> retificar dados incompletos, inexatos ou desatualizados</li>
            <li><strong>Anonimização, bloqueio ou eliminação:</strong> solicitar exclusão de dados desnecessários ou excessivos</li>
            <li><strong>Portabilidade:</strong> transferir seus dados a outro fornecedor de serviço (quando aplicável)</li>
            <li><strong>Eliminação:</strong> excluir dados tratados com consentimento (quando aplicável)</li>
            <li><strong>Revogação do consentimento:</strong> retirar consentimento a qualquer momento</li>
            <li><strong>Revisão de decisões automatizadas:</strong> solicitar revisão de decisões tomadas apenas com base em processamento automático</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mt-3">
            <strong>Como exercer seus direitos:</strong> Envie solicitação para <a className="text-blue-600 hover:underline" href="mailto:contato@nevesecosta.com.br">contato@nevesecosta.com.br</a> ou pelo WhatsApp de atendimento. Respondemos em até 15 dias úteis.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">7. Consentimento e Transparência</h2>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">7.1. Coleta de Consentimento</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Ao iniciar conversa no WhatsApp, você é informado sobre esta política</li>
            <li>Para dados sensíveis, solicitamos consentimento explícito</li>
            <li>Consentimentos são registrados em log (data, hora, IP, termo aceito)</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">7.2. Retirada de Consentimento</h3>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Você pode retirar consentimento a qualquer momento</li>
            <li>A retirada não invalida tratamentos anteriores feitos com base no consentimento</li>
            <li>Dados necessários para obrigações legais serão mantidos mesmo após retirada</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">8. Inteligência Artificial e Automatização</h2>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">8.1. Uso de IA</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Utilizamos Google Gemini para triagem automática e respostas iniciais</li>
            <li>IA não substitui advogado humano — respostas são revisadas quando necessário</li>
            <li>Dados enviados à IA são anonimizados quando possível</li>
            <li>Não tomamos decisões jurídicas automatizadas que afetem seus direitos sem revisão humana</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">8.2. Transparência</h3>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Você será informado quando estiver falando com IA ("Jhon, estagiário virtual")</li>
            <li>Pode solicitar atendimento humano a qualquer momento</li>
            <li>Respostas de IA incluem disclaimer: "Esta resposta é automática e não garante resultado jurídico"</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">9. Cookies e Tecnologias de Rastreamento</h2>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">9.1. Cookies do Sistema</h3>
          <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-1">
            <li>Cookies de sessão (expiram ao fechar navegador)</li>
            <li>Cookies de autenticação (duração: 7 dias)</li>
            <li>Cookies de preferências (ex: tema, notificações)</li>
          </ul>

          <h3 className="text-lg font-semibold mb-2 text-gray-800">9.2. Analytics</h3>
          <p className="text-gray-700 leading-relaxed">
            Não utilizamos ferramentas de analytics de terceiros. Dados de uso (ex: páginas acessadas, tempo de sessão) são coletados apenas para melhoria interna.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">10. Transferência Internacional de Dados</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Alguns prestadores de serviço (ex: Supabase, Vercel, Google) podem armazenar dados em servidores fora do Brasil. Garantimos que:
          </p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Todos os prestadores estão em conformidade com LGPD</li>
            <li>Contratos incluem cláusulas de proteção de dados</li>
            <li>Dados sensíveis são criptografados antes de transferência</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">11. Violação de Dados</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Em caso de violação de segurança que possa causar risco ou dano relevante aos titulares:
          </p>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Notificaremos a ANPD (Autoridade Nacional de Proteção de Dados) em até 3 dias úteis</li>
            <li>Notificaremos os titulares afetados de forma clara e transparente</li>
            <li>Tomaremos medidas para mitigar danos e evitar recorrência</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">12. Alterações nesta Política</h2>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Esta política pode ser atualizada periodicamente para refletir mudanças no sistema, na legislação ou nas práticas do escritório</li>
            <li>Alterações significativas serão comunicadas por e-mail ou WhatsApp</li>
            <li>Data de última atualização será revisada no topo do documento</li>
            <li>Uso continuado do serviço após alterações implica aceitação</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">13. Canal de Atendimento aos Direitos do Titular</h2>
          <p className="text-gray-700 leading-relaxed mb-3">
            Em conformidade com a Resolução CD/ANPD nº 2/2022, nosso escritório está dispensado da indicação de um Encarregado pelo Tratamento de Dados Pessoais (DPO). No entanto, disponibilizamos um canal direto para que você possa exercer seus direitos de privacidade ou tirar dúvidas:
          </p>
          <ul className="list-disc pl-6 mb-3 text-gray-700 space-y-1">
            <li><strong>E-mail:</strong> <a className="text-blue-600 hover:underline" href="mailto:contato@nevesecosta.com.br">contato@nevesecosta.com.br</a></li>
            <li><strong>WhatsApp:</strong> 73 99934-8552</li>
            <li><strong>Página web:</strong> <a className="text-blue-600 hover:underline" href="https://www.nevesecosta.com.br" target="_blank" rel="noopener noreferrer">www.nevesecosta.com.br</a></li>
          </ul>
          <p className="text-gray-700 leading-relaxed">
            Caso não fique satisfeito com nossa resposta, você pode contatar a Autoridade Nacional de Proteção de Dados (ANPD): <a className="text-blue-600 hover:underline" href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer">https://www.gov.br/anpd</a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">14. Disposições Finais</h2>
          <ul className="list-disc pl-6 text-gray-700 space-y-1">
            <li>Esta política se aplica a todos os usuários do sistema (clientes, leads, advogados, estagiários, administradores)</li>
            <li>Termos não definidos aqui seguem definições da LGPD</li>
            <li>Em caso de conflito entre esta política e contrato de prestação de serviços, prevalece o contrato</li>
            <li>Esta política é complementar ao Termo de Uso do sistema</li>
          </ul>
        </section>

        <p className="text-sm text-gray-600 mt-8 border-t pt-4">
          Nota: Esta política foi elaborada em conformidade com a Lei Geral de Proteção de Dados (LGPD) — Lei nº 13.709/2018 e atualizações.
        </p>
      </main>
    </>
  );
}
