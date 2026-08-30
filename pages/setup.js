export default function Setup() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">⚙️ Configuração Necessária</h1>
          <p className="text-gray-600">Seu backend está pronto, mas o banco de dados precisa ser configurado.</p>
        </div>

        <div className="space-y-6">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <h3 className="font-semibold text-yellow-800 mb-2">Status Atual</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>✅ Backend serverless (Next.js API Routes) — Deploy OK</li>
              <li>✅ Frontend (Next.js/React) — Deploy OK</li>
              <li>⏳ Supabase — Aguardando configuração</li>
              <li>⏳ Variáveis de ambiente — Aguardando</li>
            </ul>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <h3 className="font-semibold text-blue-800 mb-2">📋 Próximos Passos</h3>
            <ol className="text-sm text-blue-700 space-y-3">
              <li>
                <strong>1. Executar SQL no Supabase</strong>
                <p className="text-xs mt-1">Abra seu projeto Supabase → SQL Editor → New Query → Cole o arquivo <code className="bg-blue-100 px-2 py-1 rounded">supabase/migrations/002_add_chat_tables.sql</code> → Run</p>
              </li>
              <li>
                <strong>2. Configurar variáveis de ambiente</strong>
                <p className="text-xs mt-1">Vercel → Settings → Environment Variables → Adicione as 4 variáveis do Supabase</p>
              </li>
              <li>
                <strong>3. Redeploy na Vercel</strong>
                <p className="text-xs mt-1">Deployments → Selecione o último → Redeploy</p>
              </li>
              <li>
                <strong>4. Acessar o painel</strong>
                <p className="text-xs mt-1">Após redeploy, acesse <code className="bg-blue-100 px-2 py-1 rounded">https://backend-apimeta.vercel.app</code></p>
              </li>
            </ol>
          </div>

          <div className="bg-green-50 border-l-4 border-green-400 p-4">
            <h3 className="font-semibold text-green-800 mb-2">📚 Documentação</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>📖 <strong>GUIA_COMPLETO.md</strong> — Guia passo a passo completo</li>
              <li>🔒 <strong>SETUP_SUPABASE_SEGURO.md</strong> — Guia seguro para Supabase existente</li>
              <li>💾 <strong>supabase/migrations/002_add_chat_tables.sql</strong> — SQL para criar tabelas</li>
            </ul>
          </div>

          <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
            <h3 className="font-semibold text-gray-800 mb-2">🔧 Variáveis Necessárias</h3>
            <div className="text-xs text-gray-700 space-y-2 font-mono bg-gray-100 p-3 rounded">
              <div>SUPABASE_URL</div>
              <div>SUPABASE_SERVICE_ROLE_KEY</div>
              <div>NEXT_PUBLIC_SUPABASE_URL</div>
              <div>NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
            </div>
          </div>

          <div className="text-center pt-4">
            <p className="text-sm text-gray-600">
              Dúvidas? Veja os arquivos de documentação no repositório GitHub.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
