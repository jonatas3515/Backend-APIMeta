export default function WhatsAppMetricsChart({ data, labels = [] }) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-xs text-nc-text-muted">Sem dados para exibir.</p>;
  }

  const entries = Object.entries(data);
  const maxValue = Math.max(...entries.map(([, v]) => v));
  const labelMap = labels.reduce((acc, l) => {
    acc[l.id] = l.label;
    return acc;
  }, {});

  return (
    <div className="space-y-2" role="img" aria-label="Gráfico de métricas de WhatsApp">
      {entries.map(([key, value]) => {
        const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
        return (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-nc-text-secondary">
              <span>{labelMap[key] || key}</span>
              <span>{value}</span>
            </div>
            <div className="w-full bg-nc-gray-100 rounded h-2" aria-hidden="true">
              <div
                className="bg-nc-primary h-2 rounded transition-all"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
