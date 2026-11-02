import { getLegalAreaLabel } from '../lib/legalAreas';
import useAreaFilter from '../hooks/useAreaFilter';

export default function ActiveFilterBanner() {
  const { selectedArea, clearArea } = useAreaFilter();

  if (!selectedArea) return null;

  return (
    <div className="w-full bg-yellow-950/40 border-b border-yellow-500/30 px-4 py-2 flex items-center justify-between text-yellow-200">
      <p className="text-xs sm:text-sm text-yellow-300">
        ⚖️ <strong>Filtrado por:</strong> {getLegalAreaLabel(selectedArea)}
      </p>
      <button
        onClick={clearArea}
        className="text-xs text-yellow-400 hover:text-yellow-200 underline font-medium"
      >
        Limpar filtro
      </button>
    </div>
  );
}
