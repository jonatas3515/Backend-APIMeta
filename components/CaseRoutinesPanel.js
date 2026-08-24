import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

export default function CaseRoutinesPanel({ caseId, conversationId, userRole }) {
  const [routines, setRoutines] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [selectedRoutine, setSelectedRoutine] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const canApply = userRole === 'admin' || userRole === 'advogado';

  useEffect(() => {
    if (conversationId) {
      fetchRoutines();
      fetchExecutions();
    }
  }, [conversationId]);

  const fetchRoutines = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/routines?action=suggest&conversation_id=${conversationId}`, { headers });
      setRoutines(data || []);
    } catch (error) {
      console.error('[CASE_ROUTINES] Erro ao buscar rotinas');
      setMessage({ type: 'error', text: 'Erro ao buscar rotinas.' });
    }
  };

  const fetchExecutions = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/routines?action=executions&conversation_id=${conversationId}`, { headers });
      setExecutions(data || []);
    } catch (error) {
      console.error('[CASE_ROUTINES] Erro ao buscar execucoes');
      setMessage({ type: 'error', text: 'Erro ao buscar execuções.' });
    }
  };

  const handleApplyRoutine = async () => {
    if (!selectedRoutine) return;
    if (!canApply) {
      setMessage({ type: 'error', text: 'Você não tem permissão para aplicar rotinas.' });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        action: 'execute',
        routine_id: selectedRoutine,
        conversation_id: conversationId,
        confirmed: 'true'
      });
      
      if (caseId) params.append('case_id', caseId);
      
      await axios.get(`/api/routines?${params}`, { headers });
      setShowConfirm(false);
      setSelectedRoutine('');
      fetchExecutions();
      setMessage({ type: 'success', text: 'Rotina aplicada com sucesso.' });
    } catch (error) {
      console.error('[CASE_ROUTINES] Erro ao aplicar');
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erro ao aplicar rotina. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const selectedRoutineData = routines.find(r => r.id === selectedRoutine);

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <div>
        <h3 className="font-semibold text-lg mb-3">🔄 Aplicar Rotina</h3>
        <div className="space-y-3">
          <select
            value={selectedRoutine}
            onChange={(e) => setSelectedRoutine(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          >
            <option value="">Selecione uma rotina...</option>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} {r.legal_area && `(${r.legal_area})`}
              </option>
            ))}
          </select>
          
          {selectedRoutineData && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
              <p className="font-medium mb-1">{selectedRoutineData.name}</p>
              <p className="text-gray-600 mb-2">{selectedRoutineData.description}</p>
              <p className="font-medium text-xs mb-1">Passos:</p>
              <ul className="list-disc list-inside text-xs text-gray-600">
                {(selectedRoutineData.steps || []).map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </div>
          )}
          
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!selectedRoutine || !canApply}
            title={canApply ? '' : 'Aplicação de rotinas é restrita a administradores/advogados.'}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Aplicar Rotina
          </button>
          {!canApply && (
            <p className="text-xs text-red-600">Esta função é restrita a administradores/advogados.</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-lg mb-3">📋 Histórico de Execuções</h3>
        {executions.length === 0 ? (
          <div className="p-4 bg-gray-50 border rounded text-center space-y-2">
            <p className="text-sm text-gray-600">Nenhuma rotina aplicada a este caso.</p>
            {canApply && (
              <button
                onClick={() => setSelectedRoutine(routines[0]?.id || '')}
                disabled={routines.length === 0}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Aplicar rotina
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {executions.map((exec) => (
              <div key={exec.id} className="p-3 border rounded bg-white">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-medium text-sm">{exec.legal_routines?.name || 'Rotina'}</p>
                  <span className={`px-2 py-1 rounded text-xs ${
                    exec.status === 'completed' ? 'bg-green-100 text-green-800' :
                    exec.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {exec.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  Executado em {new Date(exec.executed_at || exec.created_at).toLocaleDateString('pt-BR')}
                </p>
                {exec.documents_generated && exec.documents_generated.length > 0 && (
                  <p className="text-xs text-gray-600">
                    📄 {exec.documents_generated.length} documento(s) gerado(s)
                  </p>
                )}
                {exec.reminders_created && exec.reminders_created.length > 0 && (
                  <p className="text-xs text-gray-600">
                    🔔 {exec.reminders_created.length} lembrete(s) criado(s)
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="p-4 border-b">
              <h3 className="font-bold text-lg">Confirmar Aplicação de Rotina</h3>
            </div>
            
            <div className="p-4">
              <p className="text-sm mb-4">
                Tem certeza que deseja aplicar a rotina <strong>{selectedRoutineData?.name}</strong>?
              </p>
              <p className="text-xs text-gray-600 mb-4">
                Esta ação irá criar documentos em rascunho e lembretes internos conforme configurado na rotina.
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={handleApplyRoutine}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Aplicando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
