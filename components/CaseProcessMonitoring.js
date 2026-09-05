import { useState, useEffect, useMemo } from 'react';
import { apiCall } from '../lib/apiClient';
import { DATAJUD_COURTS, getCourtByCode } from '../lib/datajudCourts';

const FREQUENCY_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'diaria', label: 'Diária' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'mensal', label: 'Mensal' }
];

const CLIENT_ROLES = [
  'autor','reu','requerente','requerido','interessado','terceiro','outro'
];

const REVIEW_STATUS_LABEL = {
  nova: 'Nova',
  revisada: 'Revisada',
  ignorada: 'Ignorada',
  convertida_em_nota: 'Nota',
  convertida_em_agenda: 'Agenda'
};

function formatCNJ(number) {
  const n = String(number || '').replace(/\D/g, '');
  if (n.length !== 20) return number;
  return `${n.slice(0,7)}-${n.slice(7,9)}.${n.slice(9,13)}.${n.slice(13,14)}.${n.slice(14,16)}.${n.slice(16,20)}`;
}

export default function CaseProcessMonitoring({ caseId, userRole }) {
  const [processes, setProcesses] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [form, setForm] = useState({ process_number: '', court_code: '', client_role: 'outro', monitoring_frequency: 'manual', is_primary: false });
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [courtSearch, setCourtSearch] = useState('');
  const [noteText, setNoteText] = useState('');
  const [eventForm, setEventForm] = useState({ event_date: '', event_time: '', title: '', description: '', priority: 'media' });
  const [activeMovement, setActiveMovement] = useState(null);

  const isAdmin = userRole === 'admin';
  const isLawyer = userRole === 'admin' || userRole === 'advogado';

  const filteredByBranch = useMemo(() => {
    const s = courtSearch.toLowerCase().trim();
    const filtered = s
      ? DATAJUD_COURTS.filter((c) =>
          c.code.toLowerCase().includes(s) ||
          c.name.toLowerCase().includes(s) ||
          (c.uf || '').toLowerCase().includes(s)
        )
      : DATAJUD_COURTS;
    return filtered.reduce((acc, c) => {
      if (!acc[c.branch]) acc[c.branch] = [];
      acc[c.branch].push(c);
      return acc;
    }, {});
  }, [courtSearch]);

  useEffect(() => {
    if (caseId) fetchProcesses();
  }, [caseId]);

  useEffect(() => {
    if (selectedProcess) fetchMovements(selectedProcess.id);
  }, [selectedProcess]);

  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/case-processes?case_id=${caseId}`, { headers });
      const data = await res.json();
      if (res.ok) setProcesses(data || []);
      else setError(data.error || 'Erro ao carregar processos');
    } catch (e) {
      setError('Erro ao carregar processos');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async (processId) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/case-processes/${processId}/movements?limit=50`, { headers });
      const data = await res.json();
      if (res.ok) setMovements(data.data || []);
    } catch (e) {
      console.error('[PROCESS-MONITORING] Erro ao carregar movimentações:', e);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null); setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/case-processes', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, case_id: caseId })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Processo cadastrado.');
        setForm({ process_number: '', court_code: '', client_role: 'outro', monitoring_frequency: 'manual', is_primary: false });
        setShowForm(false);
        fetchProcesses();
        setSelectedProcess(data);
      } else {
        setError(data.error || 'Erro ao cadastrar processo');
      }
    } catch (e) {
      setError('Erro ao cadastrar processo');
    }
  };

  const handleQuery = async (process) => {
    setQuerying(true); setError(null); setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/case-processes/${process.id}/query`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (res.ok) {
        if (data.new_movements_count > 0) {
          setMessage(`${data.new_movements_count} nova(s) movimentação(ões) detectada(s) — aguardando revisão jurídica.`);
        } else if (data.status === 'success') {
          setMessage('Nenhuma movimentação nova desde a última consulta.');
        } else if (data.status === 'not_found') {
          setMessage('Processo não localizado na fonte consultada. Confira número e tribunal.');
        } else if (data.status === 'restricted') {
          setMessage('Dados não disponíveis pela fonte pública. Acompanhe pelo sistema oficial apropriado.');
        } else if (data.status === 'rate_limited') {
          setMessage('Consulta temporariamente indisponível (rate limit). Tente mais tarde.');
        } else {
          setMessage(data.message || 'Consulta concluída sem alterações.');
        }
        // refresh selected process movements
        await fetchProcesses();
        if (selectedProcess && selectedProcess.id === process.id) await fetchMovements(process.id);
      } else {
        setError(data.error || 'Erro na consulta');
      }
    } catch (e) {
      setError('Erro na consulta ao DataJud.');
    } finally {
      setQuerying(false);
    }
  };

  const handleReview = async (movementId, status, notes = null) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/process-movements/${movementId}/review`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: status, review_notes: notes })
      });
      if (res.ok) {
        if (selectedProcess) fetchMovements(selectedProcess.id);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao revisar');
      }
    } catch (e) {
      setError('Erro ao revisar movimentação');
    }
  };

  const handleCreateNote = async (movementId) => {
    if (!noteText.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/process-movements/${movementId}/create-note`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText.trim() })
      });
      if (res.ok) {
        setNoteText(''); setActiveMovement(null);
        if (selectedProcess) fetchMovements(selectedProcess.id);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao criar nota');
      }
    } catch (e) {
      setError('Erro ao criar nota');
    }
  };

  const handleCreateAgenda = async (movementId) => {
    if (!eventForm.event_date || !eventForm.title) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/process-movements/${movementId}/create-agenda-event`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventForm)
      });
      if (res.ok) {
        setEventForm({ event_date: '', event_time: '', title: '', description: '', priority: 'media' });
        setActiveMovement(null);
        if (selectedProcess) fetchMovements(selectedProcess.id);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao criar evento');
      }
    } catch (e) {
      setError('Erro ao criar evento');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover processo do monitoramento?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/case-processes?id=${id}`, { method: 'DELETE', headers });
      if (res.ok) {
        setSelectedProcess(null);
        fetchProcesses();
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao remover processo');
      }
    } catch (e) {
      setError('Erro ao remover processo');
    }
  };

  if (!caseId) return <p className="p-4 text-gray-500">Selecione um caso para monitorar processos.</p>;

  return (
    <div className="p-4">
      {error && <div className="mb-3 p-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {message && <div className="mb-3 p-2 bg-blue-100 text-blue-800 rounded">{message}</div>}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold">⚖️ Monitoramento Processual</h3>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
          {showForm ? 'Cancelar' : '+ Adicionar processo'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white p-4 rounded shadow mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium">Número CNJ</label>
              <input
                value={form.process_number}
                onChange={(e) => setForm({ ...form, process_number: e.target.value })}
                placeholder="0001234-56.2026.8.05.0123"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Tribunal</label>
              <input
                value={courtSearch}
                onChange={(e) => setCourtSearch(e.target.value)}
                placeholder="Buscar por sigla, nome ou UF"
                className="w-full px-3 py-2 border rounded mb-1"
              />
              <select
                value={form.court_code}
                onChange={(e) => setForm({ ...form, court_code: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                required
              >
                <option value="">Selecione o tribunal...</option>
                {Object.entries(filteredByBranch).map(([branch, courts]) => (
                  <optgroup key={branch} label={branch}>
                    {courts.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {form.court_code && (
                <p className="text-xs text-green-700 mt-1">
                  Selecionado: {getCourtByCode(form.court_code)?.code} — {getCourtByCode(form.court_code)?.name}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium">Polo do cliente</label>
              <select
                value={form.client_role}
                onChange={(e) => setForm({ ...form, client_role: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                {CLIENT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Frequência sugerida</label>
              <select
                value={form.monitoring_frequency}
                onChange={(e) => setForm({ ...form, monitoring_frequency: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                {FREQUENCY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <input
              id="is_primary"
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
            />
            <label htmlFor="is_primary" className="text-sm">Processo principal deste caso</label>
          </div>
          <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Salvar</button>
        </form>
      )}

      {loading ? <p>Carregando...</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2">Processos vinculados</h4>
            {processes.length === 0 && <p className="text-gray-500">Nenhum processo cadastrado.</p>}
            <div className="space-y-2">
              {processes.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProcess(p)}
                  className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${selectedProcess?.id === p.id ? 'bg-blue-50 border-blue-300' : 'bg-white'}`}
                >
                  <div className="flex justify-between">
                    <span className="font-mono font-medium">{formatCNJ(p.process_number)}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-200">{p.monitoring_status}</span>
                  </div>
                  <div className="text-sm text-gray-600">{p.court_name || p.court_code?.toUpperCase()} {p.is_primary && '• Principal'}</div>
                  <div className="text-xs text-gray-500">Última consulta: {p.last_checked_at ? new Date(p.last_checked_at).toLocaleString('pt-BR') : '—'}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleQuery(p); }}
                      disabled={querying}
                      className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                    >
                      {querying ? 'Consultando...' : '🔄 Consultar agora'}
                    </button>
                    {isLawyer && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                        className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedProcess && (
            <div className="bg-white p-4 border rounded">
              <h4 className="font-semibold mb-2">📜 Movimentações</h4>
              {movements.length === 0 && <p className="text-gray-500">Nenhuma movimentação registrada.</p>}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {movements.map((m) => (
                  <div key={m.id} className={`p-3 rounded border ${m.review_status === 'nova' ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50'}`}>
                    <div className="text-xs text-gray-500">
                      {m.movement_date ? new Date(m.movement_date).toLocaleString('pt-BR') : '—'} • {m.source}
                    </div>
                    <div className="text-sm mt-1">{m.movement_text}</div>
                    <div className="text-xs mt-1">
                      Status: <span className="font-medium">{REVIEW_STATUS_LABEL[m.review_status] || m.review_status}</span>
                    </div>
                    {isLawyer && m.review_status === 'nova' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => handleReview(m.id, 'revisada')} className="text-xs px-2 py-1 bg-green-100 rounded hover:bg-green-200">✓ Revisada</button>
                        <button onClick={() => handleReview(m.id, 'ignorada')} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">Ignorar</button>
                        <button onClick={() => setActiveMovement({ ...m, mode: 'note' })} className="text-xs px-2 py-1 bg-blue-100 rounded hover:bg-blue-200">Criar nota</button>
                        <button onClick={() => setActiveMovement({ ...m, mode: 'agenda' })} className="text-xs px-2 py-1 bg-purple-100 rounded hover:bg-purple-200">Criar agenda</button>
                      </div>
                    )}
                    {activeMovement?.id === m.id && activeMovement.mode === 'note' && (
                      <div className="mt-2">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Texto da nota interna"
                          className="w-full px-2 py-1 border rounded text-sm"
                          rows={2}
                        />
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => handleCreateNote(m.id)} className="text-xs px-2 py-1 bg-green-600 text-white rounded">Salvar nota</button>
                          <button onClick={() => setActiveMovement(null)} className="text-xs px-2 py-1 bg-gray-300 rounded">Cancelar</button>
                        </div>
                      </div>
                    )}
                    {activeMovement?.id === m.id && activeMovement.mode === 'agenda' && (
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <input type="date" value={eventForm.event_date} onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })} className="px-2 py-1 border rounded text-sm" />
                        <input type="time" value={eventForm.event_time} onChange={(e) => setEventForm({ ...eventForm, event_time: e.target.value })} className="px-2 py-1 border rounded text-sm" />
                        <input type="text" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder="Título" className="px-2 py-1 border rounded text-sm" />
                        <input type="text" value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Descrição" className="px-2 py-1 border rounded text-sm" />
                        <select value={eventForm.priority} onChange={(e) => setEventForm({ ...eventForm, priority: e.target.value })} className="px-2 py-1 border rounded text-sm">
                          <option value="baixa">Baixa</option>
                          <option value="media">Média</option>
                          <option value="alta">Alta</option>
                        </select>
                        <div className="flex gap-2">
                          <button onClick={() => handleCreateAgenda(m.id)} className="text-xs px-2 py-1 bg-green-600 text-white rounded">Salvar evento</button>
                          <button onClick={() => setActiveMovement(null)} className="text-xs px-2 py-1 bg-gray-300 rounded">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

