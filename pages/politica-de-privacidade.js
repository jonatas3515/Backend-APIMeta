import Head from 'next/head';
import Link from 'next/link';

export default function PoliticaDePrivacidade() {
  return (
    <>
      <Head>
        <title>Política de Privacidade e Proteção de Dados - JusJNC</title>
        <meta name="description" content="Política de Privacidade e Proteção de Dados da Plataforma Jurídica JusJNC e Escritórios Parceiros" />
      </Head>
      <main className="max-w-4xl mx-auto p-6 md:p-10 bg-white min-h-screen text-gray-800">
        <div className="mb-8 border-b border-gray-200 pb-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-red-600 hover:text-red-700 hover:underline">
            <span>←</span> Voltar para a Página Inicial
          </Link>
          <h1 className="text-3xl font-extrabold mt-3 text-gray-900">📋 Política de Privacidade e Proteção de Dados</h1>
          <p className="text-sm text-gray-500 mt-1">
            <strong>Última atualização:</strong> 24 de outubro de 2026 | <strong>Versão:</strong> 3.1
          </p>
          <p className="text-sm text-gray-600 mt-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
            Você pode solicitar a exclusão de seus dados pessoais a qualquer momento. Envie um e-mail para{' '}
            <a href="mailto:dpo@jusjnc.com.br" className="text-red-600 font-semibold hover:underline">
              dpo@jusjnc.com.br
            </a>{' '}
            com o assunto <strong>&quot;Direito ao Esquecimento - LGPD&quot;</strong>.
          </p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">1. Introdução e Escopo</h2>
            <p className="mb-2">
              Esta Política de Privacidade e Proteção de Dados descreve como a plataforma <strong>JusJNC</strong> (&quot;Plataforma&quot;, &quot;Nós&quot; ou &quot;JusJNC Tecnologia&quot;), em conjunto com os escritórios de advocacia conveniados, coleta, utiliza, armazena, processa e protege os dados pessoais de advogados, clientes, leads e colaboradores.
            </p>
            <p>
              Estamos em estrita conformidade com a <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>, o Marco Civil da Internet (Lei nº 12.965/2014) e as diretrizes éticas da Ordem dos Advogados do Brasil (OAB).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">2. Categorias de Dados Coletados</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Dados Cadastrais e de Identificação:</strong> Nome completo, CPF, RG, data de nascimento, endereço, e-mail e número de telefone/WhatsApp.</li>
              <li><strong>Dados Processuais:</strong> Número CNJ do processo, tribunal, vara, área jurídica, movimentações e prazos processuais.</li>
              <li><strong>Comunicações e Interações:</strong> Mensagens de texto, áudios e anexos trocados no atendimento automatizado via WhatsApp ou chat web.</li>
              <li><strong>Dados Operacionais e de Auditoria:</strong> Logs de acesso (IP, data e hora), permissões de usuários e registros de modificações.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">3. Finalidades e Bases Legais do Tratamento</h2>
            <p className="mb-2">
              O tratamento de dados é realizado estritamente nas seguintes hipóteses legais (Art. 7º da LGPD):
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Execução de Contrato:</strong> Prestação de serviços jurídicos e disponibilização das ferramentas do SaaS.</li>
              <li><strong>Cumprimento de Obrigação Legal ou Regulatória:</strong> Guarda de registros e respeito aos prazos do Estatuto da Advocacia.</li>
              <li><strong>Exercício Regular de Direitos:</strong> Em processos judiciais, administrativos ou arbitrais.</li>
              <li><strong>Legítimo Interesse:</strong> Segurança da informação, melhoria de recursos e prevenção contra fraudes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">4. Tecnologias Integradas e Inteligência Artificial</h2>
            <p className="mb-2">
              A plataforma JusJNC integra os seguintes serviços tecnológicos com garantia de confidencialidade:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Meta WhatsApp Cloud API:</strong> Transmissão direta e criptografada de mensagens.</li>
              <li><strong>Google Gemini AI (RAG Jurídico):</strong> Processamento de linguagem natural para assistência de triagem e sugestão de minutas, sempre sob chancela humana.</li>
              <li><strong>ZapSign:</strong> Coleta de assinaturas eletrônicas com validade jurídica garantida por MP nº 2.200-2/2001.</li>
              <li><strong>Supabase:</strong> Banco de dados relacional com criptografia AES-256 e backups automatizados.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">5. Direitos dos Titulares de Dados</h2>
            <p className="mb-2">
              Em conformidade com o Art. 18 da LGPD, você pode exercer os seguintes direitos:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Confirmação da existência de tratamento e acesso aos seus dados pessoais.</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos.</li>
              <li>Portabilidade dos dados a outro fornecedor de serviços mediante requisição expressa.</li>
              <li>Eliminação definitiva dos dados tratados com consentimento (&quot;Direito ao Esquecimento&quot;).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">6. Segurança da Informação</h2>
            <p>
              Adotamos medidas técnicas e administrativas aptas a proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração ou comunicação, incluindo criptografia TLS em trânsito e controle rigoroso de privilégios de acesso baseado em papéis (RBAC).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">7. Foro de Eleição</h2>
            <p>
              Esta Política é regida pelas leis da República Federativa do Brasil. Para a resolução de quaisquer conflitos decorrentes deste documento, fica eleito o <strong>Foro da Comarca de Itamaraju - Estado da Bahia</strong>.
            </p>
          </section>

          <section className="pt-4 border-t border-gray-200 text-xs text-gray-500">
            Encarregado pelo Tratamento de Dados (DPO):{' '}
            <a href="mailto:dpo@jusjnc.com.br" className="text-red-600 hover:underline">
              dpo@jusjnc.com.br
            </a>{' '}
            | Itamaraju - BA
          </section>
        </div>
      </main>
    </>
  );
}
