# Casos Jurídicos com Prazos - Guia de Implementação

## 📋 O que foi implementado

### 1. **Banco de Dados (Supabase)**
- Tabela `cases` com campos:
  - `id` (UUID)
  - `conversation_id` (FK para conversations)
  - `title` (título do caso)
  - `legal_area`, `case_type`, `municipality`, `agency`, `client_role` (reutilizáveis da conversa)
  - `status` (prospect, em_analise, proposta_enviada, contrato_assinado, acao_protocolada, aguardando_decisao, encerrado)
  - `priority` (baixa, media, alta)
  - `deadline_date` (data principal do prazo)
  - `deadline_type` (tipo de prazo: prazo_para_ajuizar_acao, prazo_para_recurso, data_de_audiencia, etc.)
  - `notes` (observações/estratégia)
  - `created_at`, `updated_at` (com trigger automático)

### 2. **Backend (APIs)**
- `POST /api/cases` - Criar novo caso
- `GET /api/cases` - Listar casos com filtros (status, priority, legal_area, municipality)
- `GET /api/cases?id=<id>` - Detalhes de um caso específico
- `PATCH /api/cases?id=<id>` - Atualizar caso (status, prazo, prioridade, notas)

### 3. **Frontend (Componentes React)**

#### **CasesPanel.js**
- Lista completa de casos com filtros
- Criar/editar/deletar casos
- Visualizar prazos com contador de dias
- Ordenação por prazo (mais urgente em cima)

#### **CaseSidebar.js**
- Painel lateral na ChatWindow
- Ver casos associados à conversa
- Criar/editar/deletar casos rapidamente
- Atualizar status do caso
- Indicador visual de prazos urgentes

#### **DeadlineCalendar.js**
- Visualização em agenda de prazos
- Agrupado por data
- Filtro: próximos 7, 14, 30 ou 90 dias
- Indicadores visuais: atrasado (vermelho), urgente (laranja), normal (azul)

### 4. **Webhook (Transcrição Assíncrona)**
- Removida dependência de CRON externo
- Transcrição de áudio/vídeo acontece **em background** (não bloqueia resposta)
- Resposta automática com base na transcrição é enviada direto ao cliente
- Sem necessidade de configuração externa

## 🚀 Como Usar

### Passo 1: Aplicar a Migration
```bash
# No Supabase, execute a migration 021_create_cases_table.sql
# Ou via CLI:
supabase migration up
```

### Passo 2: Integrar Componentes no Painel

#### Adicionar CasesPanel à página principal:
```jsx
import CasesPanel from '@/components/CasesPanel';

export default function Dashboard() {
  return (
    <div>
      {/* ... outros componentes ... */}
      <CasesPanel />
    </div>
  );
}
```

#### Adicionar CaseSidebar na ChatWindow:
```jsx
import CaseSidebar from '@/components/CaseSidebar';

export default function ChatWindow({ conversationId }) {
  return (
    <div className="flex">
      <div className="flex-1">
        {/* ... chat messages ... */}
      </div>
      <CaseSidebar conversationId={conversationId} />
    </div>
  );
}
```

#### Adicionar DeadlineCalendar ao painel:
```jsx
import DeadlineCalendar from '@/components/DeadlineCalendar';

export default function Dashboard() {
  return (
    <div>
      {/* ... */}
      <DeadlineCalendar />
    </div>
  );
}
```

### Passo 3: Testar Fluxo Completo

#### Cenário 1: Criar caso manualmente
1. Abra uma conversa
2. No painel lateral (CaseSidebar), clique "+ Novo Caso"
3. Preencha:
   - Título: "Licença prêmio – Servidor municipal"
   - Área: "Direito Trabalhista"
   - Status: "em_analise"
   - Prioridade: "alta"
   - Prazo: 2024-12-31
   - Tipo de prazo: "prazo_para_ajuizar_acao"
4. Clique "Criar Caso"
5. O caso aparece na lista e na agenda de prazos

#### Cenário 2: Atualizar status do caso
1. No CaseSidebar, selecione um novo status no dropdown
2. O caso é atualizado em tempo real
3. A agenda reflete a mudança

#### Cenário 3: Visualizar agenda de prazos
1. Acesse a página com DeadlineCalendar
2. Filtre por período (7, 14, 30 ou 90 dias)
3. Veja prazos agrupados por data
4. Prazos atrasados aparecem em vermelho
5. Prazos urgentes (< 7 dias) em laranja

#### Cenário 4: Transcrição automática de áudio
1. Cliente envia áudio via WhatsApp
2. Bot responde imediatamente: "Recebido! Estou analisando o áudio agora..."
3. Em background, áudio é transcrito
4. Assim que pronto, bot envia resposta contextual baseada na transcrição
5. **Sem necessidade de CRON externo ou configuração manual**

## 📊 Estrutura de Dados

### Exemplo de Caso
```json
{
  "id": "uuid-123",
  "conversation_id": "uuid-conv-456",
  "title": "Licença prêmio – Servidor municipal – Prado/BA",
  "legal_area": "Direito Trabalhista",
  "case_type": "Ação Judicial",
  "municipality": "Prado",
  "agency": "Prefeitura Municipal",
  "client_role": "Servidor Público",
  "status": "acao_protocolada",
  "priority": "alta",
  "deadline_date": "2024-12-31",
  "deadline_type": "prazo_para_recurso",
  "notes": "Aguardando decisão de primeira instância. Preparar recurso se necessário.",
  "created_at": "2024-08-11T12:00:00Z",
  "updated_at": "2024-08-11T15:30:00Z"
}
```

## 🔄 Fluxo de Integração com Intake

Quando uma conversa completa o intake (funnel_stage = 'intake_complete'), você pode:

1. **Opção A (Manual):** Criar caso via CaseSidebar
2. **Opção B (Automática):** Adicionar lógica no webhook para criar caso automaticamente com dados do intake

Exemplo de automação (adicionar no webhook.js):
```javascript
if (conversation.funnel_stage === 'intake_complete' && !existingCase) {
  await supabase.from('cases').insert({
    conversation_id: conversation.id,
    title: `${conversation.legal_area} - ${conversation.client_name}`,
    legal_area: conversation.legal_area,
    case_type: conversation.case_type,
    municipality: conversation.municipality,
    agency: conversation.agency,
    client_role: conversation.client_role,
    status: 'em_analise',
    priority: 'media'
  });
}
```

## ⚠️ Pontos Importantes

1. **Não quebra nada existente:** Casos são uma camada opcional acima de conversations/messages
2. **Múltiplos casos por conversa:** Estrutura permite associar vários casos à mesma conversa (para futuro)
3. **Transcrição assíncrona:** Sem dependência de CRON externo ou configuração manual
4. **Filtros e buscas:** CasesPanel permite filtrar por status, prioridade, área, município
5. **Alertas visuais:** Prazos atrasados e urgentes destacados em cores

## 🔮 Próximos Passos (Futuros)

1. Criar tabela `case_events` para múltiplos eventos por caso
2. Integrar lembretes automáticos para prazos próximos
3. Gerar documentos/petições automáticas baseadas no tipo de caso
4. Multiusuário com permissões (quem pode ver/editar cada caso)
5. Histórico de mudanças de status (audit trail)
6. Integração com calendário externo (Google Calendar, Outlook)

## 🛠️ Troubleshooting

### Erro: "Tabela cases não encontrada"
- Certifique-se de que a migration 021 foi aplicada no Supabase
- Verifique se o schema está correto

### Casos não aparecem na lista
- Verifique se `conversation_id` está correto
- Confirme que o usuário tem permissão de leitura na tabela

### Transcrição não funciona
- Verifique se `GOOGLE_AI_API_KEY` está configurado
- Confira logs do webhook em `/api/webhook`
- Teste com um áudio curto primeiro

---

**Status:** ✅ Implementado e pronto para uso
**Última atualização:** 2024-08-11
