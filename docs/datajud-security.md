# DataJud — Segurança e Uso

## 1. Visão geral

O módulo `DataJud` integra a API pública do CNJ/DataJud para acompanhar processos vinculados a casos.
Nenhuma chamada real à DataJud é feita sem uma chave segura configurada no ambiente do servidor.

## 2. Permissões e controle de acesso

- `case-processes.js`: mínimo `estagiario` para listar.
- `case-processes/[id]/query.js`: mínimo `estagiario` para consulta manual.
- `case-processes/[id]/movements.js`: mínimo `estagiario` para listar movimentações.
- `process-movements/[id]/review.js`: mínimo `advogado`.
- `process-movements/[id]/create-note.js`: mínimo `advogado`.
- `process-movements/[id]/create-agenda-event.js`: mínimo `advogado`.

Todas as rotas que alteram estado executam, **antes** da operação, uma validação explícita de acesso ao `case_id` (`lib/caseAuth.js`):

- `admin` pode acessar qualquer caso.
- `advogado`/`estagiario` só acessam casos atribuídos a si.
- Acesso negado retorna sempre `403` com a mensagem `Acesso não autorizado ao caso.`, independente da causa.

## 3. O que nunca sai na resposta da API

Os endpoints nunca retornam ao frontend:

- `datajud_alias`
- Chave de API (`DATAJUD_API_KEY`)
- URL base da DataJud
- Headers ou corpo bruto da requisição
- Stack traces

A resposta da consulta inclui apenas: `status`, `message`, `data` (objeto DataJud sem alias), `new_movements_count`, `new_movements` e `log` com metadados resumidos.

## 4. Logs e sanitização

Todos os logs do módulo passam por `safeLogger` (`lib/safeLogger.js`):

- `safeLog(level, event, metadata)`
- `safeError(event, error, metadata)`

Campos sensíveis (CNJ, CPF, telefone, e-mail, tokens, URL assinadas) são mascarados ou removidos automaticamente.

## 5. Configuração

A única variável de ambiente necessária é:

```bash
DATAJUD_API_KEY=<sua chave do DataJud>
```

Ela é lida apenas no lado do servidor e nunca exposta.

## 6. Testes

O módulo possui testes 100% mockados:

```bash
npm test -- --testPathPattern='datajud|case-processes|process-movements'
```

- `__tests__/lib/datajudClient.test.js`
- `__tests__/api/case-processes.test.js`
- `__tests__/api/datajud-query.test.js`
- `__tests__/api/process-movements.test.js`

Não há chamadas reais à DataJud, Supabase ou Vercel durante os testes.

## 7. RLS

As alterações não criam novas tabelas, migrations ou mudanças no `RLS` existente.
A validação por `caseAuth` funciona como defesa em profundidade alinhada às regras do banco.
