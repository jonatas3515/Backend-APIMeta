import { LEGAL_AREAS, getLegalAreaLabel } from '../lib/legalAreas';
import useAreaFilter from '../hooks/useAreaFilter';

export default function AreaFilterSelector({ compact = false }) {
  const { selectedArea, setSelectedArea, isActive } = useAreaFilter();

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'w-full max-w-xs'}`}>
      <span className="text-sm" title="Filtrar por área jurídica">
        {isActive ? '🔍' : '⚖️'}
      </span>
      <select
        value={selectedArea}
        onChange={(e) => setSelectedArea(e.target.value)}
        className={`block border border-gray-300 rounded bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
          compact ? 'px-2 py-1 text-xs w-40' : 'px-3 py-2 text-sm w-full'
        }`}
        aria-label="Filtrar por área jurídica"
      >
        <option value="">Todas as Áreas</option>
        {LEGAL_AREAS.map((area) => (
          <option key={area.value} value={area.value}>
            {area.label}
          </option>
        ))}
      </select>
      {isActive && (
        <span className="hidden sm:inline text-xs font-medium text-blue-700 truncate max-w-[120px]">
          {getLegalAreaLabel(selectedArea)}
        </span>
      )}
    </div>
  );
}
