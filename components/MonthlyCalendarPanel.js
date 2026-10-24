import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const FERIADOS = {
  '01-01': 'Confraternização Universal',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalhador',
  '09-07': 'Independência do Brasil',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Consciência Negra',
  '12-25': 'Natal'
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK_DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

export default function MonthlyCalendarPanel() {
  const [cursor, setCursor] = useState(() => new Date());
  const [cases, setCases] = useState([]);
  const [birthdays, setBirthdays] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/cases'),
      supabase.from('conversations').select('id, client_name, birth_or_foundation_date').not('birth_or_foundation_date', 'is', null)
    ]).then(([casesR, bdaysR]) => {
      if (!mounted) return;
      if (casesR.status === 'fulfilled') setCases(casesR.value || []);
      if (bdaysR.status === 'fulfilled' && !bdaysR.value.error) setBirthdays(bdaysR.value.data || []);
      [casesR, bdaysR].filter((r) => r.status === 'rejected')
        .forEach((r) => safeError('calendar_load_error', r.reason, { component: 'MonthlyCalendarPanel' }));
    });
    return () => { mounted = false; };
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < startOffset; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
    return grid;
  }, [year, month]);

  const deadlinesByDay = useMemo(() => {
    const map = {};
    cases.forEach((c) => {
      if (!c.deadline_date || c.status === 'encerrado') return;
      const d = new Date(c.deadline_date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] = map[key] || []).push(c);
    });
    return map;
  }, [cases]);

  const birthdaysByDay = useMemo(() => {
    const map = {};
    birthdays.forEach((b) => {
      if (!b.birth_or_foundation_date) return;
      const d = new Date(b.birth_or_foundation_date);
      const key = `${d.getMonth()}-${d.getDate()}`;
      (map[key] = map[key] || []).push(b);
    });
    return map;
  }, [birthdays]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const todayBirthdays = birthdaysByDay[`${today.getMonth()}-${today.getDate()}`] || [];

  const prev = () => setCursor(new Date(year, month - 1, 1));
  const next = () => setCursor(new Date(year, month + 1, 1));

  return (
    <div className="p-4 md:p-6" data-testid="monthly-calendar-panel">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Grade mensal */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              🗓️ {MONTH_NAMES[month]} {year}
            </h2>
            <div className="flex gap-2">
              <button onClick={prev} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm">←</button>
              <button onClick={() => setCursor(new Date())} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm">Hoje</button>
              <button onClick={next} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm">→</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-500 mb-1">
            {WEEK_DAYS.map((d) => <div key={d}>{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (!day) return <div key={`e-${idx}`} className="min-h-[70px]" />;
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
              const feriado = FERIADOS[`${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`];
              const dayCases = deadlinesByDay[key] || [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={`min-h-[70px] p-1 rounded border text-xs ${
                    isToday ? 'border-nc-yellow bg-yellow-50 ring-1 ring-nc-yellow' : feriado ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white'
                  }`}
                  data-testid={isToday ? 'calendar-today' : undefined}
                >
                  <span className={`text-[11px] font-bold ${isToday ? 'text-nc-black' : 'text-gray-600'}`}>{day.getDate()}</span>
                  {feriado && <p className="text-[9px] text-red-500 font-medium leading-tight" title={feriado}>🇧🇷 {feriado}</p>}
                  {dayCases.slice(0, 2).map((c) => (
                    <p key={c.id} className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 truncate mt-0.5" title={c.title}>
                      ⏰ {c.title}
                    </p>
                  ))}
                  {dayCases.length > 2 && <p className="text-[9px] text-gray-400">+{dayCases.length - 2} mais</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-sm text-gray-800 mb-3">🎂 Aniversariantes de Hoje</h3>
            {todayBirthdays.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum aniversariante hoje.</p>
            ) : (
              <ul className="space-y-2">
                {todayBirthdays.map((b) => (
                  <li key={b.id} className="text-sm text-gray-800 flex items-center gap-2">
                    <span className="text-pink-500">🎂</span> {b.client_name || 'Cliente'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-bold text-sm text-gray-800 mb-3">⏰ Prazos de Hoje</h3>
            {(deadlinesByDay[todayKey] || []).length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum prazo hoje.</p>
            ) : (
              <ul className="space-y-2">
                {deadlinesByDay[todayKey].map((c) => (
                  <li key={c.id} className="text-sm text-gray-800">⚖️ {c.title}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
