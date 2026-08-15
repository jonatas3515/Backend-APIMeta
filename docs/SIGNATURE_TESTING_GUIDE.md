# 🧪 Guia de Testes - Assinatura Eletrônica (Zapsign)

**Data**: 15 de agosto de 2026  
**Status**: ✅ Implementado e Deployado  
**URL**: https://chatnevesecosta.vercel.app

---

## 📋 Pré-requisitos

Antes de testar, você precisa:

1. **Conta Zapsign Sandbox**:
   - Acesse https://app.zapsign.com.br (ou sandbox)
   - Crie uma conta de teste
   - Gere uma API Key

2. **Banco de Dados**:
   - Certifique-se de que as migrations 040 e 041 foram aplicadas
   - Tabelas: `document_signatures`, `signature_integration_config`

3. **Variáveis de Ambiente (Vercel)**:
   - `ZAPSIGN_API_KEY`: Sua API Key do Zapsign
   - `CALENDAR_ENCRYPTION_KEY`: Chave de criptografia
   - `NEXT_PUBLIC_BASE_URL`: https://chatnevesecosta.vercel.app

---

## 🧪 Testes Passo a Passo

### Teste 1: Configuração da API Key

#### Ações
1. Faça login como admin
2. Acesse "Config." (⚙️) no sidebar
3. Clique na aba "✍️ Assinatura Eletrônica"
4. Cole a API Key do Zapsign
5. Clique em "Salvar"
6. Clique em "Testar Conexão"

#### Esperado
- API Key é salva criptografada no banco
- Teste de conexão retorna "Conectado"
- Status é exibido como "Zapsign conectado"

#### Endpoint Usado
```
POST /api/signatures/config  (salvar)
POST /api/signatures/config  (testar)
```

---

### Teste 2: Envio de Documento para Assinatura

#### Ações
1. Acesse uma conversa (chat)
2. Clique no botão "✍️ Assinatura" na barra de ferramentas
3. Selecione o template "proposta"
4. Preencha os placeholders ({{client_name}}, {{case_type}})
5. Adicione signatários:
   - Cliente: e-mail e telefone
   - Advogado: e-mail e telefone
6. Selecione "Enviar por: ambos"
7. Cole a URL de um PDF (documento de teste)
8. Clique em "Enviar para Assinatura"

#### Esperado
- Modal mostra loading
- Documento é registrado no banco
- Requisição é enviada para Zapsign
- Link de assinatura é gerado
- Status exibido: "Aguardando assinatura"

#### Endpoint Usado
```
POST /api/signatures/send
```

#### Carga JSON Esperada
```json
{
  "case_id": "uuid-do-caso",
  "document_type": "proposta",
  "document_url": "https://exemplo.com/proposta.pdf",
  "signers": [
    {
      "name": "Cliente Teste",
      "email": "cliente@teste.com",
      "phone": "+5511999999999",
      "send_via": "both"
    }
  ]
}
```

---

### Teste 3: Simular Webhook com Testador Interno

#### Ações
1. Crie um documento de assinatura (Teste 2) ou encontre o ID
2. Acesse o console/Postman/curl
3. Envie requisição para o endpoint de teste:

```bash
curl -X POST https://chatnevesecosta.vercel.app/api/signatures/test-webhook \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "document.signed",
    "signature_id": "uuid-do-document-signatures"
  }'
```

#### Eventos para Testar
```bash
# 1. Documento assinado por um signatário
curl -X POST https://chatnevesecosta.vercel.app/api/signatures/test-webhook \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event": "document.signed", "signature_id": "UUID"}'

# 2. Documento concluído (todos assinaram)
curl -X POST https://chatnevesecosta.vercel.app/api/signatures/test-webhook \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event": "document.completed", "signature_id": "UUID"}'

# 3. Documento rejeitado
curl -X POST https://chatnevesecosta.vercel.app/api/signatures/test-webhook \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event": "document.rejected", "signature_id": "UUID"}'
```

#### Esperado
- Status do documento é atualizado no banco
- Notificação é enviada no chat (bot)
- Caso muda de etapa (em `document.completed`)
- Histórico é atualizado

---

### Teste 4: Webhook Real da Zapsign

#### Configuração na Zapsign
1. Acesse configurações de webhook no painel Zapsign
2. Adicione URL: `https://chatnevesecosta.vercel.app/api/signatures/webhook`
3. Selecione eventos:
   - `document.signed`
   - `document.completed`
   - `document.rejected`

#### Ações
1. Envie um documento real para assinatura (Teste 2)
2. Assine como signatário (ou peça para assinar)
3. Verifique se:
   - Webhook foi recebido
   - Status foi atualizado
   - Notificação apareceu no chat

#### Como Verificar
- Console da Vercel: `vercel logs`
- Logs do endpoint: https://vercel.com/jonatas-costas-projects/backend-apimeta/functions
- Banco de dados: tabela `document_signatures`

---

### Teste 5: Histórico de Assinaturas

#### Ações
1. Acesse a conversa/caso
2. Clique em "✍️ Assinatura"
3. Verifique a lista de documentos enviados

#### Esperado
- Lista mostra todos os documentos
- Cada item: data de envio, signatários, status
- Filtro por status funciona
- Links para PDF disponíveis

---

### Teste 6: Fallback - Upload Manual

#### Ações
1. No painel de assinatura, clique em "Upload Manual"
2. Selecione um PDF assinado
3. Preencha signatários manualmente
4. Salve

#### Esperado
- Documento é vinculado ao caso
- Status é "completed"
- Etapa do caso é atualizada

---

## 🔧 Solução de Problemas

### Problema: "API Key inválida"
**Causa**: API Key errada ou sandbox  
**Solução**: Verifique se a chave é da conta correta e se é de produção/sandbox

### Problema: "Documento não encontrado" no webhook
**Causa**: `platform_document_id` não bate  
**Solução**: Verifique se o `uuid` do webhook é o mesmo registrado no envio

### Problema: Notificação não aparece no chat
**Causa**: `conversation_id` não encontrado no caso  
**Solução**: Verifique se o caso tem `conversation_id` preenchido

### Problema: Caso não muda de etapa
**Causa**: `document_type` não mapeado  
**Solução**: Verifique se o tipo está em `proposta`, `contrato` ou `termo_consentimento`

---

## 📊 Checklist de Validação

- [ ] Configuração de API Key salva
- [ ] Teste de conexão passa
- [ ] Envio de documento funciona
- [ ] Webhook simulado funciona
- [ ] Webhook real da Zapsign funciona
- [ ] Notificações aparecem no chat
- [ ] Caso muda de etapa automaticamente
- [ ] Histórico de assinaturas exibe corretamente
- [ ] Filtro por status funciona
- [ ] Upload manual funciona
- [ ] Responsivo em mobile

---

## 🚀 Próximos Passos

### Imediato
1. ✅ Implementação concluída
2. ✅ Deploy em produção
3. ⏳ Gerar API Key Zapsign real
4. ⏳ Configurar webhook na Zapsign
5. ⏳ Aplicar migrations no Supabase

### Curto Prazo
1. Testar configuração com API Key real
2. Testar envio de documento
3. Testar webhook
4. Testar notificações
5. Testar histórico

### Médio Prazo
1. Suporte a ClickSign
2. Suporte a DocuSign
3. Templates de documentos
4. Relatórios de assinaturas

---

**Guia Gerado**: 15 de agosto de 2026  
**Desenvolvedor**: Cascade  
**Próxima Etapa**: Testar com API Key real da Zapsign
