const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const clean = s => s ? String(s).trim().replace(/^["']|["']$/g, '') : '';
const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const baseUrl = clean(process.env.NEXT_PUBLIC_BASE_URL || 'https://backend-apimeta.vercel.app');
const testToken = clean(process.env.API_TEST_TOKEN);

if (!url || !key) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local ou ambiente.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function counts() {
  const { count: docs, error: e1 } = await supabase.from('knowledge_documents').select('*', { count: 'exact', head: true });
  const { count: approved, error: e2 } = await supabase.from('knowledge_documents').select('*', { count: 'exact', head: true }).eq('status', 'aprovado');
  const { count: rascunho, error: e3 } = await supabase.from('knowledge_documents').select('*', { count: 'exact', head: true }).eq('status', 'rascunho');
  const { count: revisado, error: e4 } = await supabase.from('knowledge_documents').select('*', { count: 'exact', head: true }).eq('status', 'revisado');
  const { count: chunks, error: e5 } = await supabase.from('knowledge_chunks').select('*', { count: 'exact', head: true });
  const { count: logs, error: e6 } = await supabase.from('knowledge_query_logs').select('*', { count: 'exact', head: true });
  if (e1 || e2 || e3 || e4 || e5 || e6) throw e1 || e2 || e3 || e4 || e5 || e6;
  return { docs, approved, rascunho, revisado, chunks, logs };
}

async function chunksPerDoc() {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, title, status, knowledge_chunks(count)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data.map(d => ({ id: d.id, title: d.title, status: d.status, chunks: d.knowledge_chunks[0]?.count || 0 }));
}

async function testSearch(query, filters = {}) {
  try {
    const { data, error } = await supabase.rpc('search_knowledge', {
      search_query: query,
      filter_status: filters.status || 'aprovado',
      filter_area: filters.area || null,
      filter_tribunal: filters.tribunal || null,
      filter_type: filters.type || null
    });
    if (error) throw error;
    const docs = [...new Map((data || []).map(r => [r.document_id, r.title])).values()];
    return { ok: true, query, count: (data || []).length, docs };
  } catch (err) {
    return { ok: false, query, error: err.message };
  }
}

async function testEndpoint(query) {
  if (!testToken) return { skipped: true, reason: 'API_TEST_TOKEN ausente' };
  try {
    const start = Date.now();
    const res = await axios.post(`${baseUrl}/api/ai/ask`, {
      query,
      area: null,
      tribunal: null,
      type: null
    }, {
      headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
      timeout: 25000
    });
    return {
      ok: true,
      status: res.status,
      durationMs: Date.now() - start,
      chunksCount: res.data?.sources?.length || 0,
      sources: (res.data?.sources || []).map(s => ({ title: s.title, type: s.type, area: s.area, tribunal: s.tribunal }))
    };
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status,
      error: err.response?.data?.error || err.message
    };
  }
}

async function main() {
  const c = await counts();
  console.log('\n=== COUNTS ===');
  console.log(`knowledge_documents: ${c.docs}`);
  console.log(`  aprovado:  ${c.approved}`);
  console.log(`  rascunho:  ${c.rascunho}`);
  console.log(`  revisado:  ${c.revisado}`);
  console.log(`knowledge_chunks:    ${c.chunks}`);
  console.log(`knowledge_query_logs: ${c.logs}`);

  console.log('\n=== CHUNKS POR DOCUMENTO (últimos 10) ===');
  const byDoc = await chunksPerDoc();
  for (const d of byDoc) {
    console.log(`- ${d.title} [${d.status}] → ${d.chunks} chunks`);
  }

  console.log('\n=== TEST search_knowledge ===');
  for (const q of [
    'cobrança indevida',
    'Gere um rascunho de petição inicial sobre cobrança indevida, repetição do indébito e danos morais.',
    'tributário imposto de renda'
  ]) {
    console.log(await testSearch(q));
  }

  console.log('\n=== TEST /api/ai/ask ===');
  console.log(await testEndpoint('cobrança indevida'));
}

main().catch(err => { console.error(err); process.exit(1); });
