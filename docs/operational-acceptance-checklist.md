# Checklist de Aceite Operacional — Neves & Costa Chat

## Objetivo

Este documento orienta a validação manual do sistema em ambiente controlado (Preview/Staging) antes da promoção para produção. Os testes devem ser executados com contas sintéticas previamente autorizadas, sem expor PII, segredos ou dados reais de clientes.

## Princípios de segurança

- Usar somente registros **sintéticos/autorizados** criados para teste.
- Não inserir: CPF, CNPJ, telefone, e-mail, nome de cliente real, conteúdo de conversa real, número CNJ real, token, assinatura, URL assinada, storage_path, senha ou chave de API.
- Não executar ações destrutivas em produção; rollback deve seguir o fluxo de incidente.
- Validar apenas a presença/ausência de comportamentos; nunca evidenciar detalhes internos de erro, SQL, stack ou código.

## Ambiente e acessos

| Item | Critério | Status |
|---|---|---|
| URL de Preview/Staging acessível | Carrega sem erro 500 e HTTPS válido | [ ] |
| Build concluído com sucesso | Sem falha em `npm run build` / Vercel "Ready" | [ ] |
| Contas de teste preparadas | Admin, Advogado e Estagiário criados e ativos | [ ] |
| Limpeza pós-teste planejada | Registros de teste identificados para remoção/anonimização | [ ] |

## Critérios bloqueadores (qualquer falha interrompe o deploy)

1. Login indisponível para perfis ativos.
2. Exposição de PII, segredo, stack, SQL ou identificador sensível na interface, rede ou log.
3. Autenticação ignorando token (ex.: aceitando `x-user-id`/`x-user-role` forjado).
4. Rotas de notificações vazando `countReliable=false` como `0` confiável.
5. Botão de retry disparando chamadas paralelas ou sem `?refresh=1`.
6. Build, lint ou testes automatizados falhando.

## Fluxo comum de notificação parcial → retry → recuperação

| Passo | Ação esperada | Resultado esperado |
|---|---|---|
| 1. Simular indisponibilidade de uma fonte | Painel aberto | Aviso amarelo com "!" e mensagem "Algumas atualizações estão indisponíveis no momento." |
| 2. Ver categorias seguras | Aviso expandido | Categorias como "Prazos e eventos", "Casos", sem nomes técnicos (`process_movements`, `deadlines`) |
| 3. Clicar em "Atualizar agora" | Uma única chamada `GET /api/notifications?refresh=1` | Badge e lista atualizados pelo mesmo retorno |
| 4. Recuperação completa | `countReliable=true` | Sino exibe número, aviso e "!" desaparecem |
| 5. Rate limit | Segundo clique em menos de 3 segundos | Mantém itens, exibe "Aguarde um instante..." e mantém "!" |

## Checklist por perfil

### Admin

| Módulo | Verificar | OK | Observações |
|---|---|---|---|
| Chat | Listar conversas, abrir conversa sintética, enviar e receber mensagem | [ ] | Não usar conteúdo real. |
| Casos | Criar, editar status/prioridade e remover caso de teste | [ ] | Verificar se prazos refletem na agenda. |
| Funil | Mover lead entre estágios e ver métricas | [ ] | Contar estágios sem identificar pessoas. |
| Agenda | Visualizar Hoje / 7 dias / 30 dias e aplicar filtros | [ ] | Confirmar cores de prioridade. |
| Notificações | Sino com número; parcial com "!"; retry por "Atualizar agora" | [ ] | Verificar sincronização sino/painel. |
| DataJud | Consultar processo com número sintético/código genérico | [ ] | Não usar CNJ real. |
| Triagem | Iniciar triagem e vincular a caso | [ ] | Verificar rota interna. |
| Documentos / Modelos | Criar template com placeholders e gerar documento | [ ] | Confirmar substituição de placeholders. |
| IA / RAG | Solicitar resumo de agenda e de caso | [ ] | Validar disclaimer e ausência de PII. |
| Colaboração e Auditoria | Trocar atribuição e consultar histórico | [ ] | Confirmar rastros de quem alterou. |

### Advogado

| Módulo | Verificar | OK | Observações |
|---|---|---|---|
| Chat | Responder como humano e alternar bot/humano | [ ] | Usar conversa de teste. |
| Casos | Visualizar prazos e atualizar status | [ ] | Prazo deve aparecer na agenda. |
| Funil | Avançar lead até proposta/contrato | [ ] | Não inserir valores reais. |
| Agenda | Ver prazos e eventos da área de atuação | [ ] | Confirmar agrupamento por dia. |
| Notificações | Receber alerta de prazo e mensagem nova | [ ] | Clicar e abrir origem correta. |
| Triagem | Validar movimentação e vincular a caso existente | [ ] | Verificar link seguro. |
| Documentos | Gerar documento a partir de template | [ ] | Verificar placeholders. |
| LGPD | Solicitar e registrar consentimento sintético | [ ] | Confirmar protocolo e log. |

### Estagiário

| Módulo | Verificar | OK | Observações |
|---|---|---|---|
| Chat | Visualizar conversas atribuídas e responder | [ ] | Sem acesso a confidenciais não atribuídas. |
| Casos | Visualizar casos atribuídos (sem editar sensiveis) | [ ] | Verificar permissões negativas. |
| Agenda | Visualizar prazos e eventos atribuídos | [ ] | Não criar/editar prioridade alta. |
| Notificações | Ver notificações de mensagens e prazos | [ ] | Sino e painel consistentes. |
| Tarefas | Adicionar nota visível/interna | [ ] | Verificar opções restritas. |

## Permissões negativas a confirmar

| Perfil | Ação que deve ser negada |
|---|---|
| Estagiário | Alterar papel de usuário, acessar notas internas de outros, excluir casos. |
| Advogado | Criar/alterar usuários, acessar configurações de retenção LGPD, excluir conversas. |
| Admin | Não pode violar LGPD: anonimização sem justificativa, acesso a dados confidenciais sem atribuição. |

## Rollback e observabilidade

| Situação | Ação |
|---|---|
| Comportamento inesperado após deploy | Reverter para commit anterior via Vercel; não recriar banco nem alterar schema. |
| Erro parcial persistente | Coletar `unreadCount`, `countReliable`, timestamp e usuário (hash ou ID sintético); não coletar PII. |
| Fadiga de cache/rate limit | Verificar `notificationCache.invalidateAll()` por usuário; manter cache global em pé. |
| PII exposta | Aplicar anonimização imediata do registro, revogar consentimento e abrir incidente. |

## Logs e evidências seguros

- Registrar somente: módulo testado, perfil, ação, resultado (passou/falhou) e ambiente.
- Não anexar: print com nomes, documentos, conversas, tokens, CNJ, telefones.
- Evidência aceitável: descrição textual do comportamento e redirecionamento para rota esperada.

## Aprovação

| Perfil | Responsável | Data | Assinatura/ID |
|---|---|---|---|
| Admin | | | |
| Advogado | | | |
| Estagiário | | | |
| Aprovação técnica | | | |
