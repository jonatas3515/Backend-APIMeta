import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import { apiCall } from '../lib/apiClient';

export default function CaseDocumentsPanel({ caseItem, checklist = [], onClose }) {
  const { profile } = useAuth();
  const isIntern = profile?.role === 'estagiario';

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [linkDocId, setLinkDocId] = useState(null);
  const [linkItemId, setLinkItemId] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (caseItem?.id) {
      fetchDocuments();
    }
  }, [caseItem?.id]);

  const fetchDocuments = async () => {
    if (!caseItem?.id) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await apiCall(`/api/case-documents?case_id=${caseItem.id}`);
      const data = await response.json();
      setDocuments(data || []);
    } catch (error) {
      console.error('[CASE_DOCUMENTS_PANEL] Erro ao carregar documentos');
      setMessage({ type: 'error', text: 'Erro ao carregar documentos. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (docId) => {
    try {
      const response = await apiCall(`/api/case-documents?id=${docId}&download=1`);
      const data = await response.json();
      if (data?.signed_url) {
        window.open(data.signed_url, '_blank');
      }
    } catch (error) {
      console.error('[CASE_DOCUMENTS_PANEL] Erro ao baixar');
      setMessage({ type: 'error', text: 'Erro ao gerar link temporário. Tente novamente.' });
    }
  };

  const handleFileSelect = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const base64 = await fileToBase64(selectedFile);
      await apiCall('/api/case-documents', {
        method: 'POST',
        body: JSON.stringify({
          case_id: caseItem.id,
          conversation_id: caseItem.conversation_id,
          base64,
          mime_type: selectedFile.type || 'application/octet-stream',
          original_filename: selectedFile.name
        })
      });
      setSelectedFile(null);
      fetchDocuments();
    } catch (error) {
      console.error('[CASE_DOCUMENTS_PANEL] Erro no upload');
      setMessage({ type: 'error', text: error.response?.data?.error || 'Erro ao enviar arquivo. Tente novamente.' });
    } finally {
      setUploading(false);
    }
  };

  const handleLink = async (docId) => {
    try {
      const headers = await getAuthHeaders();
      await axios.patch(`/api/case-documents?id=${docId}`, {
        checklist_item_id: linkItemId || null
      }, { headers });
      setLinkDocId(null);
      setLinkItemId('');
      fetchDocuments();
    } catch (error) {
      console.error('[CASE_DOCUMENTS_PANEL] Erro ao vincular');
      setMessage({ type: 'error', text: 'Erro ao vincular documento. Tente novamente.' });
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold">Documentos do Caso</h3>
            <p className="text-sm text-gray-500">{caseItem?.title || 'Caso'}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {message && (
            <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {message.text}
            </div>
          )}
          {isIntern ? null : (
            <div className="border rounded p-3 bg-gray-50">
              <p className="text-sm font-medium mb-2">Upload manual</p>
              <input
                type="file"
                onChange={handleFileSelect}
                className="text-sm mb-2"
              />
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:bg-gray-400"
              >
                {uploading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-500">Carregando documentos...</p>
          ) : documents.length === 0 ? (
            <p className="text-center text-gray-500">Nenhum documento registrado.</p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="border rounded p-3 bg-gray-50">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{doc.original_filename || 'Documento'}</p>
                      <p className="text-xs text-gray-500">
                        {doc.mime_type} • {formatBytes(doc.file_size)} • {doc.origin}
                      </p>
                      {doc.is_sensitive && (
                        <span className="text-xs text-red-600 font-bold">SENSÍVEL</span>
                      )}
                      {doc.checklist_item && (
                        <p className="text-xs text-blue-600">
                          Vinculado a: {doc.checklist_item.title}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleDownload(doc.id)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Baixar
                      </button>

                      {!isIntern && (
                        <>
                          {linkDocId === doc.id ? (
                            <div className="flex gap-1 items-center">
                              <select
                                value={linkItemId}
                                onChange={(e) => setLinkItemId(e.target.value)}
                                className="text-xs border rounded px-1 py-1"
                              >
                                <option value="">Sem vinculo</option>
                                {checklist.map((item) => (
                                  <option key={item.id} value={item.id}>{item.title || item.document_name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleLink(doc.id)}
                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => { setLinkDocId(null); setLinkItemId(''); }}
                                className="text-xs text-gray-500"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setLinkDocId(doc.id);
                                setLinkItemId(doc.checklist_item_id || '');
                              }}
                              className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
                            >
                              Vincular
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
