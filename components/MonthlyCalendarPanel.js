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
const WEEK_DAYS = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

export default function MonthlyCalendarPanel() {
  const [cursor, setCursor] = useState(() => new Date());
  const [cases, setCases] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/cases'),
      supabase.from('conversations').select('id, client_name, phone, birth_or_foundation_date').not('birth_or_foundation_date', 'is', null)
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
  const selectedKey = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
  const monthFeriados = Object.entries(FERIADOS)
    .filter(([mm]) => Number(mm.slice(0, 2)) === month + 1)
    .map(([mm, name]) => ({ day: mm.slice(3, 5).replace(/^0/, ''), name }));
  const selectedBirthdays = birthdaysByDay[`${selectedDay.getMonth()}-${selectedDay.getDate()}`] || [];
  const selectedDeadlines = deadlinesByDay[selectedKey] || [];

  const prev = () => setCursor(new Date(year, month - 1, 1));
  const next = () => setCursor(new Date(year, month + 1, 1));

  return (
    <div className="p-4 md:p-6" data-testid="monthly-calendar-panel">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Grade mensal */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4 bg-[#1e293b] text-white rounded-t-lg -m-4 mb-4 px-4 py-3">
            <h2 className="text-lg font-bold capitalize">
              {MONTH_NAMES[month]} {year}
            </h2>
            <div className="flex gap-1">
              <button onClick={() => setCursor(new Date(year - 1, month, 1))} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs">«</button>
              <button onClick={prev} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs">‹</button>
              <button onClick={next} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs">›</button>
              <button onClick={() => setCursor(new Date(year + 1, month, 1))} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs">»</button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-500 mb-1 uppercase">
            {WEEK_DAYS.map((d) => <div key={d}>{d.toUpperCase()}</div>)}
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
                  onClick={() => setSelectedDay(day)}
                  className={`min-h-[70px] p-1 rounded border text-xs cursor-pointer ${
                    isToday ? 'border-nc-yellow bg-yellow-50 ring-1 ring-nc-yellow' : feriado ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white'
                  }`}
                  data-testid={isToday ? 'calendar-today' : undefined}
                >
                  <span className={`text-[11px] font-bold ${isToday ? 'text-nc-black' : feriado ? 'text-red-700' : 'text-gray-600'}`}>{day.getDate()}</span>
                  {feriado && <p className="text-[9px] text-red-700 font-bold leading-tight" title={feriado}>{feriado}</p>}
                  {(birthdaysByDay[`${day.getMonth()}-${day.getDate()}`] || []).length > 0 && (
                    <p className="text-[9px] mt-0.5">
                      🎂 <span className="px-1 rounded bg-green-500 text-white text-[8px] font-bold">({birthdaysByDay[`${day.getMonth()}-${day.getDate()}`].length})</span>
                    </p>
                  )}
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

          {/* Feriados do mes */}
          {monthFeriados.length > 0 && (
            <div className="mt-3 p-3 bg-red-900/20 border border-red-800 rounded-lg">
              <h4 className="text-xs font-bold text-red-300 mb-1">🇧🇷 Feriados do mês</h4>
              <ul className="text-[11px] text-red-200 space-y-0.5">
                {monthFeriados.map((f) => (
                  <li key={f.day}>{f.day} - {f.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow p-4">
            <h3 className="font-bold text-sm text-white mb-3">🎂 Aniversariantes - {selectedDay.toLocaleDateString('pt-BR')}</h3>
            {selectedBirthdays.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum aniversariante neste dia.</p>
            ) : (
              <ul className="space-y-2">
                {selectedBirthdays.map((b) => {
                  const phone = (b.phone || '').replace(/\D/g, '');
                  const msg = encodeURIComponent(`Feliz aniversário, ${b.client_name || 'Cliente'}! 🎂`);
                  return (
                    <li key={b.id} className="text-sm text-gray-200 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><span className="text-pink-400">🎂</span> {b.client_name || 'Cliente'}</span>
                      {phone && (
                        <a
                          href={`https://wa.me/${phone}?text=${msg}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] px-2 py-1 rounded bg-green-500 hover:bg-green-600 text-white font-bold whitespace-nowrap"
                          data-testid={`whatsapp-btn-${b.id}`}
                        >
                          Enviar WhatsApp
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow p-4">
            <h3 className="font-bold text-sm text-white mb-3">⏰ Prazos de {selectedDay.toLocaleDateString('pt-BR')}</h3>
            {selectedDeadlines.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum prazo neste dia.</p>
            ) : (
              <ul className="space-y-2">
                {selectedDeadlines.map((c) => (
                  <li key={c.id} className="text-sm text-gray-200">⚖️ {c.title}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
