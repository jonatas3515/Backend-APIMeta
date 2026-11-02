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

function BarRow({ label, count, total, isMax = false }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs mb-1 font-medium">
        <span className={isMax ? 'text-yellow-400 font-bold flex items-center gap-1.5' : 'text-gray-300'}>
          {isMax && <span className="text-[11px] text-yellow-400">👑</span>}
          {label}
        </span>
        <span className={isMax ? 'text-yellow-400 font-bold' : 'text-gray-400'}>
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2.5 bg-gray-800/90 rounded-full overflow-hidden border border-gray-700/50">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isMax
              ? 'bg-[#E6B21A] shadow-sm shadow-yellow-500/30'
              : 'bg-slate-600/70'
          }`}
          style={{ width: `${pct}%` }}
        />
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

  const maxCourtCount = Math.max(0, ...Object.values(metrics.by_court || {}));
  const maxStepCount = Math.max(0, ...Object.values(metrics.by_procedural_step || {}));

  return (
    <div className="space-y-4" data-testid="process-analytics">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[#1E2022] rounded-xl border border-gray-800 hover:border-gray-700 transition">
          <p className="text-xs text-gray-400">Processos Ativos</p>
          <p className="text-xl font-bold text-white mt-0.5" data-testid="kpi-total">{metrics.total}</p>
        </div>
        <div className="p-3.5 bg-[#1E2022] rounded-xl border border-green-500/20 hover:border-green-500/40 transition">
          <p className="text-xs text-green-400/90 font-medium">Valor em Causas</p>
          <p className="text-xl font-black text-green-400 mt-0.5" data-testid="kpi-value">{formatBRL(metrics.case_value?.total)}</p>
        </div>
        <div className="p-3.5 bg-[#1E2022] rounded-xl border border-gray-800 hover:border-yellow-500/30 transition">
          <p className="text-xs text-gray-400">Tribunal Principal</p>
          <p className="text-xl font-bold text-yellow-400 mt-0.5 truncate" data-testid="kpi-court">{topCourt && topCourt[1] > 0 ? topCourt[0] : '-'}</p>
        </div>
        <div className="p-3.5 bg-[#1E2022] rounded-xl border border-gray-800 hover:border-yellow-500/30 transition">
          <p className="text-xs text-gray-400">Fase com Maior Volume</p>
          <p className="text-xl font-bold text-yellow-400 mt-0.5 truncate" data-testid="kpi-step">
            {topStep && topStep[1] > 0 ? (STEP_LABELS[topStep[0]] || topStep[0]) : '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Por Tribunal */}
        <div className="p-4 bg-[#1E2022] rounded-xl border border-gray-800">
          <h4 className="font-bold text-sm text-white mb-3 flex items-center justify-between">
            <span>Processos por Tribunal</span>
            <span className="text-[11px] text-gray-400 font-normal">Total: {courtTotal}</span>
          </h4>
          {courtTotal === 0 ? (
            <p className="text-xs text-gray-500 py-3">Nenhum processo com tribunal informado.</p>
          ) : (
            Object.entries(metrics.by_court).map(([court, count]) => (
              <BarRow
                key={court}
                label={court}
                count={count}
                total={courtTotal}
                isMax={maxCourtCount > 0 && count === maxCourtCount}
              />
            ))
          )}
        </div>

        {/* Por Fase */}
        <div className="p-4 bg-[#1E2022] rounded-xl border border-gray-800">
          <h4 className="font-bold text-sm text-white mb-3 flex items-center justify-between">
            <span>Processos por Fase</span>
            <span className="text-[11px] text-gray-400 font-normal">Total: {stepTotal}</span>
          </h4>
          {stepTotal === 0 ? (
            <p className="text-xs text-gray-500 py-3">Nenhum processo com fase informada.</p>
          ) : (
            Object.entries(metrics.by_procedural_step).map(([step, count]) => (
              <BarRow
                key={step}
                label={STEP_LABELS[step] || step}
                count={count}
                total={stepTotal}
                isMax={maxStepCount > 0 && count === maxStepCount}
              />
            ))
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        Média do valor da causa: {formatBRL(metrics.case_value?.average)} • Casos encerrados não entram no cálculo.
      </p>
    </div>
  );
}
