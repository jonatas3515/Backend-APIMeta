import { useState } from 'react';

export default function KnowledgeSearch({ onSearch, results = [] }) {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(query.trim());
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <label htmlFor="semantic-search" className="sr-only">Busca avançada</label>
        <input
          id="semantic-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca avançada..."
          className="flex-1 rounded border px-3 py-2"
          aria-describedby="semantic-search-help"
        />
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-white"
          aria-label="Executar busca"
        >
          Buscar
        </button>
      </form>
      <p id="semantic-search-help" className="text-sm text-gray-500">Busca por palavras-chave nos conteúdos indexados.</p>

      {results.length > 0 && (
        <ul className="divide-y divide-gray-200">
          {results.map((r) => (
            <li key={`${r.documentId}-${r.chunkIndex}`} className="py-2">
              <div className="font-semibold">{r.title} <span className="text-sm text-gray-500">({r.type})</span></div>
              <p className="text-sm text-gray-700">{r.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
