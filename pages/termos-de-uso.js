import Head from 'next/head';
import Link from 'next/link';

export default function TermosDeUso() {
  return (
    <>
      <Head>
        <title>Termos de Uso - JusJNC & Neves & Costa</title>
        <meta name="description" content="Termos de Uso e Condições Gerais dos Serviços Jurídicos e da Plataforma JusJNC SaaS" />
      </Head>
      <main className="max-w-4xl mx-auto p-6 md:p-10 bg-white min-h-screen text-gray-800">
        <div className="mb-8 border-b pb-4">
          <Link href="/" className="text-sm font-semibold text-red-600 hover:underline">
            ← Voltar para o início
          </Link>
          <h1 className="text-3xl font-extrabold mt-3 text-gray-900">📄 Termos de Uso e Condições Gerais</h1>
          <p className="text-sm text-gray-500 mt-1">
            <strong>Última atualização:</strong> 24 de outubro de 2026 | <strong>Versão:</strong> 3.0
          </p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou utilizar a plataforma <strong>JusJNC</strong> e os serviços de atendimento jurídico integrados do escritório <strong>Neves & Costa Advocacia e Consultoria</strong> (&quot;Plataforma&quot;, &quot;Nós&quot; ou &quot;Escritório&quot;), você concorda integralmente com estes Termos de Uso e com a nossa{' '}
              <Link href="/politica-de-privacidade" className="text-red-600 hover:underline font-medium">
                Política de Privacidade
              </Link>.
              Caso discorde de qualquer disposição, solicitamos que interrompa imediatamente o uso da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">2. Descrição dos Serviços e Natureza Jurídica</h2>
            <p className="mb-2">
              O <strong>JusJNC</strong> é uma plataforma SaaS (Software as a Service) voltada à gestão de escritórios de advocacia, combinando automação de atendimento via WhatsApp (Meta Cloud API), triagem processual, acompanhamento de prazos, cálculos de honorários e inteligência jurídica generativa.
            </p>
            <p>
              A atuação jurídica fornecida diretamente aos clientes finais segue rigorosamente o Estatuto da Advocacia e da OAB (Lei nº 8.906/1994), o Código de Ética e Disciplina da OAB e o Provimento nº 205/2021 sobre publicidade e tecnologia jurídica.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">3. Uso de Inteligência Artificial e Automação</h2>
            <p className="mb-2">
              A plataforma incorpora modelos avançados de Inteligência Artificial (Google Gemini) para apoiar na triagem de mensagens recebidas, redação preliminar de peças e sugestões contextuais baseadas em conhecimento jurídico (RAG - Retrieval Augmented Generation).
            </p>
            <p>
              <strong>Atenção:</strong> Todas as decisões jurídicas, protocolos judiciais e orientações finais são revisadas e homologadas por advogados devidamente inscritos na OAB. A IA atua exclusivamente como ferramenta de produtividade e assistência operacional.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">4. Segurança da Conta e Responsabilidades do Usuário</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Você é responsável pela confidencialidade de suas credenciais de acesso (usuário e senha).</li>
              <li>O usuário se compromete a não fornecer dados falsos ou se passar por terceiros.</li>
              <li>É expressamente proibida qualquer tentativa de engenharia reversa, invasão, extração massiva não autorizada (scraping) ou sobrecarga da infraestrutura da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">5. Proteção de Dados e Privacidade (LGPD)</h2>
            <p>
              O tratamento de dados pessoais realizado pela plataforma obedece aos ditames da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais - LGPD). Garantimos aos titulares o pleno exercício de seus direitos, incluindo acesso, retificação, revogação de consentimento e solicitação de exclusão definitiva (&quot;Direito ao Esquecimento&quot;) através de nossos canais oficiais de DPO.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">6. Planos, Assinaturas e Pagamentos</h2>
            <p className="mb-2">
              Para advogados e escritórios terceiros utilizadores do software JusJNC, os planos de assinatura (Básico, Profissional e Enterprise) concedem licença de uso limitada, revogável e não exclusiva durante a vigência do contrato.
            </p>
            <p>
              O inadimplemento de mensalidades após o período de carência poderá resultar na suspensão temporária do acesso aos módulos premium até a regularização financeira.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">7. Backup e Retenção de Dados</h2>
            <p>
              A plataforma realiza rotinas periódicas de salvamento e disponibiliza ferramentas para que cada escritório exporte seus dados e relatórios em formato JSON e PDF a qualquer tempo. Em caso de encerramento contratual, os dados poderão ser mantidos pelo prazo prescricional estipulado pela legislação aplicável e pelo Código de Ética da OAB para guarda de arquivos jurídicos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-2">8. Foro de Eleição</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Para dirimir eventuais controvérsias oriundas deste documento, fica eleito o Foro da Comarca de Ilhéus, Estado da Bahia, com exclusão de qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          <section className="pt-4 border-t text-xs text-gray-500">
            Dúvidas sobre estes Termos de Uso? Entre em contato pelo e-mail:{' '}
            <a href="mailto:contato@nevesecosta.com.br" className="text-red-600 hover:underline">
              contato@nevesecosta.com.br
            </a>
          </section>
        </div>
      </main>
    </>
  );
}
