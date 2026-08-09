export default function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const nextPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const nextPublicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  res.status(200).json({
    message: 'Teste de variáveis de ambiente',
    supabaseUrl: supabaseUrl ? '✅ Configurada' : '❌ Não configurada',
    supabaseKey: supabaseKey ? '✅ Configurada' : '❌ Não configurada',
    nextPublicUrl: nextPublicUrl ? '✅ Configurada' : '❌ Não configurada',
    nextPublicKey: nextPublicKey ? '✅ Configurada' : '❌ Não configurada',
    supabaseUrlValue: supabaseUrl,
    nextPublicUrlValue: nextPublicUrl,
  });
}
