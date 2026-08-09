import Head from 'next/head';

export default function PoliticaDePrivacidade() {
  return (
    <>
      <Head>
        <title>Política de Privacidade - Backend API Meta</title>
        <meta name="description" content="Política de Privacidade do Backend API Meta" />
      </Head>
      <main className="max-w-3xl mx-auto p-8 bg-white min-h-screen">
        <h1 className="text-3xl font-bold mb-6 text-gray-900">Política de Privacidade</h1>
        <p className="text-sm text-gray-600 mb-6">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">1. Introdução</h2>
          <p className="text-gray-700 leading-relaxed">
            Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos as informações dos usuários
            que interagem com nosso serviço de atendimento via WhatsApp. Ao utilizar nosso serviço, você concorda com as práticas
            descritas neste documento.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">2. Dados Coletados</h2>
          <p className="text-gray-700 leading-relaxed">
            Coletamos apenas as informações necessárias para prestar o serviço de atendimento, incluindo:
          </p>
          <ul className="list-disc pl-6 mt-2 text-gray-700 space-y-1">
            <li>Número de telefone do remetente (para identificação da conversa)</li>
            <li>Conteúdo das mensagens trocadas durante o atendimento</li>
            <li>Data e hora das mensagens</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">3. Uso das Informações</h2>
          <p className="text-gray-700 leading-relaxed">
            As informações coletadas são utilizadas exclusivamente para:
          </p>
          <ul className="list-disc pl-6 mt-2 text-gray-700 space-y-1">
            <li>Responder às mensagens recebidas</li>
            <li>Manter o histórico de atendimento</li>
            <li>Melhorar a qualidade do serviço prestado</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">4. Compartilhamento de Dados</h2>
          <p className="text-gray-700 leading-relaxed">
            Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros, exceto quando necessário para o funcionamento
            técnico do serviço (como provedores de hospedagem e APIs oficiais do WhatsApp) ou por exigência legal.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">5. Armazenamento e Segurança</h2>
          <p className="text-gray-700 leading-relaxed">
            Os dados são armazenados em servidores seguros e adotamos medidas técnicas e administrativas para proteger as
            informações contra acesso não autorizado, perda ou destruição.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">6. Direitos do Usuário</h2>
          <p className="text-gray-700 leading-relaxed">
            O usuário pode solicitar acesso, correção ou exclusão de seus dados pessoais a qualquer tempo, entrando em contato
            pelo canal de atendimento disponibilizado.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-800">7. Alterações nesta Política</h2>
          <p className="text-gray-700 leading-relaxed">
            Esta política pode ser atualizada periodicamente. Recomendamos que você a consulte regularmente para se manter
            informado sobre nossas práticas de privacidade.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2 text-gray-800">8. Contato</h2>
          <p className="text-gray-700 leading-relaxed">
            Em caso de dúvidas sobre esta Política de Privacidade, entre em contato pelo WhatsApp de atendimento.
          </p>
        </section>
      </main>
    </>
  );
}
