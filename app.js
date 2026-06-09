/**
 * ════════════════════════════════════════════
 * TimeControl — app.js
 * Control horario completo con Supabase
 * ════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────
   ESTADO GLOBAL
───────────────────────────────────────────── */
const State = {
  user:         null,   // Objeto de usuario de Supabase Auth
  profile:      null,   // Fila de public.profiles
  activeEntry:  null,   // Fichaje abierto (sin check_out)
  elapsedTimer: null,   // setInterval del cronómetro
  clockTimer:   null,   // setInterval del reloj
};

/* ─────────────────────────────────────────────
   REFERENCIAS DOM
───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const DOM = {
  // Screens
  authScreen:    $('auth-screen'),
  appScreen:     $('app-screen'),

  // Auth
  loginForm:     $('login-form'),
  loginEmail:    $('login-email'),
  loginPass:     $('login-password'),
  loginError:    $('login-error'),
  logoutBtn:     $('logout-btn'),
  settingsBtn:   $('settings-btn'),

  // Header
  headerUsername: $('header-username'),

  // Nav
  navBtns:       document.querySelectorAll('.nav-btn'),

  // Dashboard
  statusDot:     $('status-dot'),
  statusLabel:   $('status-label'),
  statusTime:    $('status-time'),
  statusElapsed: $('status-elapsed'),
  checkinBtn:    $('checkin-btn'),
  checkoutBtn:   $('checkout-btn'),
  todayCheckin:  $('today-checkin'),
  todayCheckout: $('today-checkout'),
  todayWorked:   $('today-worked'),
  todayGoal:     $('today-goal'),
  weekBadge:     $('week-badge'),
  weekBar:       $('week-bar'),
  weekWorked:    $('week-worked'),
  weekGoal:      $('week-goal'),
  monthBadge:    $('month-badge'),
  monthBar:      $('month-bar'),
  monthWorked:   $('month-worked'),
  monthGoal:     $('month-goal'),

  // History
  historyFilterMonth: $('history-filter-month'),
  historyList:        $('history-list'),

  // Stats
  statTotalDays:  $('stat-total-days'),
  statAvgHours:   $('stat-avg-hours'),
  statOvertime:   $('stat-overtime'),
  statPunctuality:$('stat-punctuality'),
  barChart:       $('bar-chart'),

  // Settings modal
  settingsModal:  $('settings-modal'),
  settingsClose:  $('settings-close'),
  settingsForm:   $('settings-form'),
  setName:        $('set-name'),
  setPosition:    $('set-position'),
  setDailyHours:  $('set-daily-hours'),
  setWorkDays:    $('set-work-days'),
  setTimezone:    $('set-timezone'),
  settingsMsg:    $('settings-msg'),

  toast: $('toast'),
};

/* ─────────────────────────────────────────────
   HELPERS DE UI
───────────────────────────────────────────── */

/** Muestra un toast durante `ms` milisegundos */
let toastTimeout;
function showToast(msg, type = 'default', ms = 3000) {
  clearTimeout(toastTimeout);
  DOM.toast.textContent = msg;
  DOM.toast.className = `toast toast-${type}`;
  DOM.toast.classList.remove('hidden');
  toastTimeout = setTimeout(() => DOM.toast.classList.add('hidden'), ms);
}

/** Muestra/oculta mensaje de error en un elemento */
function setMsg(el, msg, type = 'error') {
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.className = type === 'error' ? 'form-error' : 'form-success';
}

/** Formatea una fecha como HH:MM */
function fmt_time(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** Formatea duración en minutos → "Xh Ym" */
function fmt_duration(minutes) {
  if (minutes == null || isNaN(minutes)) return '—';
  const sign = minutes < 0 ? '-' : '';
  const abs  = Math.abs(Math.round(minutes));
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  return `${sign}${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Diferencia en minutos entre dos fechas */
function diff_minutes(a, b) {
  return (new Date(b) - new Date(a)) / 60000;
}

/** Retorna inicio del día local (00:00:00) como Date */
function start_of_day(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Retorna inicio de la semana (lunes) */
function start_of_week(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dom
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Retorna inicio del mes */
function start_of_month(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Calcula días laborables entre dos fechas */
function working_days_between(start, end, workDaysPerWeek = 5) {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay(); // 0=dom, 6=sab
    if (workDaysPerWeek === 5 && dow !== 0 && dow !== 6) count++;
    else if (workDaysPerWeek === 6 && dow !== 0) count++;
    else if (workDaysPerWeek === 4 && dow >= 1 && dow <= 4) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/* ─────────────────────────────────────────────
   SUPABASE SHORTHAND
───────────────────────────────────────────── */
const sb = () => window._supabase;

/* ─────────────────────────────────────────────
   AUTENTICACIÓN
───────────────────────────────────────────── */

/** Muestra la pantalla correcta según si hay sesión */
function show_screen(screen) {
  DOM.authScreen.classList.toggle('active', screen === 'auth');
  DOM.appScreen.classList.toggle('active', screen === 'app');
}

/** Inicializa la app: comprueba si hay sesión activa */
async function init() {
  // Escuchar cambios de sesión
  sb().auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      State.user = session.user;
      await load_profile();
      show_screen('app');
      await refresh_dashboard();
      start_clock();
    } else {
      State.user   = null;
      State.profile = null;
      clearInterval(State.elapsedTimer);
      clearInterval(State.clockTimer);
      show_screen('auth');
    }
  });

  // Comprobar sesión existente
  const { data: { session } } = await sb().auth.getSession();
  if (!session) show_screen('auth');
}

/** Carga el perfil del usuario desde public.profiles */
async function load_profile() {
  const { data, error } = await sb()
    .from('profiles')
    .select('*')
    .eq('id', State.user.id)
    .single();

  if (error && error.code === 'PGRST116') {
    // Perfil no existe aún → crear uno por defecto
    const { data: newProfile } = await sb()
      .from('profiles')
      .insert({ id: State.user.id, full_name: State.user.user_metadata?.full_name || '', daily_hours: 8 })
      .select()
      .single();
    State.profile = newProfile;
  } else {
    State.profile = data;
  }

  // Actualizar UI
  const name = State.profile?.full_name || State.user.email;
  DOM.headerUsername.textContent = name;
}

/** Login */
DOM.loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  setMsg(DOM.loginError, '');
  const btn = DOM.loginForm.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  const { data, error } = await sb().auth.signInWithPassword({
    email:    DOM.loginEmail.value.trim(),
    password: DOM.loginPass.value,
  });

  btn.disabled = false;
  btn.textContent = 'Entrar';

  if (error) {
    // Mensajes de error en español según el tipo
    const msgs = {
      'Invalid login credentials':     'Email o contraseña incorrectos',
      'Email not confirmed':            'El email no está confirmado. Ve a Supabase → Authentication → Users y confirma el usuario manualmente.',
      'Too many requests':              'Demasiados intentos. Espera unos minutos.',
    };
    const msg = msgs[error.message] || error.message;
    setMsg(DOM.loginError, msg);
    return;
  }

  // Login correcto — onAuthStateChange se encarga del resto
});

/** Logout */
DOM.logoutBtn.addEventListener('click', async () => {
  await sb().auth.signOut();
});

/* ─────────────────────────────────────────────
   NAVEGACIÓN ENTRE VISTAS
───────────────────────────────────────────── */
DOM.navBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    const view = btn.dataset.view;
    DOM.navBtns.forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${view}`);
    });
    if (view === 'history') await render_history();
    if (view === 'stats')   await render_stats();
  });
});

/* ─────────────────────────────────────────────
   RELOJ EN VIVO
───────────────────────────────────────────── */
function start_clock() {
  clearInterval(State.clockTimer);
  const tick = () => {
    const now = new Date();
    DOM.statusTime.textContent = now.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  tick();
  State.clockTimer = setInterval(tick, 1000);
}

/** Inicia el cronómetro de tiempo transcurrido */
function start_elapsed_timer(checkInDate) {
  clearInterval(State.elapsedTimer);
  const update = () => {
    const mins = diff_minutes(checkInDate, new Date());
    DOM.statusElapsed.textContent = `Llevas ${fmt_duration(mins)}`;
  };
  update();
  State.elapsedTimer = setInterval(update, 1000);
}

/* ─────────────────────────────────────────────
   FICHAJE — LÓGICA PRINCIPAL
───────────────────────────────────────────── */

/** Obtiene el fichaje activo (sin check_out) del usuario */
async function get_active_entry() {
  const { data, error } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .is('check_out', null)
    .order('check_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error('Error obteniendo entrada activa:', error);
  return data || null;
}

/** Actualiza botones e indicadores de estado */
function update_status_ui(isWorking) {
  DOM.statusDot.className   = `status-dot ${isWorking ? 'working' : 'off'}`;
  DOM.statusLabel.textContent = isWorking ? 'Trabajando' : 'Fuera';
  DOM.checkinBtn.disabled  = isWorking;   // No puede fichar si ya está dentro
  DOM.checkoutBtn.disabled = !isWorking;  // No puede salir si no entró
}

/** Fichar Entrada */
DOM.checkinBtn.addEventListener('click', async () => {
  if (State.activeEntry) {
    showToast('Ya tienes una entrada activa sin cerrar', 'error');
    return;
  }
  DOM.checkinBtn.disabled = true;
  DOM.checkinBtn.innerHTML = `<span class="spinner"></span><span class="clock-btn-label">Fichando...</span>`;

  const now = new Date().toISOString();
  const { data, error } = await sb()
    .from('time_entries')
    .insert({ user_id: State.user.id, check_in: now })
    .select()
    .single();

  if (error) {
    showToast('Error al fichar entrada: ' + error.message, 'error');
    DOM.checkinBtn.innerHTML = `<span class="clock-btn-icon">▶</span><span class="clock-btn-label">Fichar Entrada</span><span class="clock-btn-sub">Registrar inicio de jornada</span>`;
    DOM.checkinBtn.disabled = false;
  } else {
    State.activeEntry = data;
    update_status_ui(true);
    start_elapsed_timer(data.check_in);
    DOM.todayCheckin.textContent = fmt_time(data.check_in);
    showToast('✓ Entrada registrada a las ' + fmt_time(now), 'success');
    DOM.checkinBtn.innerHTML = `<span class="clock-btn-icon">▶</span><span class="clock-btn-label">Fichar Entrada</span><span class="clock-btn-sub">Registrar inicio de jornada</span>`;
    await refresh_balance();
  }
});

/** Fichar Salida */
DOM.checkoutBtn.addEventListener('click', async () => {
  if (!State.activeEntry) {
    showToast('No tienes una entrada activa', 'error');
    return;
  }
  DOM.checkoutBtn.disabled = true;
  DOM.checkoutBtn.innerHTML = `<span class="spinner"></span><span class="clock-btn-label">Fichando...</span>`;

  const now = new Date().toISOString();
  const { data, error } = await sb()
    .from('time_entries')
    .update({ check_out: now })
    .eq('id', State.activeEntry.id)
    .eq('user_id', State.user.id)
    .select()
    .single();

  DOM.checkoutBtn.innerHTML = `<span class="clock-btn-icon">■</span><span class="clock-btn-label">Fichar Salida</span><span class="clock-btn-sub">Registrar fin de jornada</span>`;

  if (error) {
    showToast('Error al fichar salida: ' + error.message, 'error');
    DOM.checkoutBtn.disabled = false;
  } else {
    State.activeEntry = null;
    clearInterval(State.elapsedTimer);
    DOM.statusElapsed.textContent = '';
    update_status_ui(false);
    const mins = diff_minutes(data.check_in, data.check_out);
    DOM.todayCheckout.textContent = fmt_time(now);
    DOM.todayWorked.textContent   = fmt_duration(mins);
    showToast('✓ Salida registrada. Trabajaste ' + fmt_duration(mins), 'success');
    await refresh_balance();
  }
});

/* ─────────────────────────────────────────────
   REFRESH DASHBOARD
───────────────────────────────────────────── */

/** Carga el resumen de hoy y balances */
async function refresh_dashboard() {
  // Cargar entrada activa
  State.activeEntry = await get_active_entry();
  update_status_ui(!!State.activeEntry);
  DOM.checkinBtn.disabled  = !!State.activeEntry;
  DOM.checkoutBtn.disabled = !State.activeEntry;

  if (State.activeEntry) {
    start_elapsed_timer(State.activeEntry.check_in);
    DOM.todayCheckin.textContent = fmt_time(State.activeEntry.check_in);
  }

  // Cargar datos de hoy
  const todayStart = start_of_day().toISOString();
  const { data: todayEntries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', todayStart)
    .order('check_in', { ascending: true });

  const profile = State.profile || {};
  const dailyH  = parseFloat(profile.daily_hours) || 8;

  DOM.todayGoal.textContent = `${dailyH}h`;

  if (todayEntries?.length) {
    const first = todayEntries[0];
    const last  = todayEntries[todayEntries.length - 1];

    if (!State.activeEntry) {
      DOM.todayCheckin.textContent  = fmt_time(first.check_in);
      DOM.todayCheckout.textContent = fmt_time(last.check_out);
    } else {
      DOM.todayCheckin.textContent  = fmt_time(first.check_in);
    }

    // Calcular total hoy (suma de entradas completas + la activa hasta ahora)
    let totalMins = 0;
    for (const e of todayEntries) {
      const out = e.check_out || new Date().toISOString();
      totalMins += diff_minutes(e.check_in, out);
    }
    DOM.todayWorked.textContent = fmt_duration(totalMins);
  }

  await refresh_balance();
}

/** Refresca las tarjetas de balance semana/mes */
async function refresh_balance() {
  const profile  = State.profile || {};
  const dailyH   = parseFloat(profile.daily_hours) || 8;
  const workDays = parseInt(profile.work_days) || 5;

  const weekStart  = start_of_week();
  const monthStart = start_of_month();
  const now        = new Date();

  // Obtener todas las entradas de este mes
  const { data: entries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', monthStart.toISOString())
    .order('check_in', { ascending: true });

  if (!entries) return;

  // Calcular horas trabajadas en semana y mes
  let weekMins = 0, monthMins = 0;
  for (const e of entries) {
    const out     = e.check_out ? new Date(e.check_out) : now;
    const checkIn = new Date(e.check_in);
    const mins    = diff_minutes(checkIn, out);

    monthMins += mins;
    if (checkIn >= weekStart) weekMins += mins;
  }

  // Calcular objetivos
  const weekWorkDays  = working_days_between(weekStart, now, workDays);
  const monthWorkDays = working_days_between(monthStart, now, workDays);

  const weekGoalMins  = weekWorkDays  * dailyH * 60;
  const monthGoalMins = monthWorkDays * dailyH * 60;

  const weekDiff  = weekMins  - weekGoalMins;
  const monthDiff = monthMins - monthGoalMins;

  // Render semana
  render_balance_card({
    worked: weekMins, goal: weekGoalMins, diff: weekDiff,
    workedEl: DOM.weekWorked, goalEl: DOM.weekGoal,
    badgeEl: DOM.weekBadge, barEl: DOM.weekBar,
  });

  // Render mes
  render_balance_card({
    worked: monthMins, goal: monthGoalMins, diff: monthDiff,
    workedEl: DOM.monthWorked, goalEl: DOM.monthGoal,
    badgeEl: DOM.monthBadge, barEl: DOM.monthBar,
  });
}

/** Pinta una tarjeta de balance */
function render_balance_card({ worked, goal, diff, workedEl, goalEl, badgeEl, barEl }) {
  const pct = goal > 0 ? Math.min((worked / goal) * 100, 130) : 0;

  workedEl.textContent = `${(worked / 60).toFixed(1)}h trabajadas`;
  goalEl.textContent   = `${(goal  / 60).toFixed(1)}h objetivo`;

  // Porcentaje de barra (cap 100%)
  barEl.style.width = Math.min(pct, 100) + '%';

  if (diff >= 0) {
    badgeEl.textContent = `+${fmt_duration(diff)}`;
    badgeEl.className   = 'balance-badge positive';
    barEl.className     = pct > 100 ? 'balance-bar-fill over' : 'balance-bar-fill';
  } else {
    badgeEl.textContent = fmt_duration(diff);
    badgeEl.className   = 'balance-badge negative';
    barEl.className     = 'balance-bar-fill under';
  }
}

/* ─────────────────────────────────────────────
   HISTORIAL
───────────────────────────────────────────── */

/** Rellena el selector de mes */
function populate_month_filter() {
  const now = new Date();
  DOM.historyFilterMonth.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement('option');
    opt.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opt.textContent = d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
    DOM.historyFilterMonth.appendChild(opt);
  }
}

DOM.historyFilterMonth.addEventListener('change', render_history);

async function render_history() {
  const val  = DOM.historyFilterMonth.value;
  const [y, m] = val.split('-').map(Number);
  const start  = new Date(y, m - 1, 1).toISOString();
  const end    = new Date(y, m, 0, 23, 59, 59).toISOString();

  DOM.historyList.innerHTML = '<div class="empty-state">Cargando...</div>';

  const { data: entries, error } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', start)
    .lte('check_in', end)
    .order('check_in', { ascending: false });

  if (error || !entries?.length) {
    DOM.historyList.innerHTML = '<div class="empty-state">No hay fichajes en este período</div>';
    return;
  }

  const profile   = State.profile || {};
  const dailyMins = (parseFloat(profile.daily_hours) || 8) * 60;
  const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  DOM.historyList.innerHTML = '';
  for (const e of entries) {
    const d   = new Date(e.check_in);
    const out = e.check_out ? new Date(e.check_out) : null;
    const mins = out ? diff_minutes(e.check_in, e.check_out) : null;
    const diff = mins != null ? mins - dailyMins : null;
    const isActive = !e.check_out;

    const item = document.createElement('div');
    item.className = `history-item ${isActive ? 'active-entry' : (out ? 'complete' : 'incomplete')}`;

    item.innerHTML = `
      <div class="history-date">
        <div class="history-day">${d.getDate()}</div>
        <div class="history-weekday">${DAYS_ES[d.getDay()]}</div>
      </div>
      <div class="history-times">
        <div class="history-time-row">
          <span class="time-icon">▶</span>
          <span class="time-val">${fmt_time(e.check_in)}</span>
          <span class="time-label">entrada</span>
        </div>
        <div class="history-time-row">
          <span class="time-icon">■</span>
          <span class="time-val">${isActive ? '<em style="opacity:.5">activo</em>' : fmt_time(e.check_out)}</span>
          <span class="time-label">salida</span>
        </div>
      </div>
      <div class="history-total">
        <div class="history-hours">${mins != null ? fmt_duration(mins) : '—'}</div>
        ${diff != null ? `<div class="history-balance ${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '+' : ''}${fmt_duration(diff)}</div>` : ''}
      </div>
    `;

    DOM.historyList.appendChild(item);
  }
}

/* ─────────────────────────────────────────────
   ESTADÍSTICAS
───────────────────────────────────────────── */
async function render_stats() {
  const monthStart = start_of_month();
  const profile    = State.profile || {};
  const dailyH     = parseFloat(profile.daily_hours) || 8;
  const workDays   = parseInt(profile.work_days) || 5;

  // Últimas 2 semanas para el gráfico
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 13);
  twoWeeksAgo.setHours(0, 0, 0, 0);

  const { data: monthEntries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', monthStart.toISOString())
    .not('check_out', 'is', null)
    .order('check_in', { ascending: true });

  if (!monthEntries) return;

  // Agrupar por día
  const byDay = {};
  for (const e of monthEntries) {
    const key = new Date(e.check_in).toLocaleDateString('es-ES');
    if (!byDay[key]) byDay[key] = 0;
    byDay[key] += diff_minutes(e.check_in, e.check_out);
  }

  const days      = Object.keys(byDay);
  const totalDays = days.length;
  const avgMins   = totalDays > 0
    ? Object.values(byDay).reduce((a, b) => a + b, 0) / totalDays
    : 0;

  // Balance del mes
  const now           = new Date();
  const monthWorkDays = working_days_between(monthStart, now, workDays);
  const monthGoalMins = monthWorkDays * dailyH * 60;
  const monthMins     = Object.values(byDay).reduce((a, b) => a + b, 0);
  const diffMins      = monthMins - monthGoalMins;

  // Días a tiempo (>= 95% de la jornada)
  const onTime = Object.values(byDay).filter(m => m >= dailyH * 60 * 0.95).length;

  // Render stats
  DOM.statTotalDays.textContent    = totalDays;
  DOM.statAvgHours.textContent     = `${(avgMins / 60).toFixed(1)}h`;
  DOM.statOvertime.textContent     = (diffMins >= 0 ? '+' : '') + fmt_duration(diffMins);
  DOM.statOvertime.style.color     = diffMins >= 0 ? 'var(--green-dim)' : 'var(--red-dim)';
  DOM.statPunctuality.textContent  = `${onTime}/${totalDays}`;

  // Render gráfico de barras (últimas 2 semanas)
  render_bar_chart(twoWeeksAgo, dailyH);
}

/** Renderiza el gráfico de barras de las últimas 2 semanas */
async function render_bar_chart(fromDate, dailyH) {
  const { data: entries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', fromDate.toISOString())
    .not('check_out', 'is', null);

  const byDay = {};
  const today = start_of_day();

  // Preparar últimos 14 días
  for (let i = 0; i < 14; i++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + i);
    const key = d.toLocaleDateString('es-ES');
    byDay[key] = { date: new Date(d), mins: 0 };
  }

  for (const e of (entries || [])) {
    const key = new Date(e.check_in).toLocaleDateString('es-ES');
    if (byDay[key]) byDay[key].mins += diff_minutes(e.check_in, e.check_out);
  }

  const cols     = Object.values(byDay);
  const maxMins  = Math.max(...cols.map(c => c.mins), dailyH * 60);
  const DAYS_ES  = ['D','L','M','X','J','V','S'];

  DOM.barChart.innerHTML = '';
  for (const col of cols) {
    const pct      = (col.mins / maxMins) * 100;
    const isToday  = col.date.toLocaleDateString('es-ES') === today.toLocaleDateString('es-ES');
    const isOver   = col.mins > dailyH * 60 * 1.05;
    const dow      = DAYS_ES[col.date.getDay()];
    const hours    = col.mins > 0 ? (col.mins / 60).toFixed(1) : '';

    const colEl = document.createElement('div');
    colEl.className = 'bar-col';
    colEl.innerHTML = `
      <div class="bar-label-h">${hours}</div>
      <div class="bar-wrap">
        <div class="bar-fill ${isToday ? 'today' : isOver ? 'over' : ''}"
             style="height:${pct}%"></div>
      </div>
      <div class="bar-label-day">${dow}</div>
    `;
    DOM.barChart.appendChild(colEl);
  }
}

/* ─────────────────────────────────────────────
   CONFIGURACIÓN
───────────────────────────────────────────── */

/** Abre el modal de configuración y precarga los valores */
DOM.settingsBtn.addEventListener('click', () => {
  if (!State.profile) return;
  DOM.setName.value       = State.profile.full_name || '';
  DOM.setPosition.value   = State.profile.position  || '';
  DOM.setDailyHours.value = State.profile.daily_hours || 8;
  DOM.setWorkDays.value   = State.profile.work_days   || 5;
  DOM.setTimezone.value   = State.profile.timezone    || 'Europe/Madrid';
  setMsg(DOM.settingsMsg, '');
  DOM.settingsModal.classList.remove('hidden');
});

DOM.settingsClose.addEventListener('click', () => {
  DOM.settingsModal.classList.add('hidden');
});

// Cerrar al hacer click fuera
DOM.settingsModal.addEventListener('click', e => {
  if (e.target === DOM.settingsModal) DOM.settingsModal.classList.add('hidden');
});

/** Guardar configuración */
DOM.settingsForm.addEventListener('submit', async e => {
  e.preventDefault();
  setMsg(DOM.settingsMsg, '');
  const btn = DOM.settingsForm.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Guardando...';

  const { data, error } = await sb()
    .from('profiles')
    .upsert({
      id:          State.user.id,
      full_name:   DOM.setName.value.trim(),
      position:    DOM.setPosition.value.trim(),
      daily_hours: parseFloat(DOM.setDailyHours.value) || 8,
      work_days:   parseInt(DOM.setWorkDays.value) || 5,
      timezone:    DOM.setTimezone.value,
    }, { onConflict: 'id' })
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = 'Guardar cambios';

  if (error) {
    setMsg(DOM.settingsMsg, 'Error: ' + error.message, 'error');
  } else {
    State.profile = data;
    DOM.headerUsername.textContent = data.full_name || State.user.email;
    setMsg(DOM.settingsMsg, '✓ Cambios guardados', 'success');
    await refresh_dashboard();
    setTimeout(() => DOM.settingsModal.classList.add('hidden'), 1200);
  }
});

/* ─────────────────────────────────────────────
   INICIALIZACIÓN
───────────────────────────────────────────── */
populate_month_filter();
init();
