import { useEffect, useState } from 'react';
import Head from 'next/head';
import KnowledgeList from '../../components/KnowledgeList';
import KnowledgeForm from '../../components/KnowledgeForm';
import KnowledgeSearch from '../../components/KnowledgeSearch';
import { apiJson } from '../../lib/apiClient';

const userRole = 'advogado'; // Exemplo; em produção virá do auth

export default function KnowledgePage() {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');

  async function loadDocuments() {
    try {
      const data = await apiJson(`/api/knowledge?query=${encodeURIComponent(query)}`);
      setDocuments(data.documents || []);
    } catch {
      setMessage('Erro ao carregar documentos');
    }
  }

  useEffect(() => {
    loadDocuments();
  }, [query]);

  async function handleCreate(payload) {
    try {
      await apiJson('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setMessage('Documento cadastrado');
      setShowForm(false);
      loadDocuments();
    } catch {
      setMessage('Erro ao cadastrar documento');
    }
  }

  async function handleDelete(id) {
    try {
      await apiJson(`/api/knowledge/${id}`, { method: 'DELETE' });
      setMessage('Documento removido');
      loadDocuments();
    } catch {
      setMessage('Erro ao remover documento');
    }
  }

  async function handleSearch(searchQuery) {
    try {
      const data = await apiJson('/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery, topK: 5 })
      });
      setSearchResults(data.chunks || []);
      setMessage('Busca concluída');
    } catch {
      setMessage('Erro na busca');
    }
  }

  return (
    <div className="container mx-auto p-4">
      <Head><title>Base de Conhecimento</title></Head>
      <h1 className="text-2xl font-bold mb-4">Base de Conhecimento Jurídico</h1>
      {message && <p className="mb-4 text-sm" role="status" aria-live="polite">{message}</p>}

      <div className="mb-6">
        <KnowledgeSearch onSearch={handleSearch} results={searchResults} />
      </div>

      <div className="mb-6">
        <KnowledgeList
          documents={documents}
          query={query}
          onQueryChange={(e) => setQuery(e.target.value)}
          onSearch={loadDocuments}
          onNew={() => setShowForm(true)}
          onDelete={handleDelete}
          canDelete={userRole === 'admin' || userRole === 'advogado'}
        />
      </div>

      {showForm && (
        <div className="mb-6">
          <KnowledgeForm onSubmit={handleCreate} />
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="mt-2 rounded bg-gray-200 px-4 py-2"
            aria-label="Cancelar cadastro"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
