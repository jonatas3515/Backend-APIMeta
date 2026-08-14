import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import ExportButtons from './ExportButtons';
import { exportAuditPdf, exportAuditExcel } from '../lib/export';

export default function CollaborationPanel({ conversationId, caseId }) {
  const [activeTab, setActiveTab] = useState('notes');
  const [notes, setNotes] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignedUser, setAssignedUser] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [isVisibleToClient, setIsVisibleToClient] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (conversationId || caseId) {
      fetchData();
    }
  }, [conversationId, caseId, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Busca usuários
      const usersRes = await fetch('/api/collaboration?action=users', { headers: await getAuthHeaders() });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      if (activeTab === 'notes') {
        // Busca notas
        const notesParams = new URLSearchParams({ action: 'notes', conversation_id: conversationId || '' });
        if (caseId) notesParams.append('case_id', caseId);
        const notesRes = await fetch(
          `/api/collaboration?${notesParams.toString()}`,
          { headers: await getAuthHeaders() }
        );
        if (notesRes.ok) {
          const notesData = await notesRes.json();
          setNotes(notesData);
        }
      } else if (activeTab === 'audit') {
        // Busca auditoria
        const auditRes = await fetch(
          `/api/collaboration?action=audit&entity_type=${caseId ? 'case' : 'conversation'}&entity_id=${caseId || conversationId}`,
          { headers: await getAuthHeaders() }
        );
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          setAuditLogs(auditData);
        }
      }
    } catch (error) {
      console.error('[COLLABORATION] Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      const response = await fetch('/api/collaboration', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: 'add_note',
          conversation_id: conversationId,
          case_id: caseId,
          text: newNote,
          is_visible_to_client: isVisibleToClient,
          user_id: null
        })
      });

      if (response.ok) {
        setNewNote('');
        setIsVisibleToClient(false);
        fetchData();
      }
    } catch (error) {
      console.error('[COLLABORATION] Erro ao adicionar nota:', error);
      alert('Erro ao adicionar nota');
    }
  };

  const handleAssignUser = async (userId) => {
    try {
      const response = await fetch('/api/collaboration', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: 'assign_user',
          entity_type: caseId ? 'case' : 'conversation',
          entity_id: caseId || conversationId,
          user_id: userId,
          current_user_id: null
        })
      });

      if (response.ok) {
        setAssignedUser(userId);
        fetchData();
      }
    } catch (error) {
      console.error('[COLLABORATION] Erro ao atribuir usuário:', error);
      alert('Erro ao atribuir usuário');
    }
  };

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header com abas */}
      <div className="border-b border-gray-200 p-4">
        <h3 className="font-bold text-lg mb-3">👥 Colaboração</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('notes')}
            disabled={activeTab !== 'notes'}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              activeTab === 'notes'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            📝 Notas
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            disabled={activeTab !== 'audit'}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            📋 Auditoria
          </button>
          <button
            onClick={() => setActiveTab('assign')}
            disabled={activeTab !== 'assign'}
            className={`px-3 py-1 rounded text-sm font-medium transition ${
              activeTab === 'assign'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            👤 Atribuir
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <p className="text-center text-gray-500 text-sm">Carregando...</p>
        ) : activeTab === 'notes' ? (
          <div className="space-y-4">
            {/* Formulário de nova nota */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Adicionar nota interna..."
                className="w-full px-2 py-2 border rounded text-sm mb-2"
                rows="3"
              />
              <label className="flex items-center gap-2 mb-2 text-sm">
                <input
                  type="checkbox"
                  checked={isVisibleToClient}
                  onChange={(e) => setIsVisibleToClient(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Visível para cliente</span>
              </label>
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="w-full px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Adicionar Nota
              </button>
            </div>

            {/* Lista de notas */}
            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">Nenhuma nota</p>
              ) : (
                notes.map(note => (
                  <div key={note.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {note.users?.name || 'Sistema'}
                      </span>
                      {note.is_visible_to_client && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                          Visível
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mb-1">{note.text}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(note.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'audit' ? (
          <div className="space-y-3">
            <ExportButtons
              onPdf={() => exportAuditPdf({ auditLogs })}
              onExcel={() => exportAuditExcel({ auditLogs })}
              disabled={auditLogs.length === 0}
            />
            {auditLogs.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">Nenhuma alteração registrada</p>
            ) : (
              auditLogs.map(log => (
                <div key={log.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-semibold text-gray-700">
                      {log.action.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mb-1">
                    Por: {log.users?.name || 'Sistema'}
                  </p>
                  {log.old_value && (
                    <p className="text-xs text-red-600">
                      De: <code>{log.old_value}</code>
                    </p>
                  )}
                  {log.new_value && (
                    <p className="text-xs text-green-600">
                      Para: <code>{log.new_value}</code>
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : activeTab === 'assign' ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Atribuir responsável:</p>
            {users.length === 0 ? (
              <p className="text-xs text-gray-500">Nenhum usuário disponível</p>
            ) : (
              users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleAssignUser(user.id)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition ${
                    assignedUser === user.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-400'
                  }`}
                >
                  <p className="font-semibold text-sm">{user.name}</p>
                  <p className="text-xs text-gray-600">{user.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {user.role === 'admin' ? '👑 Admin' : user.role === 'advogado' ? '⚖️ Advogado' : '📚 Estagiário'}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
