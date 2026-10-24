const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// 1. Conexão com Supabase antigo (origem)
const legacy = createClient(
  'https://fubsrxeepjuajqdrgkdd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1YnNyeGVlcGp1YWpxZHJna2RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDA2MDcsImV4cCI6MjA3ODc3NjYwN30.sLtEozPuOtn708qHCSwapnmkVUOQ_yDHRu3buJrxaT4'
);

// 2. Conexão com Supabase oficial de produção (destino)
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of envContent.split(/\r?\n/)) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    envVars[key] = val;
  }
}

const target = createClient(
  envVars.SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
);

const OFFICE_ID = '00000000-0000-0000-0000-000000000001';

function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

async function migrate() {
  console.log('--- INICIANDO MIGRAÇÃO DE DADOS DO SISTEMA JNC ---');

  // A. Migrar Clientes (92 clientes)
  const { data: legacyClients, error: errClients } = await legacy.from('clientes').select('*');
  if (errClients) {
    console.error('Erro ao ler clientes legados:', errClients);
    return;
  }
  console.log(`Lidos ${legacyClients.length} clientes do sistema legado.`);

  let clientsMigrated = 0;
  for (const c of legacyClients) {
    const phoneRaw = c.telefone || '';
    const phoneDigits = normalizePhone(phoneRaw);
    if (!phoneDigits) continue;

    // Normaliza para formato E.164 nacional (55XXXXXXXXXXX)
    const phoneNormalized = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;

    // Inserir / Atualizar em chat_clients
    const { error: clientErr } = await target
      .from('chat_clients')
      .upsert({
        name: c.nome,
        phone: phoneNormalized,
        person_type: c.tipo_pessoa || 'fisica',
        document_number: c.cnpj || null,
        company_contact_name: c.contato_pj || null,
        email: c.email || null,
        birth_or_foundation_date: c.data_nascimento || c.data_criacao_pj || null,
        notes: c.observacoes || null,
        office_id: OFFICE_ID,
        updated_at: new Date().toISOString()
      }, { onConflict: 'phone' });

    if (clientErr) {
      console.warn(`Aviso ao upsert chat_client (${c.nome}):`, clientErr.message);
    }

    // Inserir / Atualizar em conversations para aparecer na listagem do WhatsApp / Clientes
    const { data: existingConv } = await target
      .from('conversations')
      .select('id')
      .eq('client_phone', phoneNormalized)
      .maybeSingle();

    if (!existingConv) {
      await target.from('conversations').insert({
        client_name: c.nome,
        client_phone: phoneNormalized,
        client_phone_normalized: phoneDigits,
        client_status: 'cliente_ativo',
        funnel_stage: 'cliente_ativo',
        person_type: c.tipo_pessoa || 'fisica',
        document_number: c.cnpj || null,
        company_contact_name: c.contato_pj || null,
        email: c.email || null,
        birth_or_foundation_date: c.data_nascimento || c.data_criacao_pj || null,
        office_id: OFFICE_ID
      });
    } else {
      await target.from('conversations').update({
        client_name: c.nome,
        person_type: c.tipo_pessoa || 'fisica',
        document_number: c.cnpj || null,
        birth_or_foundation_date: c.data_nascimento || c.data_criacao_pj || null,
        office_id: OFFICE_ID
      }).eq('id', existingConv.id);
    }

    clientsMigrated++;
  }
  console.log(`✅ ${clientsMigrated} clientes sincronizados com sucesso.`);

  // B. Migrar Eventos e Audiências para Cases / Case Events
  const { data: legacyEvents, error: errEvents } = await legacy.from('eventos').select('*');
  if (errEvents) {
    console.error('Erro ao ler eventos legados:', errEvents);
  } else {
    console.log(`Lidos ${legacyEvents.length} eventos legados.`);
    let eventsMigrated = 0;
    for (const ev of legacyEvents) {
      // Buscar cliente correspondente
      const legacyClient = legacyClients.find(c => c.id === ev.cliente_id);
      const clientName = legacyClient?.nome || 'Cliente';
      const phoneDigits = normalizePhone(legacyClient?.telefone || '');
      const phoneNormalized = phoneDigits ? (phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits) : null;

      // Buscar conversa vinculada
      let convId = null;
      if (phoneNormalized) {
        const { data: conv } = await target
          .from('conversations')
          .select('id')
          .eq('client_phone', phoneNormalized)
          .maybeSingle();
        convId = conv?.id || null;
      }

      // Inserir como Caso / Processo na tabela cases
      const { data: newCase, error: caseErr } = await target
        .from('cases')
        .insert({
          title: `${ev.titulo} — ${clientName}`,
          conversation_id: convId,
          legal_area: 'civel',
          case_type: ev.tipo || 'audiencia',
          process_number: ev.numero_processo || null,
          case_value: ev.valor || null,
          deadline_date: ev.data || null,
          deadline_type: ev.tipo === 'audiencia' ? 'data_de_audiencia' : 'prazo_judicial',
          status: ev.status === 'cumprido' ? 'encerrado' : 'acao_protocolada',
          priority: ev.valor && ev.valor > 20000 ? 'alta' : 'media',
          notes: ev.descricao || `Importado do Sistema JNC. Horário: ${ev.horario || 'N/I'}`,
          court: ev.numero_processo && ev.numero_processo.includes('5.05') ? 'TRT' : 'TJ',
          office_id: OFFICE_ID
        })
        .select('id')
        .single();

      if (caseErr) {
        console.warn(`Aviso ao inserir case (${ev.titulo}):`, caseErr.message);
      } else {
        eventsMigrated++;
      }
    }
    console.log(`✅ ${eventsMigrated} casos/audiências importados para a base de produção.`);
  }

  console.log('--- MIGRAÇÃO CONCLUÍDA COM ÊXITO! ---');
}

migrate();
