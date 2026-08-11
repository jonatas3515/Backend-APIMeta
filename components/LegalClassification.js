import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import axios from 'axios';

export default function LegalClassification({ conversation, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    legal_area: conversation.legal_area || '',
    legal_situation: conversation.legal_situation || '',
    client_status: conversation.client_status || 'lead',
    priority: conversation.priority || 'normal',
    assigned_to: conversation.assigned_to || '',
    notes: conversation.notes || '',
    funnel_stage: conversation.funnel_stage || 'intake',
    case_type: conversation.case_type || '',
    municipality: conversation.municipality || '',
    state: conversation.state || '',
    organ: conversation.organ || '',
    position: conversation.position || '',
    is_public_employee: conversation.is_public_employee || false,
    source: conversation.source || '',
    campaign: conversation.campaign || ''
  });

  const legalAreas = [
    { value: 'trabalhista', label: '⚖️ Trabalhista' },
    { value: 'previdenciario', label: '🏛️ Previdenciário' },
    { value: 'civel', label: '📄 Cível' },
    { value: 'consumidor', label: '🛒 Consumidor' },
    { value: 'administrativo', label: '🏢 Administrativo' }
  ];

  const legalSituations = [
    { value: 'consulta_rapida', label: '💬 Consulta Rápida' },
    { value: 'potencial_acao', label: '⚡ Potencial Ação' },
    { value: 'acompanhamento_processo', label: '📊 Acompanhamento' },
    { value: 'caso_encerrado', label: '✅ Caso Encerrado' }
  ];

  const clientStatuses = [
    { value: 'lead', label: '🎯 Lead' },
    { value: 'cliente_ativo', label: '✅ Cliente Ativo' },
    { value: 'cliente_antigo', label: '📁 Cliente Antigo' },
    { value: 'caso_recusado', label: '❌ Caso Recusado' }
  ];

  const priorities = [
    { value: 'baixa', label: '🟢 Baixa' },
    { value: 'normal', label: '🟡 Normal' },
    { value: 'alta', label: '🟠 Alta' },
    { value: 'urgente', label: '🔴 Urgente' }
  ];

  const funnelStages = [
    { value: 'intake', label: '📥 Intake' },
    { value: 'qualificacao', label: '✅ Qualificação' },
    { value: 'proposta', label: '💰 Proposta' },
    { value: 'contrato', label: '📝 Contrato' },
    { value: 'andamento', label: '⚙️ Andamento' },
    { value: 'pos_caso', label: '🏁 Pós-caso' }
  ];

  const organs = [
    { value: 'prefeitura', label: '🏛️ Prefeitura' },
    { value: 'camara', label: '🏛️ Câmara' },
    { value: 'autarquia', label: '🏛️ Autarquia' },
    { value: 'empresa_privada', label: '🏢 Empresa Privada' },
    { value: 'outro', label: '📋 Outro' }
  ];

  const positions = [
    { value: 'professor_municipal', label: '👨‍🏫 Professor Municipal' },
    { value: 'agente_comunitario', label: '👥 Agente Comunitário' },
    { value: 'servidor_efetivo', label: '👤 Servidor Efetivo' },
    { value: 'servidor_comissionado', label: '👤 Servidor Comissionado' },
    { value: 'empregado_privado', label: '👷 Empregado Privado' },
    { value: 'aposentado', label: '🧓 Aposentado' },
    { value: 'outro', label: '📋 Outro' }
  ];

  const sources = [
    { value: 'whatsapp_organico', label: '💬 WhatsApp Orgânico' },
    { value: 'indicacao', label: '👥 Indicação' },
    { value: 'facebook', label: '📘 Facebook' },
    { value: 'instagram', label: '📸 Instagram' },
    { value: 'google', label: '🔍 Google' },
    { value: 'campanha', label: '📢 Campanha' }
  ];

  const getFunnelLabel = (stage) => funnelStages.find(s => s.value === stage)?.label || stage;
  const getOrganLabel = (organ) => organs.find(o => o.value === organ)?.label || organ;
  const getPositionLabel = (position) => positions.find(p => p.value === position)?.label || position;
  const getSourceLabel = (source) => sources.find(s => s.value === source)?.label || source;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update(formData)
        .eq('id', conversation.id);

      if (error) throw error;

      setEditing(false);
      onUpdate();
      alert('Classificação atualizada com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar classificação');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Deseja arquivar este caso? Ele ficará disponível para consulta mas não aparecerá na lista principal.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          status: 'closed'
        })
        .eq('id', conversation.id);

      if (error) throw error;

      onUpdate();
      alert('Caso arquivado com sucesso!');
    } catch (error) {
      console.error('Erro ao arquivar:', error);
      alert('Erro ao arquivar caso');
    }
  };

  const getBadgeStyle = () => 'bg-nc-gray-100 text-nc-text border border-nc-gray-200';

  if (!editing) {
    return (
      <div className="nc-card p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-nc-text-title">📋 Classificação Jurídica</h3>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-nc-yellow hover:text-nc-yellow-700 font-medium transition"
          >
            ✏️ Editar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs mb-1">Área Jurídica</p>
            {formData.legal_area ? (
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getBadgeStyle()}`}>
                {legalAreas.find(a => a.value === formData.legal_area)?.label || formData.legal_area}
              </span>
            ) : (
              <span className="text-nc-text-muted text-xs">Não definida</span>
            )}
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Situação</p>
            {formData.legal_situation ? (
              <span className="text-xs text-nc-text">
                {legalSituations.find(s => s.value === formData.legal_situation)?.label || formData.legal_situation}
              </span>
            ) : (
              <span className="text-nc-text-muted text-xs">Não definida</span>
            )}
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Status do Cliente</p>
            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getBadgeStyle()}`}>
              {clientStatuses.find(s => s.value === formData.client_status)?.label || formData.client_status}
            </span>
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Prioridade</p>
            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getBadgeStyle()}`}>
              {priorities.find(p => p.value === formData.priority)?.label || formData.priority}
            </span>
          </div>

          {formData.assigned_to && (
            <div className="col-span-2">
              <p className="text-gray-500 text-xs mb-1">Responsável</p>
              <span className="text-xs">👤 {formData.assigned_to}</span>
            </div>
          )}

          {formData.notes && (
            <div className="col-span-2">
              <p className="text-nc-text-muted text-xs mb-1">Observações</p>
              <p className="text-xs text-nc-text bg-nc-gray-50 p-2 rounded">{formData.notes}</p>
            </div>
          )}

          <div>
            <p className="text-gray-500 text-xs mb-1">Etapa do Funil</p>
            <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
              {getFunnelLabel(formData.funnel_stage)}
            </span>
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Origem</p>
            <span className="text-xs">{getSourceLabel(formData.source) || 'Não informada'}</span>
          </div>

          {formData.municipality && (
            <div>
              <p className="text-gray-500 text-xs mb-1">Município/UF</p>
              <span className="text-xs">{formData.municipality}{formData.state ? `/${formData.state}` : ''}</span>
            </div>
          )}

          {formData.organ && (
            <div>
              <p className="text-gray-500 text-xs mb-1">Órgão/Cargo</p>
              <span className="text-xs">{getOrganLabel(formData.organ)} {formData.position ? `• ${getPositionLabel(formData.position)}` : ''}</span>
            </div>
          )}

          {formData.case_type && (
            <div className="col-span-2">
              <p className="text-gray-500 text-xs mb-1">Tipo do Caso</p>
              <span className="text-xs font-medium">{formData.case_type}</span>
            </div>
          )}

          {formData.campaign && (
            <div>
              <p className="text-gray-500 text-xs mb-1">Campanha</p>
              <span className="text-xs">{formData.campaign}</span>
            </div>
          )}
        </div>

        {!conversation.archived && (
          <button
            onClick={handleArchive}
            className="w-full mt-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
          >
            📦 Arquivar Caso
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-900">📋 Editar Classificação</h3>
        <button
          onClick={() => setEditing(false)}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          ✖️ Cancelar
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Área Jurídica</label>
          <select
            value={formData.legal_area}
            onChange={(e) => setFormData({ ...formData, legal_area: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione...</option>
            {legalAreas.map(area => (
              <option key={area.value} value={area.value}>{area.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Situação</label>
          <select
            value={formData.legal_situation}
            onChange={(e) => setFormData({ ...formData, legal_situation: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecione...</option>
            {legalSituations.map(sit => (
              <option key={sit.value} value={sit.value}>{sit.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Status do Cliente</label>
          <select
            value={formData.client_status}
            onChange={(e) => setFormData({ ...formData, client_status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {clientStatuses.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Prioridade</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {priorities.map(priority => (
              <option key={priority.value} value={priority.value}>{priority.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Responsável</label>
          <input
            type="text"
            value={formData.assigned_to}
            onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
            placeholder="Nome do advogado responsável"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="border-t border-gray-200 pt-3">
          <h4 className="font-semibold text-gray-800 mb-2 text-sm">🎯 Funil de Atendimento</h4>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Etapa do Funil</label>
            <select
              value={formData.funnel_stage}
              onChange={(e) => setFormData({ ...formData, funnel_stage: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {funnelStages.map(stage => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <h4 className="font-semibold text-gray-800 mb-2 text-sm">📍 Segmentação</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Município</label>
              <input
                type="text"
                value={formData.municipality}
                onChange={(e) => setFormData({ ...formData, municipality: e.target.value })}
                placeholder="Ex: Eunápolis"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">UF</label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                placeholder="Ex: BA"
                maxLength={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Órgão</label>
              <select
                value={formData.organ}
                onChange={(e) => setFormData({ ...formData, organ: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {organs.map(organ => (
                  <option key={organ.value} value={organ.value}>{organ.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Cargo</label>
              <select
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {positions.map(position => (
                  <option key={position.value} value={position.value}>{position.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_public_employee}
                onChange={(e) => setFormData({ ...formData, is_public_employee: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm">Servidor público</span>
            </label>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-3">
          <h4 className="font-semibold text-gray-800 mb-2 text-sm">📈 Marketing</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Origem</label>
              <select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione...</option>
                {sources.map(source => (
                  <option key={source.value} value={source.value}>{source.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Campanha</label>
              <input
                type="text"
                value={formData.campaign}
                onChange={(e) => setFormData({ ...formData, campaign: e.target.value })}
                placeholder="Ex: Aposentadoria 2026"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo do Caso</label>
          <input
            type="text"
            value={formData.case_type}
            onChange={(e) => setFormData({ ...formData, case_type: e.target.value })}
            placeholder="Ex: Demissão sem justa causa, Adicional de insalubridade"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Observações Internas</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Anotações sobre o caso..."
            rows="3"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-300 transition"
        >
          {saving ? 'Salvando...' : '💾 Salvar Classificação'}
        </button>
      </div>
    </div>
  );
}
