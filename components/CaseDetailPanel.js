import { useState } from 'react';
import CollaborationPanel from './CollaborationPanel';
import CaseProcessMonitoring from './CaseProcessMonitoring';
import GeneratedDocumentsPanel from './GeneratedDocumentsPanel';
import { stripFeeFromNotes } from '../lib/caseFeeHelper';
import { apiJson } from '../lib/apiClient';

const TABS = [
  { key: 'visao-geral', label: 'Visão Geral' },
  { key: 'processos', label: 'Andamentos Processuais' },
  { key: 'documentos-checklist', label: 'Documentos e Checklist' },
  { key: 'colaboracao', label: 'Anotações da Equipe' }
];

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function daysUntilDeadline(date) {
  if (!date) return null;
  const today = new Date();
  const deadline = new Date(date);
  const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  return diff;
}

const cleanPhone = (p) => String(p || '').replace(/\D/g, '');

const STATUS_COLORS = {
  prospect: 'bg-gray-100 text-gray-800',
  em_analise: 'bg-blue-100 text-blue-800',
  proposta_enviada: 'bg-yellow-100 text-yellow-800',
  contrato_assinado: 'bg-purple-100 text-purple-800',
  acao_protocolada: 'bg-orange-100 text-orange-800',
  aguardando_decisao: 'bg-rose-100 text-rose-800',
  em_recurso: 'bg-indigo-100 text-indigo-800',
  em_execucao: 'bg-amber-100 text-amber-800',
  encerrado: 'bg-green-100 text-green-800',
  arquivado: 'bg-gray-100 text-gray-600'
};

const STATUS_LABELS = {
  prospect: 'Prospect',
  em_analise: 'Em Análise',
  proposta_enviada: 'Proposta Enviada',
  contrato_assinado: 'Contrato Assinado',
  acao_protocolada: 'Ação Protocolada',
  aguardando_decisao: 'Aguardando Decisão',
  em_recurso: 'Fase de Recurso',
  em_execucao: 'Fase de Execução',
  encerrado: 'Encerrado',
  arquivado: 'Arquivado'
};

const PRIORITY_COLORS = {
  baixa: 'text-green-600',
  media: 'text-yellow-600',
  alta: 'text-red-600'
};

const PROCEDURAL_STEP_LABELS = {
  conciliacao: 'Conciliação',
  instrucao: 'Instrução',
  sentenca: 'Sentença',
  recurso: 'Recurso',
  execucao: 'Execução',
  acordo: 'Acordo',
  outro: 'Outro'
};

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CaseDetailPanel({
  caseItem,
  caseView,
  onChangeView,
  onBack,
  onEditCase,
  onOpenChecklist,
  onOpenDocuments,
  onOpenFee,
  onOpenDecisionExtractor,
  onOpenRequest,
  onFinalizeCase,
  onDeleteCase,
  userRole,
  conversations = [],
  onOpenConversationSelector,
  onUnlinkConversation,
  linking = false,
  unlinking = false,
  userCanEdit = false
}) {
  const [sendingAlert, setSendingAlert] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState(null);

  const handleSendAdvogadoAlert = async () => {
    if (sendingAlert || !caseItem?.id) return;
    setSendingAlert(true);
    setAlertFeedback(null);
    try {
      const res = await apiJson('/api/cases/send-alert-whatsapp', {
        method: 'POST',
        body: JSON.stringify({ caseId: caseItem.id, target: 'advogado' })
      });
      setAlertFeedback({ type: 'success', text: res?.message || 'Alerta enviado com sucesso para seu WhatsApp!' });
    } catch (err) {
      setAlertFeedback({ type: 'error', text: err?.message || 'Erro ao enviar alerta pelo WhatsApp.' });
    } finally {
      setSendingAlert(false);
      setTimeout(() => setAlertFeedback(null), 5000);
    }
  };
  if (!caseItem || typeof caseItem !== 'object') {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-white rounded-lg shadow p-6 text-center">
        <div>
          <p className="text-sm text-gray-600">Nenhum caso selecionado.</p>
          {onBack && (
            <button
              onClick={onBack}
              className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Voltar para lista
            </button>
          )}
        </div>
      </div>
    );
  }

  const daysLeft = daysUntilDeadline(caseItem?.deadline_date);
  const linkedConversation = conversations?.find((c) => c.id === caseItem?.conversation_id);
  const hasProcessData = Boolean(
    caseItem?.process_number ||
    caseItem?.court ||
    caseItem?.court_division ||
    caseItem?.judicial_district ||
    caseItem?.procedural_step ||
    caseItem?.case_value ||
    caseItem?.distribution_date
  );

  return (
    <div className="flex-1 h-full flex flex-col bg-white rounded-lg shadow overflow-hidden">
      {/* Header com navegação */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Voltar para lista
          </button>
          <h2 className="text-lg font-bold text-gray-800 truncate px-2">{caseItem.title}</h2>
          <span className={`text-xs px-2 py-1 rounded font-semibold ${STATUS_COLORS[caseItem.status] || 'bg-gray-100 text-gray-800'}`}>
            {STATUS_LABELS[caseItem.status] || caseItem.status || 'sem status'}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onChangeView(tab.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                caseView === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-4">
        {caseView === 'visao-geral' && (
          <div className="space-y-4 max-w-4xl">
            {/* Feedback do Envio de Alerta WhatsApp */}
            {alertFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-bold flex items-center justify-between border ${
                  alertFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-red-50 text-red-800 border-red-300'
                }`}
              >
                <span>{alertFeedback.type === 'success' ? '✓' : '⚠️'} {alertFeedback.text}</span>
                <button onClick={() => setAlertFeedback(null)} className="text-gray-500 hover:text-gray-700">✕</button>
              </div>
            )}

            {/* Painel Superior de Ações Rápidas do Processo */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 shadow-xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <span>⚡</span> Ações do Processo:
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                  caseItem.status === 'encerrado' || caseItem.status === 'arquivado'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {caseItem.status === 'encerrado' || caseItem.status === 'arquivado' ? '📁 Caso Encerrado' : '⚡ Caso Ativo'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {userCanEdit && onEditCase && (
                  <button
                    type="button"
                    onClick={onEditCase}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    title="Editar informações cadastrais do caso"
                  >
                    <span>✏️</span> Editar Caso
                  </button>
                )}

                {onOpenDecisionExtractor && (
                  <button
                    type="button"
                    onClick={onOpenDecisionExtractor}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    title="Analisar ato ou acórdão com o Agente de IA"
                  >
                    <span>🤖</span> IA Decisão / Despacho
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onChangeView('processos')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Ver andamentos e movimentações processuais"
                >
                  <span>⚖️</span> Andamentos Projudi/PJe
                </button>

                <button
                  type="button"
                  onClick={onOpenChecklist}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Gerenciar checklist de pendências"
                >
                  <span>📋</span> Checklist
                </button>

                <button
                  type="button"
                  onClick={onOpenDocuments}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Visualizar documentos anexados"
                >
                  <span>📄</span> Documentos
                </button>

                <button
                  type="button"
                  onClick={onOpenFee}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  title="Simulador e gestão de honorários"
                >
                  <span>💰</span> Honorários
                </button>

                {onOpenRequest && (
                  <button
                    type="button"
                    onClick={onOpenRequest}
                    className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    title="Solicitar informações ou documentos ao cliente"
                  >
                    <span>💬</span> Solicitar
                  </button>
                )}

                {/* Disparo do Escritório direto para o WhatsApp do Dr. Jônatas */}
                <button
                  type="button"
                  onClick={handleSendAdvogadoAlert}
                  disabled={sendingAlert}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-black text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                  title="Disparar resumo e alertas deste caso pelo WhatsApp do escritório para o seu WhatsApp pessoal (73 999348552)"
                >
                  <span>🔔</span> {sendingAlert ? 'Enviando Alerta...' : 'Alerta p/ Meu WhatsApp'}
                </button>

                {/* Disparo direto para o WhatsApp do Cliente sem restrição de 24h da Meta */}
                {linkedConversation?.client_phone && (
                  <a
                    href={`https://wa.me/55${cleanPhone(linkedConversation.client_phone)}?text=${encodeURIComponent(
                      `Olá ${linkedConversation.client_name || ''}, aqui é do escritório de advocacia sobre o andamento do seu processo "${caseItem.title}" (${caseItem.process_number || ''}).`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                    title="Abrir WhatsApp para falar com o cliente com texto pronto (sem bloqueio de 24h)"
                  >
                    <span>📲</span> Avisar Cliente (WhatsApp)
                  </a>
                )}

                {userCanEdit && caseItem.status !== 'encerrado' && caseItem.status !== 'arquivado' && onFinalizeCase && (
                  <button
                    type="button"
                    onClick={onFinalizeCase}
                    className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 ml-auto"
                    title="Encerrar e finalizar caso"
                  >
                    <span>🏁</span> Finalizar Processo
                  </button>
                )}

                {userCanEdit && onDeleteCase && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Deseja realmente excluir o caso "${caseItem.title}"?`)) {
                        onDeleteCase();
                        onBack();
                      }
                    }}
                    className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition flex items-center gap-1"
                    title="Excluir caso"
                  >
                    <span>🗑️</span> Excluir
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Área jurídica</p>
                <p className="text-sm font-medium">{caseItem.legal_area || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Tipo de caso</p>
                <p className="text-sm font-medium">{caseItem.case_type || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Prioridade</p>
                <p className={`text-sm font-medium ${PRIORITY_COLORS[caseItem.priority] || 'text-gray-600'}`}>
                  {caseItem.priority || '-'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Prazo</p>
                <p className="text-sm font-medium">
                  {caseItem.deadline_date ? (
                    <>
                      {formatDate(caseItem.deadline_date)}
                      {daysLeft !== null && (
                        <span className={`ml-2 ${daysLeft < 0 ? 'text-red-600 font-bold' : daysLeft < 7 ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                          ({daysLeft < 0 ? `${Math.abs(daysLeft)}d atrasado` : `${daysLeft}d restantes`})
                        </span>
                      )}
                    </>
                  ) : '-'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Município</p>
                <p className="text-sm font-medium">{caseItem.municipality || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Órgão</p>
                <p className="text-sm font-medium">{caseItem.agency || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Papel do cliente</p>
                <p className="text-sm font-medium">{caseItem.client_role || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Tipo de prazo</p>
                <p className="text-sm font-medium">{caseItem.deadline_type || '-'}</p>
              </div>
            </div>

            {hasProcessData && (
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500 mb-2 font-bold">Dados processuais</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {caseItem.process_number && (
                    <div>
                      <p className="text-xs text-gray-500">Número do processo</p>
                      <p className="text-sm font-medium font-mono text-gray-900">{caseItem.process_number}</p>
                    </div>
                  )}
                  {caseItem.court && (
                    <div>
                      <p className="text-xs text-gray-500">Tribunal</p>
                      <p className="text-sm font-medium">{caseItem.court}</p>
                    </div>
                  )}
                  {caseItem.court_division && (
                    <div>
                      <p className="text-xs text-gray-500">Vara / Juizado</p>
                      <p className="text-sm font-medium">{caseItem.court_division}</p>
                    </div>
                  )}
                  {caseItem.judicial_district && (
                    <div>
                      <p className="text-xs text-gray-500">Comarca</p>
                      <p className="text-sm font-medium">{caseItem.judicial_district}</p>
                    </div>
                  )}
                  {caseItem.procedural_step && (
                    <div>
                      <p className="text-xs text-gray-500">Fase processual</p>
                      <p className="text-sm font-medium">
                        {PROCEDURAL_STEP_LABELS[caseItem.procedural_step] || caseItem.procedural_step}
                      </p>
                    </div>
                  )}
                  {caseItem.case_value !== null && caseItem.case_value !== undefined && caseItem.case_value !== '' && (
                    <div>
                      <p className="text-xs text-gray-500">Valor da causa</p>
                      <p className="text-sm font-medium">{formatCurrency(caseItem.case_value)}</p>
                    </div>
                  )}
                  {caseItem.distribution_date && (
                    <div>
                      <p className="text-xs text-gray-500">Data de distribuição</p>
                      <p className="text-sm font-medium">{formatDate(caseItem.distribution_date)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="p-3 bg-gray-50 rounded border">
              <p className="text-xs text-gray-500 mb-1 font-bold">Conversa vinculada</p>
              {linkedConversation ? (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{linkedConversation.client_name || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{linkedConversation.client_phone || 'Sem telefone'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={onOpenConversationSelector}
                      disabled={linking || unlinking}
                      title={linking ? 'Vinculando...' : 'Trocar conversa vinculada'}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-60"
                    >
                      {linking ? 'Vinculando...' : 'Trocar'}
                    </button>
                    <button
                      onClick={onUnlinkConversation}
                      disabled={linking || unlinking}
                      title={unlinking ? 'Removendo...' : 'Remover vínculo da conversa'}
                      className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-60"
                    >
                      {unlinking ? 'Removendo...' : 'Remover'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-600">Nenhuma conversa vinculada.</p>
                    <p className="text-xs text-gray-500" aria-live="polite" role="status">
                      Vincule uma conversa para solicitar documentos ou interagir com o cliente.
                    </p>
                  </div>
                  {userCanEdit && (
                    <button
                      onClick={onOpenConversationSelector}
                      disabled={linking}
                      title={linking ? 'Vinculando...' : 'Vincular uma conversa ativa a este caso'}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-60"
                    >
                      {linking ? 'Vinculando...' : 'Vincular conversa'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {stripFeeFromNotes(caseItem.notes) && (
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500 font-bold mb-1">Notas e Observações</p>
                <p className="text-sm whitespace-pre-wrap text-gray-800">{stripFeeFromNotes(caseItem.notes)}</p>
              </div>
            )}
          </div>
        )}

        {caseView === 'processos' && (
          <CaseProcessMonitoring caseId={caseItem.id} userRole={userRole} />
        )}

        {caseView === 'documentos-checklist' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <h3 className="font-semibold text-lg mb-3">📋 Checklist e Documentos Recebidos</h3>
              <p className="text-sm text-gray-600 mb-3">
                Gerencie o checklist de documentos e arquivos recebidos do cliente.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onOpenChecklist}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  📎 Abrir Checklist
                </button>
                <button
                  onClick={onOpenDocuments}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  📄 Abrir Documentos
                </button>
              </div>
            </div>
            
            <div className="border-t pt-6">
              <GeneratedDocumentsPanel 
                caseId={caseItem.id} 
                conversationId={caseItem.conversation_id}
                userRole={userRole}
              />
            </div>
          </div>
        )}

        {caseView === 'colaboracao' && (
          <CollaborationPanel conversationId={caseItem.conversation_id} caseId={caseItem.id} />
        )}
      </div>
    </div>
  );
}
