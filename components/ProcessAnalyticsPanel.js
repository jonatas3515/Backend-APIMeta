import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { safeError } from '../lib/safeLogger';

const STEP_LABELS = {
  conciliacao: 'Conciliação',
  instrucao: 'Instrução',
  sentenca: 'Sentença',
  recurso: 'Recurso',
  execucao: 'Execução',
  acordo: 'Acordo',
  outro: 'Outro'
};

function formatBRL(value) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function BarRow({ label, count, total }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProcessAnalyticsPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiJson('/api/cases/metrics')
      .then((data) => { if (mounted) setMetrics(data); })
      .catch((err) => safeError('process_metrics_error', err, { component: 'ProcessAnalyticsPanel' }))
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <p className="text-center text-sm text-gray-500 py-8">Carregando métricas...</p>;
  }

  if (!metrics) {
    return <p className="text-center text-sm text-gray-500 py-8">Não foi possível carregar as métricas.</p>;
  }

  const topCourt = Object.entries(metrics.by_court || {}).sort((a, b) => b[1] - a[1])[0];
  const topStep = Object.entries(metrics.by_procedural_step || {}).sort((a, b) => b[1] - a[1])[0];
  const courtTotal = Object.values(metrics.by_court || {}).reduce((a, b) => a + b, 0);
  const stepTotal = Object.values(metrics.by_procedural_step || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4" data-testid="process-analytics">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 bg-blue-50 rounded border border-blue-100">
          <p className="text-xs text-blue-600">Processos Ativos</p>
          <p className="text-xl font-bold text-blue-800" data-testid="kpi-total">{metrics.total}</p>
        </div>
        <div className="p-3 bg-green-50 rounded border border-green-100">
          <p className="text-xs text-green-600">Valor em Causas</p>
          <p className="text-xl font-bold text-green-800" data-testid="kpi-value">{formatBRL(metrics.case_value?.total)}</p>
        </div>
        <div className="p-3 bg-indigo-50 rounded border border-indigo-100">
          <p className="text-xs text-indigo-600">Tribunal Principal</p>
          <p className="text-xl font-bold text-indigo-800" data-testid="kpi-court">{topCourt && topCourt[1] > 0 ? topCourt[0] : '-'}</p>
        </div>
        <div className="p-3 bg-amber-50 rounded border border-amber-100">
          <p className="text-xs text-amber-600">Fase com Maior Volume</p>
          <p className="text-xl font-bold text-amber-800" data-testid="kpi-step">
            {topStep && topStep[1] > 0 ? (STEP_LABELS[topStep[0]] || topStep[0]) : '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Por Tribunal */}
        <div className="p-3 bg-white rounded border">
          <h4 className="font-semibold text-sm mb-3">Processos por Tribunal</h4>
          {courtTotal === 0 ? (
            <p className="text-xs text-gray-400">Nenhum processo com tribunal informado.</p>
          ) : (
            Object.entries(metrics.by_court).map(([court, count]) => (
              <BarRow key={court} label={court} count={count} total={courtTotal} />
            ))
          )}
        </div>

        {/* Por Fase */}
        <div className="p-3 bg-white rounded border">
          <h4 className="font-semibold text-sm mb-3">Processos por Fase</h4>
          {stepTotal === 0 ? (
            <p className="text-xs text-gray-400">Nenhum processo com fase informada.</p>
          ) : (
            Object.entries(metrics.by_procedural_step).map(([step, count]) => (
              <BarRow key={step} label={STEP_LABELS[step] || step} count={count} total={stepTotal} />
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-400">
        Média do valor da causa: {formatBRL(metrics.case_value?.average)} • Casos encerrados não entram no cálculo.
      </p>
    </div>
  );
}
