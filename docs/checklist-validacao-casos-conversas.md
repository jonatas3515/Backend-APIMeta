# Checklist de Validacao - Casos, Conversas, Documentos e Rotinas

Ambiente: staging ou producao controlada
Versao: 1.0
Ultima atualizacao: hoje

Instrucoes gerais:
- Realizar cada item e marcar a coluna Status.
- Nao incluir IDs reais, nomes, telefones, e-mails, enderecos ou conteudos de mensagens.
- Usar apenas identificadores ficticios/sinteticos nos exemplos (ex: CASE-001, CONV-001).
- Em caso de falha, anotar o codigo HTTP e a mensagem exibida, sem copiar tokens, URLs ou stack traces.

---

## 1. Vinculo Caso ↔ Conversa

### 1.1 Vincular conversa ativa a um caso

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse a tela de detalhe do caso CASE-001. 2. Clique em "Vincular conversa". 3. Selecione uma conversa com status ativo. 4. Confirme. |
| Resultado esperado | Caso atualizado com sucesso. Mensagem "Conversa vinculada com sucesso." exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 1.2 Tentar vincular conversa inexistente

| Campo | Valor |
|---|---|
| Passo a passo | 1. Tente enviar um PATCH para /api/cases com conversation_id invalido. 2. Verifique a resposta. |
| Resultado esperado | HTTP 404 e mensagem "Conversa nao encontrada". Nenhuma gravacao realizada. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 1.3 Tentar vincular conversa inativa

| Campo | Valor |
|---|---|
| Passo a passo | 1. Selecione uma conversa com status inativo. 2. Tente vincular ao caso. |
| Resultado esperado | HTTP 400 e mensagem "Conversa nao esta ativa". Nenhuma gravacao realizada. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 1.4 Trocar conversa de um caso ja vinculado

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse o caso CASE-001 com conversa vinculada. 2. Clique em "Trocar". 3. Selecione outra conversa ativa. 4. Confirme. |
| Resultado esperado | Caso atualizado com a nova conversa. Mensagem de sucesso exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 1.5 Remover vinculo sem operacoes pendentes

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse o caso CASE-001. 2. Verifique que nao existem solicitacoes de documento pendentes nem rotinas pendentes. 3. Clique em "Remover". |
| Resultado esperado | Vinculo removido com sucesso. Mensagem "Conversa removida do caso." exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 1.6 Tentar remover vinculo com solicitacao de documento pendente

| Campo | Valor |
|---|---|
| Passo a passo | 1. Garanta que exista document_checklist_requests em draft/sent/resent para o caso. 2. Tente remover o vinculo. |
| Resultado esperado | HTTP 409. Mensagem informando que solicitacoes pendentes impedem a remocao. Nenhuma alteracao. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 1.7 Tentar remover vinculo com rotina pendente

| Campo | Valor |
|---|---|
| Passo a passo | 1. Garanta que exista routine_executions em pending/in_progress para o caso. 2. Tente remover o vinculo. |
| Resultado esperado | HTTP 409. Mensagem informando que rotinas pendentes impedem a remocao. Nenhuma alteracao. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

---

## 2. Solicitacao de Documentos

### 2.1 Criar rascunho de solicitacao

| Campo | Valor |
|---|---|
| Passo a passo | 1. Abra a modal de solicitacao de documentos no caso CASE-001. 2. Selecione ate 3 itens. 3. Clique em "Gerar rascunho". |
| Resultado esperado | Rascunho criado. Botao entra em "Gerando..." e retorna ao normal apos sucesso. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 2.2 Enviar solicitacao

| Campo | Valor |
|---|---|
| Passo a passo | 1. Com rascunho criado, edite a mensagem se desejar. 2. Clique em "Confirmar e enviar". |
| Resultado esperado | Mensagem enviada. Status atualizado. Mensagem de sucesso exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 2.3 Reenviar solicitacao

| Campo | Valor |
|---|---|
| Passo a passo | 1. Localize uma solicitacao ja enviada. 2. Use a acao de reenvio. |
| Resultado esperado | Status muda para "resent". Mensagem de sucesso exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 2.4 Tentar criar/enviar com caso sem conversa vinculada

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse um caso sem conversa vinculada. 2. Tente abrir a solicitacao de documentos. |
| Resultado esperado | Botao desabilitado. Aviso "Vincule uma conversa ao caso antes de solicitar documentos." |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 2.5 Tentar criar/enviar com conversa inativa

| Campo | Valor |
|---|---|
| Passo a passo | 1. Tente enviar solicitacao para uma conversa inativa via API. |
| Resultado esperado | Requisicao rejeitada. Mensagem de erro apropriada, sem PII. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

---

## 3. Rotinas

### 3.1 Executar rotina confirmada com conversa ativa

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse o caso CASE-001 com conversa ativa vinculada. 2. Selecione uma rotina. 3. Confirme. |
| Resultado esperado | Rotina executada. Documentos e lembretes criados. Mensagem de sucesso exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 3.2 Tentar executar rotina com caso sem conversa

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse um caso sem conversa. 2. Tente aplicar uma rotina. |
| Resultado esperado | Botao desabilitado. Aviso "Vincule uma conversa ao caso antes de aplicar uma rotina." |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 3.3 Tentar executar rotina com conversa inativa/inexistente

| Campo | Valor |
|---|---|
| Passo a passo | 1. Tente executar rotina com conversation_id inativo/inexistente via API. |
| Resultado esperado | HTTP 400/404. Rotina nao executada. Nenhum documento/lembrante criado. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

---

## 4. Documentos Gerados

### 4.1 Gerar documento por modelo

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acesse o painel de documentos gerados do caso. 2. Selecione um template. 3. Clique em "Gerar". |
| Resultado esperado | Documento gerado e listado. Botao mostra "Gerando..." durante o processo. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 4.2 Alterar status do documento gerado

| Campo | Valor |
|---|---|
| Passo a passo | 1. Localize um documento em rascunho. 2. Clique em "Enviar para Revisao". |
| Resultado esperado | Status atualizado. Botao mostra "Atualizando..." e volta ao normal. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 4.3 Excluir documento gerado

| Campo | Valor |
|---|---|
| Passo a passo | 1. Localize um documento gerado. 2. Use a acao de exclusao. 3. Confirme. |
| Resultado esperado | Documento removido. Mensagem de sucesso exibida. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 4.4 Tentar operar documento de caso sem acesso

| Campo | Valor |
|---|---|
| Passo a passo | 1. Autentique-se como advogado nao atribuido ao caso. 2. Tente PATCH/DELETE em /api/generated-documents. |
| Resultado esperado | HTTP 403. Nenhuma escrita realizada. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

---

## 5. Honorarios

### 5.1 Salvar simulacao/proposta

| Campo | Valor |
|---|---|
| Passo a passo | 1. Abra o simulador de honorarios. 2. Preencha os campos. 3. Clique em "Salvar rascunho" ou "Gerar proposta". |
| Resultado esperado | Simulacao salva. Botao mostra "Salvando..." e volta ao normal. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 5.2 Tentar salvar com dados invalidos

| Campo | Valor |
|---|---|
| Passo a passo | 1. Tente salvar com valor final invalido ou servico ausente. |
| Resultado esperado | Requisicao rejeitada. Mensagem de erro generica, sem PII. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

---

## 6. Mensagens de Erro e Acessibilidade

### 6.1 Verificar mensagens de erro legiveis para 400/403/404/409

| Campo | Valor |
|---|---|
| Passo a passo | 1. Force cada cenario de erro acima. 2. Verifique a mensagem exibida. |
| Resultado esperado | Mensagens em portugues, curtas, sem URL, token, SQL ou stack trace. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 6.2 Confirmar ausencia de PII nas mensagens

| Campo | Valor |
|---|---|
| Passo a passo | 1. Inspecione mensagens de erro e console. 2. Verifique se ha nome, telefone, e-mail, token, URL assinada. |
| Resultado esperado | Nenhum dado sensivel ou identificavel exposto. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 6.3 Confirmar estados de botao em processamento

| Campo | Valor |
|---|---|
| Passo a passo | 1. Acione acoes assincronas. 2. Durante o carregamento, verifique o botao. |
| Resultado esperado | Botao desabilitado, texto com "..." (ex: "Salvando...", "Gerando..."). Segundo clique nao dispara nova requisicao. |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |

### 6.4 Confirmar acessibilidade das mensagens

| Campo | Valor |
|---|---|
| Passo a passo | 1. Inspecione mensagens de erro/sucesso no DOM. 2. Verifique atributos aria-live, role. |
| Resultado esperado | Mensagens de erro com role="alert". Mensagens de sucesso com role="status" e aria-live="polite". |
| Status | [ ] OK / [ ] Falhou / [ ] Nao testado |
| Observacoes | |
