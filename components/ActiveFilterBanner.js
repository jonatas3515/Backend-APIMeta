import { getLegalAreaLabel } from '../lib/legalAreas';
import useAreaFilter from '../hooks/useAreaFilter';

export default function ActiveFilterBanner() {
  const { selectedArea, clearArea } = useAreaFilter();

  if (!selectedArea) return null;

  return (
    <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
      <p className="text-sm text-blue-900">
        🔍 <strong>Filtrado por:</strong> {getLegalAreaLabel(selectedArea)}
      </p>
      <button
        onClick={clearArea}
        className="text-xs text-blue-700 hover:text-blue-900 underline"
      >
        Limpar filtro
      </button>
    </div>
  );
}
