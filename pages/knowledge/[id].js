import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import { apiJson } from '../../lib/apiClient';

export default function KnowledgeDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [document, setDocument] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const data = await apiJson(`/api/knowledge/${id}`);
        setDocument(data.document || data);
      } catch {
        setMessage('Erro ao carregar documento');
      }
    }
    load();
  }, [id]);

  if (message) {
    return <p className="p-4" role="status" aria-live="polite">{message}</p>;
  }

  if (!document) {
    return <p className="p-4">Carregando...</p>;
  }

  return (
    <div className="container mx-auto p-4">
      <Head><title>{document.title}</title></Head>
      <button
        type="button"
        onClick={() => router.push('/knowledge')}
        className="mb-4 rounded bg-gray-200 px-4 py-2"
        aria-label="Voltar para lista"
      >
        Voltar
      </button>
      <h1 className="text-2xl font-bold mb-2">{document.title}</h1>
      <p className="text-sm text-gray-600 mb-4">{document.type} {document.tags?.length ? `• ${document.tags.join(', ')}` : ''}</p>
      {document.summary && <p className="mb-4 italic">{document.summary}</p>}
      <pre className="whitespace-pre-wrap rounded border p-4 bg-gray-50">{document.content}</pre>
    </div>
  );
}
