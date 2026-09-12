# Análise de Viabilidade: Consolidação de RLS em `audit_logs`

## 1. Contexto

A função `log_audit(...)` no Supabase foi alterada para `SECURITY DEFINER` para resolver erro `403` / `new row violates row-level security policy for table "audit_logs"` ao arquivar conversas. Este documento analisa se é viável e seguro consolidar as políticas de RLS em `audit_logs`, removendo políticas temporárias e criando políticas mínimas de INSERT e SELECT, mantendo a função `log_audit` como `SECURITY DEFINER`.

> **Nota:** esta é uma análise e recomendação. A execução do SQL deve ser feita manualmente no Supabase, fora deste repositório, conforme as restrições vigentes.

## 2. Levantamento do uso de `audit_logs` no repositório

### 2.1 Schema da tabela

A tabela `audit_logs` foi criada na migration `024_add_users_and_collaboration.sql` com a seguinte estrutura:

| Coluna | Tipo | Obrigatório | Observação |
|--------|------|-------------|------------|
| `id` | `uuid` | Sim | `PRIMARY KEY DEFAULT gen_random_uuid()` |
| `user_id` | `uuid` | Não | `REFERENCES users(id) ON DELETE SET NULL`; pode ser `NULL` para sistema/bot |
| `entity_type` | `varchar(50)` | Sim | Tipo da entidade auditada |
| `entity_id` | `uuid` | Sim | Identificador da entidade |
| `action` | `varchar(100)` | Sim | Nome da ação |
| `old_value` | `text` | Não | Valor anterior |
| `new_value` | `text` | Não | Novo valor |
| `details` | `jsonb` | Não | Metadados extras |
| `created_at` | `timestamptz` | Não | `DEFAULT NOW()` |

### 2.2 Função `log_audit`

Definição original (sem `SECURITY DEFINER`):

```sql
CREATE OR REPLACE FUNCTION log_audit(
  p_user_id UUID,
  p_entity_type VARCHAR,
  p_entity_id UUID,
  p_action VARCHAR,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_value, new_value, details)
  VALUES (p_user_id, p_entity_type, p_entity_id, p_action, p_old_value, p_new_value, p_details)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;
```

Para resolver o erro de RLS ao arquivar conversas, a função foi alterada para `SECURITY DEFINER` no Supabase. Isso faz com que a função execute com os privilégios do dono (`postgres`), bypassando o RLS no `INSERT`.

### 2.3 Onde `audit_logs` é escrito no backend

#### Via `supabase.rpc('log_audit', ...)`

| Arquivo | Contexto | `entity_type` | `action` | Observação |
|---------|----------|---------------|----------|------------|
| `pages/api/auth/setup-admin.js` | Criação de admin inicial | `user` | `create` | Usuário do setup |
| `pages/api/auth/users.js` | Criação de usuário | `user` | `create` | Administrador criando usuário |
| `pages/api/auth/users.js` | Atualização de usuário | `user` | `update` | Alteração de role/status |
| `pages/api/auth/users.js` | Desativação de usuário | `user` | `disable` | `is_active: false` |
| `pages/api/collaboration.js` | Atribuição de responsável | `conversation` / `case` | `change_assigned_user` | Conversa ou caso |
| `pages/api/lgpd.js` | Marcar confidencial | `conversation` | `mark_confidential` | LGPD |
| `pages/api/lgpd.js` | Anonimizar lead | `conversation` | `anonymize_lead` | LGPD |
| `pages/api/lgpd.js` | Desmarcar confidencial | `conversation` | `unmark_confidential` | LGPD |

#### Via `supabase.from('audit_logs').insert(...)` (com `supabaseAdmin` ou `supabase`)

| Arquivo | `entity_type` / `action` | Colunas usadas | Observação |
|---------|--------------------------|----------------|------------|
| `pages/api/fee-simulations.js` | `fee_simulations` / `update` | `entity_type`, `entity_id`, `action`, `old_value`, `new_value` | Usa `supabaseAdmin` |
| `pages/api/fee-reference.js` | `fee_reference` / `update` | `entity_type`, `entity_id`, `action`, `old_value`, `new_value` | Usa `supabaseAdmin` |
| `pages/api/fee-tables.js` | `fee_tables` / `update` | `entity_type`, `entity_id`, `action`, `old_value`, `new_value` | Usa `supabaseAdmin` |
| `pages/api/fee-rules.js` | `fee_rules` / `update` | `entity_type`, `entity_id`, `action`, `old_value`, `new_value` | Usa `supabaseAdmin` |
| `pages/api/fee-services.js` | `fee_services` / `update` | `entity_type`, `entity_id`, `action`, `old_value`, `new_value` | Usa `supabaseAdmin` |
| `pages/api/case-processes.js` | `case_processes` / `create`, `update`, `delete` | `action`, `table_name`, `record_id`, `user_id`, `user_email`, `details` | Usa `supabase` autenticado, com colunas legadas (`table_name`, `record_id`) |
| `pages/api/case-processes/[id]/query.js` | `case_processes` / `query` | `action`, `table_name`, `record_id`, `user_id`, `user_email`, `details` | Usa `supabase` autenticado |
| `pages/api/process-movements/[id]/create-agenda-event.js` | `process_movements` / `create_agenda_event` | `action`, `table_name`, `record_id`, `user_id`, `user_email`, `details` | Usa `supabase` autenticado |
| `pages/api/process-movements/[id]/create-note.js` | `process_movements` / `create_note` | `action`, `table_name`, `record_id`, `user_id`, `user_email`, `details` | Usa `supabase` autenticado |
| `pages/api/process-movements/[id]/review.js` | `process_movements` / `review` | `action`, `table_name`, `record_id`, `user_id`, `user_email`, `details` | Usa `supabase` autenticado |

### 2.4 Inconsistência de colunas em `case-processes` e `process-movements`

Os endpoints de `case-processes` e `process-movements` inserem em `audit_logs` com colunas que **não existem** na tabela real:

```js
await supabase.from('audit_logs').insert({
  action,
  table_name: 'case_processes',
  record_id: targetId,
  user_id: user.id,
  user_email: user.email,
  details
});
```

Tentar executar esse `INSERT` falharia com `column "table_name" of relation "audit_logs" does not exist`. Portanto, esses endpoints **já estão quebrados** se realmente executam esse `INSERT` sem a função `log_audit` ou sem correção do mapeamento de colunas. Como a inserção está em `try/catch` e o erro é silenciado, o endpoint continua retornando sucesso, mas o log não é registrado.

> **Alerta:** a consolidação de RLS não resolve esse problema. É necessário corrigir os endpoints ou usar `log_audit`/`supabaseAdmin` nesses casos.

### 2.5 Colunas usadas vs. colunas existentes

| Coluna usada no código | Existe em `audit_logs`? |
|------------------------|-------------------------|
| `user_id` | Sim |
| `entity_type` | Sim |
| `entity_id` | Sim |
| `action` | Sim |
| `old_value` | Sim |
| `new_value` | Sim |
| `details` | Sim |
| `created_at` | Sim |
| `table_name` | Não (usado em `case-processes` e `process-movements`) |
| `record_id` | Não (usado em `case-processes` e `process-movements`) |
| `user_email` | Não (usado em `case-processes` e `process-movements`) |

## 3. Recomendação de viabilidade

### 3.1 Parecer

A consolidação de RLS em `audit_logs` é **viável e recomendável**, desde que:

1. A função `log_audit(...)` continue como `SECURITY DEFINER`.
2. Todas as inserções em `audit_logs` passem a usar `log_audit(...)` ou `supabaseAdmin` (service role).
3. Não haja `INSERT` direto por clients autenticados do Supabase.
4. O `SELECT` de `audit_logs` seja restrito a `admin`.
5. As políticas temporárias sejam removidas para evitar risco de permissão excessiva.

### 3.2 Riscos principais

| Risco | Causa | Mitigação |
|-------|-------|-----------|
| Perda de trilha de auditoria | Políticas restritivas demais bloqueiam `INSERT` de `log_audit` ou `supabaseAdmin` | Garantir `SECURITY DEFINER` no `log_audit` e service role no backend |
| Exposição de logs sensíveis | Política `SELECT` ampla permite leitura por usuários não-admin | Restringer `SELECT` a `service_role` e `admin` |
| Dados de auditoria inconsistentes | Endpoints inserindo `table_name`, `record_id`, `user_email` em colunas inexistentes | Corrigir endpoints de `case-processes` e `process-movements` |
| Políticas temporárias esquecidas | `audit_logs_insert_any` ou similares continuam ativas | Remover explicitamente no SQL de consolidação |

## 4. Script SQL de referência

> **Atenção:** script apenas para referência. Executar manualmente no Supabase, após backup e validação em staging.

```sql
BEGIN;

-- 1. Remover políticas temporárias/experimentais em audit_logs
DROP POLICY IF EXISTS audit_logs_insert_authenticated ON audit_logs;
DROP POLICY IF EXISTS audit_logs_all_service_role ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_any ON audit_logs;
DROP POLICY IF EXISTS service_role_only ON audit_logs;

-- 2. Reabilitar RLS (caso tenha sido desabilitado)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY OFF;

-- 3. Política de INSERT para service_role (backend/admin)
DROP POLICY IF EXISTS audit_logs_insert_service_role ON audit_logs;

CREATE POLICY audit_logs_insert_service_role
  ON audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4. Política de INSERT para log_audit via SECURITY DEFINER
-- A função log_audit executa como postgres; o INVOKER na chamada RPC é authenticated,
-- mas a função em SECURITY DEFINER insere com privilégios do dono.
-- Para garantir, validamos que a inserção venha da função ou do backend.
DROP POLICY IF EXISTS audit_logs_insert_function ON audit_logs;

-- Nota: no Supabase, a role da sessão da função SECURITY DEFINER é o owner da função (postgres).
-- A política abaixo permite INSERT quando a role é postgres (don) ou service_role.
-- Política alternativa: usar TO authenticated e WITH CHECK (true) se a função SECURITY DEFINER
-- bypassa RLS mesmo com RLS habilitado. Teste em staging.
CREATE POLICY audit_logs_insert_function
  ON audit_logs
  FOR INSERT
  TO postgres
  WITH CHECK (true);

-- 5. Política de SELECT apenas para admin
DROP POLICY IF EXISTS audit_logs_select_admin ON audit_logs;

CREATE POLICY audit_logs_select_admin
  ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = auth.uid()
        AND users.role = 'admin'
        AND users.is_active = true
    )
  );

-- 6. Garantir que a função log_audit seja SECURITY DEFINER
ALTER FUNCTION log_audit(uuid, character varying, uuid, character varying, text, text, jsonb)
  SECURITY DEFINER
  SET search_path = public;

COMMIT;
```

### 4.1 Notas sobre a política para `log_audit`

No Supabase:

- Uma função `SECURITY DEFINER` executa com os privilégios do dono (owner) da função, geralmente `postgres`.
- Se `FORCE ROW LEVEL SECURITY` estiver desabilitado, o dono da tabela (`postgres`) já bypassa RLS.
- Com RLS habilitado, uma função `SECURITY DEFINER` owned by `postgres` pode inserir em `audit_logs` sem precisar de policy, desde que `FORCE ROW LEVEL SECURITY` esteja `OFF`.
- Caso `FORCE ROW LEVEL SECURITY` esteja `ON`, é necessário uma policy para `postgres` ou garantir que a função seja owner da tabela.

## 5. Plano de aplicação

1. **Staging**
   - Executar o SQL em um projeto/ambiente de staging.
   - Testar arquivar uma conversa.
   - Testar criar/atualizar usuário.
   - Testar `SELECT` em `audit_logs` com usuário admin e não-admin.
   - Verificar logs de `case-processes` e `process-movements` (corrigir se necessário).

2. **Backup**
   - Realizar backup lógico de `audit_logs` antes de alterar políticas em produção.

3. **Produção**
   - Aplicar em horário de menor movimento.
   - Monitorar logs por 15-30 minutos.

4. **Testes pós-aplicação**

| Teste | Como | Esperado |
|-------|------|----------|
| Arquivar conversa | Frontend ou API | `200 OK`, novo registro em `audit_logs` |
| Criar/atualizar usuário | API `/api/auth/users` | Registro em `audit_logs` com `entity_type='user'` |
| `SELECT` admin | SQL Editor com role admin | Retorna todos os registros |
| `SELECT` estagiário | SQL Editor com role estagiário | Retorna vazio ou 403 |
| `case-processes` create/update/delete | API | Sem erro de RLS; se inserir em `audit_logs`, deve usar colunas corretas |
| `process-movements` review/note/agenda | API | Sem erro de RLS; mesma ressalva de colunas |

## 6. Ações adicionais recomendadas

1. Corrigir `pages/api/case-processes.js`, `pages/api/case-processes/[id]/query.js` e `pages/api/process-movements/[id]/*.js` para usar `log_audit(...)` ou `supabaseAdmin.from('audit_logs').insert({ ... })` com as colunas corretas (`entity_type`, `entity_id`, etc.).
2. Remover `user_email` dos inserts, pois expõe PII e a coluna não existe.
3. Documentar a decisão de arquitetura: `audit_logs` deve ser escrita apenas por backend (`service_role`) ou via `log_audit` `SECURITY DEFINER`.

## 7. Evidências

- `npm run build` executado com sucesso (apenas warnings pré-existentes de hooks e `<img>`).
- Nenhum arquivo do repositório foi alterado para esta análise.

## 8. Restrições respeitadas

| Item | Status |
|------|--------|
| SQL executado via repositório | Não |
| Migration criada/aplicada via repositório | Não |
| RLS alterado via repositório | Não |
| Schema alterado via repositório | Não |
| PII/credenciais expostas | Não |
| `scripts/apply-migration-056.js` tocado | Não |
