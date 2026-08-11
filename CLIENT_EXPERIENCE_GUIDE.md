# Experiência do Cliente - Guia Completo

## 📱 O que foi implementado

### 1. **Banco de Dados (Migration 028)**

#### Tabela `client_info_requests`
```sql
id, conversation_id, case_id, intent_type, request_text, response_text, created_at, updated_at
```

**Campos:**
- `intent_type` - Tipo de requisição: summary, status, documents
- `request_text` - Texto original da pergunta do cliente
- `response_text` - Resposta gerada automaticamente

**Índices:**
- conversation_id, case_id, intent_type, created_at

---

### 2. **Detecção de Intenção**

#### Função `detectIntent(messageText)`
Detecta automaticamente o que o cliente quer:

**INTENT_SUMMARY** - Palavras-chave:
- "resumo", "resumo do meu caso", "meu caso", "pode resumir", "qual é o resumo"

**INTENT_STATUS** - Palavras-chave:
- "status", "como está", "andamento", "como está meu processo", "qual é o status"

**INTENT_DOCUMENTS** - Palavras-chave:
- "documentos", "faltando documentos", "o que falta enviar", "quais documentos"

---

### 3. **Geração de Respostas**

#### INTENT_SUMMARY (Resumo do Caso)
```
Fluxo:
1. Busca dados do caso (legal_area, case_type, case_summary)
2. Formata resposta estruturada
3. Aprimora com IA (Gemini) para linguagem simples
4. Inclui disclaimer obrigatório
```

**Exemplo de resposta:**
```
*Resumo do seu caso:*

Você solicitou uma análise sobre licença prêmio como servidor público. 
O escritório está analisando se você tem direito à licença e preparando 
estratégia para solicitar ao órgão competente.

⚠️ *Aviso:* Esta mensagem é um resumo automatizado. Ela não substitui 
análise jurídica detalhada nem garante resultado.
```

#### INTENT_STATUS (Status/Andamento)
```
Fluxo:
1. Busca status e funnel_stage do caso
2. Identifica próximo prazo (deadline_date)
3. Formata resposta com etapa atual
4. Aprimora com IA para linguagem simples
5. Inclui disclaimer
```

**Exemplo de resposta:**
```
*Status do seu caso:*

Seu caso está em análise inicial. Estamos coletando informações e 
documentos necessários. Próximo prazo: 15/08/2024 (prazo para ajuizar ação).

⚠️ *Aviso:* Esta mensagem é apenas informativa. Qualquer dúvida, fale com um advogado.
```

#### INTENT_DOCUMENTS (Documentos Faltantes)
```
Fluxo:
1. Busca reminders com reminder_type = 'buscar_documento'
2. Lista documentos pendentes
3. Formata resposta com explicação de cada documento
4. Aprimora com IA
5. Inclui disclaimer
```

**Exemplo de resposta:**
```
*Documentos que ainda faltam:*

1. Contrato de trabalho - Necessário para comprovar relação laboral
2. Contracheques últimos 12 meses - Para análise de valores

Por favor, envie esses documentos para que possamos continuar com a análise.

⚠️ *Aviso:* Esta mensagem é apenas informativa.
```

---

### 4. **API**

#### POST /api/client-info
Processa mensagem do cliente:

```bash
POST /api/client-info
{
  "action": "process_message",
  "conversation_id": "uuid",
  "message_text": "resumo do meu caso"
}
```

**Resposta:**
```json
{
  "intent": "summary",
  "response": "Resumo do seu caso:\n\n...",
  "case_id": "uuid"
}
```

#### GET /api/client-info
Lista histórico de requisições:

```bash
GET /api/client-info?conversation_id=uuid&limit=10
```

**Resposta:**
```json
[
  {
    "id": "uuid",
    "conversation_id": "uuid",
    "case_id": "uuid",
    "intent_type": "summary",
    "request_text": "resumo do meu caso",
    "response_text": "...",
    "created_at": "2024-08-11T14:30:00Z"
  }
]
```

---

### 5. **Componente React**

#### ClientInfoPanel.js
Painel no dashboard para visualizar requisições:

**Recursos:**
- Lista todas as requisições de informação
- Mostra pergunta original do cliente
- Mostra resposta que foi enviada
- Cores por tipo: 📝 Resumo (azul), 📊 Status (verde), 📄 Documentos (amarelo)
- Botão "📋 Copiar resposta" para reutilizar
- Histórico com timestamps

---

## 🎯 Fluxo de Uso

### 1. Cliente envia mensagem no WhatsApp
```
Cliente: "Qual é o resumo do meu caso?"
```

### 2. Sistema detecta intenção
```
detectIntent("Qual é o resumo do meu caso?") → INTENT_SUMMARY
```

### 3. Sistema busca dados
```
- Busca case associado à conversation
- Coleta legal_area, case_type, case_summary
```

### 4. Sistema gera resposta
```
- Formata resposta estruturada
- Aprimora com IA (Gemini)
- Inclui disclaimer obrigatório
```

### 5. Sistema registra requisição
```
- Insere em client_info_requests
- Armazena pergunta original e resposta
```

### 6. Resposta é enviada ao cliente
```
Bot: "*Resumo do seu caso:*\n\n..."
```

### 7. Painel mostra requisição
```
- ClientInfoPanel exibe no dashboard
- Advogado pode copiar e reutilizar resposta
```

---

## 🔐 Segurança e Conformidade

### Disclaimer Obrigatório
Toda resposta inclui:
```
⚠️ *Aviso importante:* Esta mensagem é um resumo automatizado das 
informações internas do seu caso. Ela não substitui análise jurídica 
detalhada nem garante resultado. Em caso de dúvida, peça para falar 
com um advogado.
```

### Linguagem Simples
- Sem termos jurídicos complexos
- Máximo 3-4 frases por resposta
- Foco em informação, não em parecer

### Sem Promessas
- Nunca promete vitória
- Sempre deixa claro que é "apenas informativo"
- Encoraja falar com advogado em caso de dúvida

---

## 📊 Exemplos de Intenções

### Exemplo 1: Resumo
```
Cliente: "Me explica meu caso"
Sistema detecta: INTENT_SUMMARY
Resposta: "Você solicitou análise sobre licença prêmio..."
```

### Exemplo 2: Status
```
Cliente: "Como está meu processo?"
Sistema detecta: INTENT_STATUS
Resposta: "Seu caso está em análise inicial..."
```

### Exemplo 3: Documentos
```
Cliente: "O que falta enviar?"
Sistema detecta: INTENT_DOCUMENTS
Resposta: "Documentos que ainda faltam: 1. Contrato de trabalho..."
```

### Exemplo 4: Nenhuma intenção
```
Cliente: "Oi, tudo bem?"
Sistema detecta: NONE
Resposta: Passa para Gemini normal (não é requisição de informação)
```

---

## 📝 Palavras-Chave Detectadas

### SUMMARY
- resumo
- resumo do meu caso
- meu caso
- pode resumir
- qual é o resumo
- me explica o caso
- explica meu caso
- qual é meu caso

### STATUS
- status
- como está
- andamento
- como está meu processo
- qual é o status
- em que etapa
- qual é a situação
- como está o caso
- progresso
- evoluiu

### DOCUMENTS
- documentos
- faltando documentos
- o que falta enviar
- quais documentos
- documentos faltantes
- o que preciso enviar
- falta enviar
- documentação
- quais são os documentos

---

## 🔮 Próximos Passos

1. **Integração com Webhook**
   - Detectar intenção automaticamente ao receber mensagem
   - Enviar resposta automática via WhatsApp

2. **Dashboard de Métricas**
   - Quantas vezes cliente pediu resumo/status/documentos
   - Tempo médio de resposta
   - Satisfação do cliente

3. **Aprimoramentos de IA**
   - Usar histórico de conversa para contexto melhor
   - Detectar sentimento (cliente insatisfeito, urgência)
   - Sugerir próximas ações

4. **Automação**
   - Enviar resumo automaticamente ao criar caso
   - Notificar cliente quando documentos faltarem
   - Atualizar status automaticamente

5. **Multilíngue**
   - Suportar respostas em inglês/espanhol
   - Detectar idioma da pergunta

---

## ⚙️ Configuração

### Variáveis de Ambiente
```
GOOGLE_AI_API_KEY=sua_chave_gemini
NEXT_PUBLIC_SUPABASE_URL=sua_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service
```

### Limites
- Máximo 10 requisições por busca (padrão)
- Timeout de 12s para geração de IA
- Máximo 4 frases por resposta

---

## 📚 Integração com Webhook

Para integrar com webhook existente:

```javascript
// Em pages/api/webhook.js

import { detectIntent, INTENT_TYPES } from '@/lib/client-intent';

// Ao receber mensagem do cliente
const intent = detectIntent(messageText);

if (intent !== INTENT_TYPES.NONE) {
  // Processa requisição de informação
  const response = await fetch('/api/client-info', {
    method: 'POST',
    body: JSON.stringify({
      action: 'process_message',
      conversation_id,
      message_text
    })
  });
  
  const { response: autoResponse } = await response.json();
  
  // Envia resposta ao cliente
  await sendWhatsAppMessage(clientPhone, autoResponse);
} else {
  // Passa para Gemini normal
  const response = await askGemini(messageText, history);
  await sendWhatsAppMessage(clientPhone, response);
}
```

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso  
**Deploy:** https://backend-apimeta.vercel.app
