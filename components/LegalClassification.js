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
    notes: conversation.notes || ''
  });

  const legalAreas = [
    { value: 'trabalhista', label: '⚖️ Trabalhista', color: 'blue' },
    { value: 'previdenciario', label: '🏛️ Previdenciário', color: 'purple' },
    { value: 'civel', label: '📄 Cível', color: 'gray' },
    { value: 'consumidor', label: '🛒 Consumidor', color: 'green' },
    { value: 'administrativo', label: '🏢 Administrativo', color: 'yellow' }
  ];

  const legalSituations = [
    { value: 'consulta_rapida', label: '💬 Consulta Rápida' },
    { value: 'potencial_acao', label: '⚡ Potencial Ação' },
    { value: 'acompanhamento_processo', label: '📊 Acompanhamento' },
    { value: 'caso_encerrado', label: '✅ Caso Encerrado' }
  ];

  const clientStatuses = [
    { value: 'lead', label: '🎯 Lead', color: 'yellow' },
    { value: 'cliente_ativo', label: '✅ Cliente Ativo', color: 'green' },
    { value: 'cliente_antigo', label: '📁 Cliente Antigo', color: 'gray' },
    { value: 'caso_recusado', label: '❌ Caso Recusado', color: 'red' }
  ];

  const priorities = [
    { value: 'baixa', label: '🟢 Baixa', color: 'green' },
    { value: 'normal', label: '🟡 Normal', color: 'yellow' },
    { value: 'alta', label: '🟠 Alta', color: 'orange' },
    { value: 'urgente', label: '🔴 Urgente', color: 'red' }
  ];

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

  const getAreaColor = (area) => {
    const areaObj = legalAreas.find(a => a.value === area);
    return areaObj?.color || 'gray';
  };

  const getStatusColor = (status) => {
    const statusObj = clientStatuses.find(s => s.value === status);
    return statusObj?.color || 'gray';
  };

  const getPriorityColor = (priority) => {
    const priorityObj = priorities.find(p => p.value === priority);
    return priorityObj?.color || 'gray';
  };

  if (!editing) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-900">📋 Classificação Jurídica</h3>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            ✏️ Editar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-500 text-xs mb-1">Área Jurídica</p>
            {formData.legal_area ? (
              <span className={`inline-block px-2 py-1 rounded bg-${getAreaColor(formData.legal_area)}-100 text-${getAreaColor(formData.legal_area)}-800 text-xs font-semibold`}>
                {legalAreas.find(a => a.value === formData.legal_area)?.label || formData.legal_area}
              </span>
            ) : (
              <span className="text-gray-400 text-xs">Não definida</span>
            )}
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Situação</p>
            {formData.legal_situation ? (
              <span className="text-xs">
                {legalSituations.find(s => s.value === formData.legal_situation)?.label || formData.legal_situation}
              </span>
            ) : (
              <span className="text-gray-400 text-xs">Não definida</span>
            )}
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Status do Cliente</p>
            <span className={`inline-block px-2 py-1 rounded bg-${getStatusColor(formData.client_status)}-100 text-${getStatusColor(formData.client_status)}-800 text-xs font-semibold`}>
              {clientStatuses.find(s => s.value === formData.client_status)?.label || formData.client_status}
            </span>
          </div>

          <div>
            <p className="text-gray-500 text-xs mb-1">Prioridade</p>
            <span className={`inline-block px-2 py-1 rounded bg-${getPriorityColor(formData.priority)}-100 text-${getPriorityColor(formData.priority)}-800 text-xs font-semibold`}>
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
              <p className="text-gray-500 text-xs mb-1">Observações</p>
              <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded">{formData.notes}</p>
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
