import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import AgendaPanel from './AgendaPanel';

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

export default function MonthlyCalendarPanel({ initialView = 'calendar' }) {
  const [activeSubView, setActiveSubView] = useState(initialView);
  const [cursor, setCursor] = useState(() => new Date());
  const [cases, setCases] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayTemplate, setBirthdayTemplate] = useState('Feliz aniversário, {nome}! 🎂');
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/cases'),
      supabase.from('conversations').select('id, client_name, phone, birth_or_foundation_date').not('birth_or_foundation_date', 'is', null),
      supabase.from('chat_clients').select('id, name, phone, birth_or_foundation_date').not('birth_or_foundation_date', 'is', null).then((r) => r).catch(() => ({ data: [] })),
      supabase.from('offices').select('*').limit(1).maybeSingle().then((r) => r).catch(() => ({ data: null }))
    ]).then(([casesR, bdaysR, chatR, officeR]) => {
      if (!mounted) return;
      if (casesR.status === 'fulfilled') setCases(casesR.value || []);
      const convBdays = (bdaysR.status === 'fulfilled' && !bdaysR.value.error) ? (bdaysR.value.data || []) : [];
      const chatBdays = (chatR.status === 'fulfilled' && !chatR.value.error)
        ? (chatR.value.data || []).map((c) => ({ ...c, client_name: c.client_name || c.name }))
        : [];
      setBirthdays([...convBdays, ...chatBdays]);
      if (officeR.status === 'fulfilled' && officeR.value?.data) {
        const tpl = officeR.value.data.birthday_message || officeR.value.data.birthday_message_template;
        if (tpl) setBirthdayTemplate(tpl);
      }
      [casesR, bdaysR, chatR, officeR].filter((r) => r.status === 'rejected')
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
  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now);
  };

  const handleMarcarCumprido = async (c) => {
    setCases((prev) => prev.filter((item) => item.id !== c.id));
    setFeedbackMsg(`Prazo "${c.title}" marcado como cumprido!`);
    setTimeout(() => setFeedbackMsg(null), 3000);
    try {
      await supabase.from('cases').update({ status: 'encerrado', updated_at: new Date().toISOString() }).eq('id', c.id);
    } catch (err) {
      safeError('calendar_cumprir_error', err, { component: 'MonthlyCalendarPanel' });
    }
  };

  return (
    <div className="p-4 md:p-6 bg-gray-900 text-white min-h-full" data-testid="monthly-calendar-panel">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Toggle Unificado Calendário & Agenda */}
        <div className="flex gap-2 border-b border-gray-750 pb-3">
          <button
            onClick={() => setActiveSubView('calendar')}
            className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition flex items-center gap-2 ${
              activeSubView === 'calendar'
                ? 'bg-yellow-500 text-black shadow-md'
                : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span>🗓️</span> Grade Mensal & Aniversariantes
          </button>
          <button
            onClick={() => setActiveSubView('agenda')}
            className={`px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition flex items-center gap-2 ${
              activeSubView === 'agenda'
                ? 'bg-yellow-500 text-black shadow-md'
                : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            <span>📋</span> Agenda & Prazos
          </button>
        </div>

        {activeSubView === 'agenda' ? (
          <div className="bg-gray-900 rounded-xl">
            <AgendaPanel />
          </div>
        ) : (
          <>
            {feedbackMsg && (
              <div className="p-3 rounded-lg bg-green-900/50 border border-green-700 text-green-300 text-sm">
                {feedbackMsg}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Grade mensal */}
          <div className="lg:col-span-3 bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4 bg-nc-black border-b-2 border-nc-yellow/40 text-white rounded-t-lg -m-5 mb-5 px-5 py-3">
              <h2 className="text-lg font-bold capitalize text-nc-yellow flex items-center gap-2">
                <span>📅</span> {MONTH_NAMES[month]} {year}
              </h2>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setCursor(new Date(year - 1, month, 1))} className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold" title="Ano anterior">«</button>
                <button onClick={prev} className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold" title="Mês anterior">‹</button>
                <button onClick={goToday} className="px-2.5 py-1 rounded bg-nc-yellow text-nc-black hover:opacity-90 text-xs font-bold">Hoje</button>
                <button onClick={next} className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold" title="Próximo mês">›</button>
                <button onClick={() => setCursor(new Date(year + 1, month, 1))} className="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs font-bold" title="Próximo ano">»</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-gray-400 mb-2 uppercase">
              {WEEK_DAYS.map((d) => <div key={d}>{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} className="min-h-[85px] bg-gray-850/40 rounded-lg border border-transparent" />;
                const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                const bdayKey = `${day.getMonth()}-${day.getDate()}`;
                const feriado = FERIADOS[`${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`];
                const dayCases = deadlinesByDay[key] || [];
                const dayBdays = birthdaysByDay[bdayKey] || [];
                const dayHonorarios = dayCases.filter((c) => Number(c.case_value) > 0);
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-[85px] p-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-nc-yellow bg-gray-750 ring-2 ring-nc-yellow'
                        : isToday
                        ? 'border-yellow-500/80 bg-yellow-950/20 ring-1 ring-yellow-500'
                        : feriado
                        ? 'border-red-900/60 bg-red-950/20'
                        : 'border-gray-700/80 bg-gray-800/80 hover:border-gray-500'
                    }`}
                    data-testid={isToday ? 'calendar-today' : undefined}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[11px] font-bold ${isToday ? 'text-nc-yellow' : feriado ? 'text-red-400 font-extrabold' : 'text-gray-300'}`}>
                        {day.getDate()}
                      </span>
                      {dayBdays.length > 0 && (
                        <span className="text-[9px] font-bold text-green-400">
                          ({dayBdays.length}) 🎂
                        </span>
                      )}
                    </div>

                    {feriado && (
                      <p className="text-[9px] text-red-400 font-semibold leading-tight line-clamp-1 mb-0.5" title={feriado}>
                        {feriado}
                      </p>
                    )}

                    {/* Chips do dia */}
                    <div className="space-y-0.5">
                      {dayCases.slice(0, 2).map((c) => (
                        <p
                          key={c.id}
                          className={`text-[9px] rounded px-1 truncate ${
                            Number(c.case_value) > 0
                              ? 'bg-purple-900/50 text-purple-200 border border-purple-700/60'
                              : 'bg-yellow-900/50 text-yellow-200 border border-yellow-700/60'
                          }`}
                          title={c.title}
                        >
                          {Number(c.case_value) > 0 ? '💰' : '⏰'} {c.title}
                        </p>
                      ))}
                      {dayCases.length > 2 && (
                        <p className="text-[8px] text-gray-400 text-center font-medium">+{dayCases.length - 2} mais</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feriados do mês */}
            {monthFeriados.length > 0 && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                <h4 className="text-xs font-bold text-red-300 mb-1 flex items-center gap-1">
                  <span>🇧🇷</span> Feriados Nacionais do Mês
                </h4>
                <ul className="text-[11px] text-red-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                  {monthFeriados.map((f) => (
                    <li key={f.day} className="flex items-center gap-1.5">
                      <span className="font-bold text-red-400">{f.day}:</span> {f.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Painel lateral: Agenda do dia selecionado */}
          <div className="space-y-4">
            {/* Aniversariantes */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow p-4">
              <h3 className="font-bold text-sm text-nc-yellow mb-3 flex items-center gap-2">
                <span>🎂</span> Aniversariantes - {selectedDay.toLocaleDateString('pt-BR')}
              </h3>
              {selectedBirthdays.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">Nenhum aniversariante neste dia.</p>
              ) : (
                <ul className="space-y-2.5">
                  {selectedBirthdays.map((b) => {
                    const phone = (b.phone || '').replace(/\D/g, '');
                    const msg = encodeURIComponent(birthdayTemplate.replace(/\{nome\}/g, b.client_name || 'Cliente'));
                    return (
                      <li key={b.id} className="text-xs text-gray-200 bg-gray-750 p-2.5 rounded-lg border border-gray-700 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{b.client_name || 'Cliente'}</span>
                          <span className="text-[10px] text-yellow-400">🎂 Aniversário</span>
                        </div>
                        {phone && (
                          <a
                            href={`https://wa.me/${phone}?text=${msg}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full text-center block text-[11px] px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white font-bold transition shadow"
                            data-testid={`whatsapp-btn-${b.id}`}
                          >
                            Enviar Parabéns via WhatsApp
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Prazos do dia selecionado */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow p-4">
              <h3 className="font-bold text-sm text-nc-yellow mb-3 flex items-center gap-2">
                <span>⏰</span> Prazos de {selectedDay.toLocaleDateString('pt-BR')}
              </h3>
              {selectedDeadlines.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">Nenhum prazo neste dia.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedDeadlines.map((c) => (
                    <li key={c.id} className="text-xs text-gray-200 bg-gray-750 p-2.5 rounded-lg border border-gray-700 flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">{c.title}</p>
                        {c.client_name && <p className="text-[11px] text-gray-400">Cliente: {c.client_name}</p>}
                        {Number(c.case_value) > 0 && (
                          <p className="text-[11px] font-bold text-yellow-400 mt-0.5">
                            💰 {Number(c.case_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleMarcarCumprido(c)}
                        className="text-[10px] px-2 py-1 rounded bg-green-600 hover:bg-green-700 text-white font-bold whitespace-nowrap"
                        title="Marcar como cumprido"
                      >
                        ✓ Cumprir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
