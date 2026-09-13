import { useRouter } from 'next/router';

export default function KnowledgeList({ documents, query, onQueryChange, onSearch, onNew, onDelete, canDelete }) {
  const router = useRouter();

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') onSearch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="knowledge-search" className="sr-only">Buscar por palavra-chave</label>
        <input
          id="knowledge-search"
          type="text"
          value={query}
          onChange={onQueryChange}
          onKeyDown={handleKeyDown}
          placeholder="Buscar por palavra-chave..."
          className="flex-1 rounded border border-gray-300 px-3 py-2"
          aria-describedby="knowledge-search-help"
        />
        <button
          type="button"
          onClick={onSearch}
          className="rounded bg-blue-600 px-4 py-2 text-white"
          aria-label="Buscar"
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={onNew}
          className="rounded bg-green-600 px-4 py-2 text-white"
          aria-label="Novo documento"
        >
          Novo documento
        </button>
      </div>
      <p id="knowledge-search-help" className="text-sm text-gray-500">
        Digite palavras-chave e pressione Enter ou clique em Buscar.
      </p>

      {documents.length === 0 ? (
        <p className="text-gray-500">Nenhum documento encontrado.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {documents.map((doc) => (
            <li key={doc.id} className="py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push(`/knowledge/${doc.id}`)}
                className="text-left"
                aria-label={`Abrir documento ${doc.title}`}
              >
                <div className="font-semibold">{doc.title}</div>
                <div className="text-sm text-gray-600">{doc.type} {doc.tags?.length ? `• ${doc.tags.join(', ')}` : ''}</div>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(doc.id)}
                  className="rounded bg-red-600 px-3 py-1 text-white text-sm"
                  aria-label={`Excluir documento ${doc.title}`}
                >
                  Excluir
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
