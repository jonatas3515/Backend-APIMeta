#!/usr/bin/env node

/**
 * Script para aplicar Migration 056 no Supabase
 * Revoga acesso publico (anon/authenticated) a agenda_consolidada e get_agenda
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Carrega .env.local sem dependencia externa
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Variaveis de ambiente nao configuradas');
  console.error('   NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function execSql(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    return { data, error };
  } catch (e) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return { data: await response.json(), error: null };
  }
}

async function applyMigration() {
  console.log('Aplicando Migration 056 (revogar acesso publico da agenda)...\n');

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '056_revoke_agenda_consolidada_public_access.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error('Arquivo de migration nao encontrado:', migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    const { error } = await execSql(sql);

    if (error) {
      console.error('Erro ao aplicar migration:', error.message);
      process.exit(1);
    }

    console.log('Migration 056 aplicada com sucesso!\n');

    // Validacao: grants restantes na view
    console.log('Validando grants restantes em agenda_consolidada...\n');

    const { data: grants, error: grantError } = await execSql(
      `SELECT grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_name = 'agenda_consolidada'
       ORDER BY grantee, privilege_type;`
    );

    if (grantError) {
      console.warn('Nao foi possivel validar via exec_sql:', grantError.message);
      console.warn('Rode manualmente no SQL Editor:');
      console.warn("  SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'agenda_consolidada';");
    } else {
      console.log('Grants atuais:', JSON.stringify(grants));
    }

    console.log('\nVerifique o painel admin (Agenda/Dashboard) para confirmar funcionamento.');

  } catch (error) {
    console.error('Erro inesperado:', error.message);
    process.exit(1);
  }
}

applyMigration();
