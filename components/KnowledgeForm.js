import { useState } from 'react';

const VALID_TYPES = ['tese', 'jurisprudencia', 'modelo', 'lei', 'sumula'];

export default function KnowledgeForm({ onSubmit, initial = {} }) {
  const [title, setTitle] = useState(initial.title || '');
  const [type, setType] = useState(initial.type || 'tese');
  const [content, setContent] = useState(initial.content || '');
  const [summary, setSummary] = useState(initial.summary || '');
  const [tags, setTags] = useState((initial.tags || []).join(', '));

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalizedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    onSubmit({ title, type, content, summary, tags: normalizedTags });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded border p-4">
      <div>
        <label htmlFor="knowledge-title" className="block text-sm font-medium">Título</label>
        <input
          id="knowledge-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border px-3 py-2"
          aria-describedby="knowledge-title-help"
          required
        />
        <p id="knowledge-title-help" className="text-sm text-gray-500">Título do documento jurídico.</p>
      </div>

      <div>
        <label htmlFor="knowledge-type" className="block text-sm font-medium">Tipo</label>
        <select
          id="knowledge-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded border px-3 py-2"
          aria-describedby="knowledge-type-help"
        >
          {VALID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <p id="knowledge-type-help" className="text-sm text-gray-500">Categoria do conteúdo.</p>
      </div>

      <div>
        <label htmlFor="knowledge-content" className="block text-sm font-medium">Conteúdo</label>
        <textarea
          id="knowledge-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="w-full rounded border px-3 py-2"
          aria-describedby="knowledge-content-help"
          required
        />
        <p id="knowledge-content-help" className="text-sm text-gray-500">Texto completo do documento.</p>
      </div>

      <div>
        <label htmlFor="knowledge-summary" className="block text-sm font-medium">Resumo</label>
        <textarea
          id="knowledge-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="w-full rounded border px-3 py-2"
          aria-describedby="knowledge-summary-help"
        />
        <p id="knowledge-summary-help" className="text-sm text-gray-500">Resumo opcional.</p>
      </div>

      <div>
        <label htmlFor="knowledge-tags" className="block text-sm font-medium">Tags</label>
        <input
          id="knowledge-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full rounded border px-3 py-2"
          aria-describedby="knowledge-tags-help"
          placeholder="tag1, tag2"
        />
        <p id="knowledge-tags-help" className="text-sm text-gray-500">Palavras-chave separadas por vírgula.</p>
      </div>

      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-white"
        aria-label="Cadastrar documento"
      >
        Cadastrar
      </button>
    </form>
  );
}
