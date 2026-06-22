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
  user:         null,
  profile:      null,
  activeEntry:  null,
  elapsedTimer: null,
  clockTimer:   null,
  editMode:     false,    // modo edición activo
  dayOverrides: new Map(),// Map de "YYYY-MM-DD" → override object
};

/* ─────────────────────────────────────────────
   REFERENCIAS DOM
───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const DOM = {
  authScreen:$('auth-screen'), appScreen:$('app-screen'),
  loginForm:$('login-form'), loginEmail:$('login-email'), loginPass:$('login-password'),
  loginError:$('login-error'), logoutBtn:$('logout-btn'), settingsBtn:$('settings-btn'),
  headerUsername:$('header-username'),
  navBtns:document.querySelectorAll('.nav-btn'),
  statusDot:$('status-dot'), statusLabel:$('status-label'), statusTime:$('status-time'),
  statusElapsed:$('status-elapsed'), checkinBtn:$('checkin-btn'), checkoutBtn:$('checkout-btn'),
  todayCheckin:$('today-checkin'), todayCheckout:$('today-checkout'),
  todayWorked:$('today-worked'), todayGoal:$('today-goal'),
  weekBadge:$('week-badge'), weekBar:$('week-bar'), weekWorked:$('week-worked'), weekGoal:$('week-goal'),
  monthBadge:$('month-badge'), monthBar:$('month-bar'), monthWorked:$('month-worked'), monthGoal:$('month-goal'),
  historyFilterMonth:$('history-filter-month'), historyList:$('history-list'),
  statTotalDays:$('stat-total-days'), statAvgHours:$('stat-avg-hours'),
  statOvertime:$('stat-overtime'), statPunctuality:$('stat-punctuality'),
  barChart:$('bar-chart'), statsFilterMonth:$('stats-filter-month'), exportXlsxBtn:$('export-xlsx-btn'),
  editModeBtn:$('edit-mode-btn'), editModeBanner:$('edit-mode-banner'), editModeExit:$('edit-mode-exit'),
  pinModal:$('pin-modal'), pinClose:$('pin-close'), pinInput:$('pin-input'),
  pinConfirm:$('pin-confirm'), pinError:$('pin-error'),
  entryEditModal:$('entry-edit-modal'), entryEditClose:$('entry-edit-close'),
  entryEditDateLabel:$('entry-edit-date-label'), entryEditIn:$('entry-edit-in'),
  entryEditOut:$('entry-edit-out'), entryEditId:$('entry-edit-id'), entryEditDate:$('entry-edit-date'),
  entryEditSave:$('entry-edit-save'), entryEditDelete:$('entry-edit-delete'), entryEditMsg:$('entry-edit-msg'),
  dayEditModal:$('day-edit-modal'), dayEditClose:$('day-edit-close'), dayEditLabel:$('day-edit-label'),
  dayEditDate:$('day-edit-date'), dayEditSave:$('day-edit-save'), dayEditReset:$('day-edit-reset'),
  dayEditMsg:$('day-edit-msg'), dayEditLabelField:$('day-edit-label-field'),
  dayEditHoursField:$('day-edit-hours-field'), dayEditLabelInput:$('day-edit-label-input'),
  dayEditHoursInput:$('day-edit-hours-input'),
  dayEditWorkFields:$('day-edit-work-fields'), dayEditWorkIn:$('day-edit-work-in'), dayEditWorkOut:$('day-edit-work-out'),
  vacFilterYear:$('vac-filter-year'), vacUsed:$('vac-used'), vacTotal:$('vac-total'),
  vacRemaining:$('vac-remaining'), pendUsed:$('pend-used'), pendBalance:$('pend-balance'),
  localCount:$('local-count'), vacList:$('vac-list'), pendList:$('pend-list'), localList:$('local-list'),
  settingsModal:$('settings-modal'), settingsClose:$('settings-close'), settingsForm:$('settings-form'),
  setName:$('set-name'), setPosition:$('set-position'), setDailyHours:$('set-daily-hours'),
  setWorkDays:$('set-work-days'), setTimezone:$('set-timezone'),
  setVacationDays:$('set-vacation-days'), setPendingHours:$('set-pending-hours'),
  settingsMsg:$('settings-msg'), toast:$('toast'),
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
  if (screen === 'app') {
    DOM.authScreen.style.display = 'none';
    DOM.appScreen.style.display  = 'flex';
  } else {
    DOM.authScreen.style.display = 'flex';
    DOM.appScreen.style.display  = 'none';
  }
}

/** Inicializa la app: comprueba si hay sesión activa */
async function init() {
  let initialized = false;

  sb().auth.onAuthStateChange(async (event, session) => {
    console.log('Auth event:', event, '| user:', session?.user?.email);

    if (event === 'SIGNED_OUT') {
      initialized = false;
      State.user    = null;
      State.profile = null;
      clearInterval(State.elapsedTimer);
      clearInterval(State.clockTimer);
      show_screen('auth');
      return;
    }

    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      if (initialized) return;   // evitar doble disparo
      initialized = true;
      State.user = session.user;
      await load_profile();
      show_screen('app');
      await refresh_dashboard();
      start_clock();
    }

    if (event === 'INITIAL_SESSION' && !session?.user) {
      show_screen('auth');
    }
  });
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
    const msgs = {
      'Invalid login credentials': 'Email o contraseña incorrectos',
      'Email not confirmed':        'Email no confirmado. Contacta al administrador.',
      'Too many requests':          'Demasiados intentos. Espera unos minutos.',
    };
    setMsg(DOM.loginError, msgs[error.message] || error.message);
  }
  // Si no hay error, onAuthStateChange (SIGNED_IN) se encarga de la transición
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
    if (view === 'history')   await render_history();
    if (view === 'stats')     await render_stats();
    if (view === 'vacations') await render_vacations();
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

/* ─────────────────────────────────────────────
   GEOLOCALIZACIÓN — opcional, no bloquea
───────────────────────────────────────────── */

/**
 * Intenta obtener la posición del dispositivo.
 * Resuelve siempre: con { lat, lng, addr } si tiene éxito,
 * o con null si el usuario deniega o no está disponible.
 */
function get_location() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Reverse geocoding con Nominatim (OpenStreetMap, sin API key)
        let addr = '';
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'es' } }
          );
          const json = await res.json();
          // Construir dirección legible: calle + número + ciudad
          const r = json.address || {};
          const parts = [
            r.road || r.pedestrian || r.footway || '',
            r.house_number || '',
            r.city || r.town || r.village || r.municipality || '',
          ].filter(Boolean);
          addr = parts.join(', ');
        } catch { /* sin addr si falla el geocoding */ }
        resolve({ lat, lng, addr });
      },
      () => resolve(null),   // denegado o error → null, no bloquear
      { timeout: 6000, maximumAge: 60000 }
    );
  });
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

  // Intentar obtener ubicación en paralelo (máx 6s)
  const loc = await get_location();

  const payload = {
    user_id:  State.user.id,
    check_in: now,
    ...(loc && {
      checkin_lat:  loc.lat,
      checkin_lng:  loc.lng,
      checkin_addr: loc.addr,
    }),
  };

  const { data, error } = await sb()
    .from('time_entries')
    .insert(payload)
    .select()
    .single();

  if (error) {
    showToast('Error al fichar entrada: ' + error.message, 'error');
    DOM.checkinBtn.disabled = false;
  } else {
    State.activeEntry = data;
    update_status_ui(true);
    start_elapsed_timer(data.check_in);
    DOM.todayCheckin.textContent = fmt_time(data.check_in);
    const locMsg = loc?.addr ? ` · 📍 ${loc.addr}` : '';
    showToast('✓ Entrada registrada a las ' + fmt_time(now) + locMsg, 'success', 4000);
    await refresh_balance();
  }
  DOM.checkinBtn.innerHTML = `<span class="clock-btn-icon">▶</span><span class="clock-btn-label">Fichar Entrada</span><span class="clock-btn-sub">Registrar inicio de jornada</span>`;
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

  // Intentar obtener ubicación en paralelo (máx 6s)
  const loc = await get_location();

  const payload = {
    check_out: now,
    ...(loc && {
      checkout_lat:  loc.lat,
      checkout_lng:  loc.lng,
      checkout_addr: loc.addr,
    }),
  };

  const { data, error } = await sb()
    .from('time_entries')
    .update(payload)
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
    const locMsg = loc?.addr ? ` · 📍 ${loc.addr}` : '';
    showToast('✓ Salida registrada. Trabajaste ' + fmt_duration(mins) + locMsg, 'success', 4000);
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

// Delegación: botones de editar fichaje
DOM.historyList.addEventListener('click', e => {
  const btn = e.target.closest('.edit-entry-btn');
  if (!btn || !State.editMode) return;
  open_entry_edit_modal(btn.dataset.id, btn.dataset.date, btn.dataset.in, btn.dataset.out);
});

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
          ${e.checkin_addr ? `<span class="time-loc" title="${e.checkin_addr}">📍</span>` : ''}
        </div>
        <div class="history-time-row">
          <span class="time-icon">■</span>
          <span class="time-val">${isActive ? '<em style="opacity:.5">activo</em>' : fmt_time(e.check_out)}</span>
          <span class="time-label">salida</span>
          ${e.checkout_addr ? `<span class="time-loc" title="${e.checkout_addr}">📍</span>` : ''}
        </div>
      </div>
      <div class="history-total">
        <div class="history-hours">${mins != null ? fmt_duration(mins) : '—'}</div>
        ${diff != null ? `<div class="history-balance ${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '+' : ''}${fmt_duration(diff)}</div>` : ''}
      </div>
      ${State.editMode ? `<button class="edit-entry-btn" data-id="${e.id}" data-date="${fmt_date_key(d)}" data-in="${fmt_time(e.check_in)}" data-out="${e.check_out ? fmt_time(e.check_out) : ''}" title="Editar">✏️</button>` : ''}
    `;

    DOM.historyList.appendChild(item);
  }
}

/* ─────────────────────────────────────────────
   FESTIVOS — España nacional + Zaragoza
───────────────────────────────────────────── */

/**
 * Devuelve un Map de "YYYY-MM-DD" → nombre del festivo
 * para el año indicado, incluyendo festivos nacionales
 * y los específicos de Zaragoza (Aragón).
 */
function get_holidays(year) {
  const h = new Map();
  const add = (m, d, name) => h.set(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`, name);

  // ── Festivos nacionales fijos ──────────────
  add(1,  1,  'Año Nuevo');
  add(1,  6,  'Reyes Magos');
  add(5,  1,  'Día del Trabajo');
  add(8,  15, 'Asunción de la Virgen');
  add(10, 12, 'Fiesta Nacional');
  add(11, 1,  'Todos los Santos');
  add(12, 6,  'Día de la Constitución');
  add(12, 8,  'Inmaculada Concepción');
  add(12, 25, 'Navidad');

  // ── Semana Santa (Pascua variable) ─────────
  const easter = get_easter(year);
  const viernesSanto = new Date(easter); viernesSanto.setDate(easter.getDate() - 2);
  const juevesSanto  = new Date(easter); juevesSanto.setDate(easter.getDate() - 3);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  h.set(fmt(juevesSanto),  'Jueves Santo');
  h.set(fmt(viernesSanto), 'Viernes Santo');

  // ── Festivos Comunidad de Aragón ───────────
  add(4, 23, 'San Jorge (Aragón)');

  // ── Festivos locales de Zaragoza ──────────
  // Fiestas del Pilar: 12 de octubre ya es nacional
  // Festivos locales adicionales de Zaragoza capital
  add(2, 5,  'Santa Águeda');           // Zaragoza capital (algunos años se traslada)
  // Lunes de Pascua en Aragón
  const lunesPascua = new Date(easter); lunesPascua.setDate(easter.getDate() + 1);
  h.set(fmt(lunesPascua), 'Lunes de Pascua');

  return h;
}

/** Algoritmo de Meeus/Jones/Butcher para calcular la Pascua */
function get_easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/* ─────────────────────────────────────────────
   ESTADÍSTICAS + CALENDARIO
───────────────────────────────────────────── */

// Estado del calendario
const CalState = { year: new Date().getFullYear(), month: new Date().getMonth() };

/** Rellena el selector de mes de estadísticas */
function populate_stats_month_filter() {
  const sel = $('stats-filter-month');
  if (!sel) return;
  sel.innerHTML = '';
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const opt = document.createElement('option');
    opt.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    opt.textContent = d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long' });
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    const [y, m] = sel.value.split('-').map(Number);
    CalState.year  = y;
    CalState.month = m - 1;
    render_stats();
  });
}

async function render_stats() {
  const profile  = State.profile || {};
  const dailyH   = parseFloat(profile.daily_hours) || 8;
  const workDays = parseInt(profile.work_days) || 5;

  const selMonth = CalState.month;
  const selYear  = CalState.year;

  const monthStart = new Date(selYear, selMonth, 1);
  const monthEnd   = new Date(selYear, selMonth + 1, 0, 23, 59, 59);
  const now        = new Date();

  // Sync selector
  const sel = $('stats-filter-month');
  if (sel) {
    const val = `${selYear}-${String(selMonth + 1).padStart(2, '0')}`;
    if (sel.value !== val) sel.value = val;
  }

  $('cal-title').textContent = monthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  // Cargar overrides del mes
  await load_day_overrides(selYear, selMonth);

  // Obtener fichajes del mes
  const { data: entries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', monthStart.toISOString())
    .lte('check_in', monthEnd.toISOString())
    .order('check_in', { ascending: true });

  // Agrupar por día
  const byDay = {};
  for (const e of (entries || [])) {
    const d   = new Date(e.check_in);
    const key = fmt_date_key(d);
    if (!byDay[key]) byDay[key] = { entries: [], totalMins: 0 };
    const out  = e.check_out ? e.check_out : (key === fmt_date_key(now) ? now.toISOString() : null);
    const mins = out ? diff_minutes(e.check_in, out) : 0;
    byDay[key].entries.push(e);
    byDay[key].totalMins += mins;
  }

  // Tarjetas de estadísticas
  const completedDays = Object.keys(byDay).filter(k => new Date(k) <= now);
  const totalDays = completedDays.length;
  const avgMins   = totalDays > 0
    ? Object.values(byDay).reduce((a, b) => a + b.totalMins, 0) / totalDays : 0;

  const effectiveEnd  = monthEnd < now ? monthEnd : now;
  const monthWorkDays = working_days_between(monthStart, effectiveEnd, workDays);
  const monthGoalMins = monthWorkDays * dailyH * 60;
  const monthMins     = Object.values(byDay).reduce((a, b) => a + b.totalMins, 0);
  const diffMins      = monthMins - monthGoalMins;
  const onTime        = Object.values(byDay).filter(v => v.totalMins >= dailyH * 60 * 0.95).length;

  DOM.statTotalDays.textContent    = totalDays;
  DOM.statAvgHours.textContent     = `${(avgMins / 60).toFixed(1)}h`;
  DOM.statOvertime.textContent     = (diffMins >= 0 ? '+' : '') + fmt_duration(diffMins);
  DOM.statOvertime.style.color     = diffMins >= 0 ? 'var(--green-dim)' : 'var(--red-dim)';
  DOM.statPunctuality.textContent  = `${onTime}/${totalDays}`;

  render_calendar(selYear, selMonth, byDay, dailyH, workDays);

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 13);
  twoWeeksAgo.setHours(0, 0, 0, 0);
  render_bar_chart(twoWeeksAgo, dailyH);
}

/** Formatea Date → "YYYY-MM-DD" */
function fmt_date_key(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Renderiza el calendario mensual */
function render_calendar(year, month, byDay, dailyH, workDaysPerWeek) {
  const grid     = $('calendar-grid');
  const holidays = get_holidays(year);
  const now      = new Date();
  const today    = fmt_date_key(now);

  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  for (let i = 0; i < startDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const key    = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const date   = new Date(year, month, day);
    const dow    = date.getDay();
    const isFuture   = date > now && key !== today;
    const isWeekend  = dow === 0 || dow === 6;
    const isToday    = key === today;

    // Override manual tiene prioridad
    const override   = State.dayOverrides.get(key);
    const autoHoliday = holidays.has(key);

    let cls = 'cal-day';
    let holidayName = '';

    if (override) {
      // Tipo override
      if (override.type === 'national_holiday') { cls += ' override-national'; holidayName = override.label || holidays.get(key) || 'Festivo nacional'; }
      else if (override.type === 'local_holiday') { cls += ' override-local'; holidayName = override.label || 'Festivo laboral'; }
      else if (override.type === 'vacation')       { cls += ' override-vacation'; holidayName = override.label || 'Vacaciones'; }
      else if (override.type === 'pending_hours')  { cls += ' override-pending'; holidayName = override.label || 'Horas pendientes'; }
      else { // work — tratar como normal
        if (isFuture) cls += ' future';
        else if (byDay[key]) {
          const pct = byDay[key].totalMins / (dailyH * 60);
          cls += pct >= 0.95 ? ' worked' : pct >= 0.2 ? ' partial' : ' missed';
        } else if (!isFuture && date < now) cls += ' missed';
      }
    } else if (isFuture) {
      cls += ' future';
    } else if (autoHoliday) {
      cls += ' holiday'; holidayName = holidays.get(key);
    } else if (isWeekend) {
      cls += ' weekend';
    } else if (byDay[key]) {
      const pct = byDay[key].totalMins / (dailyH * 60);
      cls += pct >= 0.95 ? ' worked' : pct >= 0.2 ? ' partial' : ' missed';
    } else if (!isFuture && date < now) {
      cls += ' missed';
    }

    if (isToday) cls += ' today';
    if (State.editMode) cls += ' editable';
    if (override) cls += ' has-override';

    const cell = document.createElement('div');
    cell.className = cls;

    let inner = `<span class="cal-day-num">${day}</span>`;

    if (byDay[key] && !isFuture && (!override || override.type === 'work')) {
      const h    = (byDay[key].totalMins / 60).toFixed(1);
      const diff = byDay[key].totalMins - dailyH * 60;
      const sign = diff >= 0 ? '+' : '';
      const balClass = diff >= 0 ? 'pos' : 'neg';
      inner += `<span class="cal-hours">${h}h</span>`;
      if (!isWeekend && !autoHoliday) {
        inner += `<span class="cal-balance ${balClass}">${sign}${fmt_duration(diff)}</span>`;
      }
    }

    if (override && override.type !== 'work') {
      const overrideH = override.type === 'vacation' || override.type === 'pending_hours'
        ? `${override.hours || dailyH}h` : '';
      inner += `<span class="cal-holiday-name">${holidayName}</span>`;
      if (overrideH) inner += `<span class="cal-hours">${overrideH}</span>`;
    } else if (autoHoliday && !override) {
      inner += `<span class="cal-holiday-name">${holidayName}</span>`;
    }

    if (State.editMode && !isFuture) {
      inner += `<span class="cal-edit-dot" title="Editar día"></span>`;
    }

    cell.innerHTML = inner;

    // Tooltip con fichajes
    if (byDay[key]) {
      const tip = byDay[key].entries.map(e =>
        `${fmt_time(e.check_in)} – ${e.check_out ? fmt_time(e.check_out) : 'activo'}`
      ).join('\n');
      cell.title = tip;
    }

    // Click para editar en modo edición
    if (State.editMode) {
      cell.addEventListener('click', () => open_day_edit_modal(key));
    }

    grid.appendChild(cell);
  }
}

// Navegación del calendario
$('cal-prev').addEventListener('click', () => {
  CalState.month--;
  if (CalState.month < 0) { CalState.month = 11; CalState.year--; }
  render_stats();
});
$('cal-next').addEventListener('click', () => {
  CalState.month++;
  if (CalState.month > 11) { CalState.month = 0; CalState.year++; }
  render_stats();
});

/* ─────────────────────────────────────────────
   EXPORTAR EXCEL (T2)
───────────────────────────────────────────── */

$('export-xlsx-btn').addEventListener('click', export_to_xlsx);

async function export_to_xlsx() {
  const profile  = State.profile || {};
  const dailyH   = parseFloat(profile.daily_hours) || 8;
  const workDays = parseInt(profile.work_days) || 5;
  const name     = profile.full_name || State.user.email;
  const position = profile.position  || '';

  const year  = CalState.year;
  const month = CalState.month;
  const monthStart = new Date(year, month, 1);
  const monthEnd   = new Date(year, month + 1, 0, 23, 59, 59);
  const monthLabel = monthStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  showToast('Generando Excel...', 'default', 4000);

  const { data: entries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', monthStart.toISOString())
    .lte('check_in', monthEnd.toISOString())
    .order('check_in', { ascending: true });

  const holidays = get_holidays(year);
  const DAYS_ES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

  // Agrupar por día
  const byDay = {};
  for (const e of (entries || [])) {
    const key = fmt_date_key(new Date(e.check_in));
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(e);
  }

  // ── Hoja 1: Detalle diario ──────────────────
  const rows = [];

  // Cabecera del documento
  rows.push([`REGISTRO HORARIO — ${monthLabel.toUpperCase()}`]);
  rows.push([`Empleado: ${name}${position ? '  |  Cargo: ' + position : ''}`]);
  rows.push([`Jornada: ${dailyH}h/día`]);
  rows.push([]);
  rows.push(['Fecha', 'Día', 'Entrada', 'Salida', 'Horas trabajadas', 'Diferencia', 'Observaciones']);

  // Iterar cada día del mes
  const numDays = monthEnd.getDate();
  let totalWorkedMins = 0;
  let totalGoalMins   = 0;

  for (let d = 1; d <= numDays; d++) {
    const key     = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const date    = new Date(year, month, d);
    const dow     = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidays.has(key);
    const dayEntries = byDay[key] || [];
    const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const dayName = DAYS_ES[dow];

    if (isHoliday) {
      rows.push([dateStr, dayName, '—', '—', '—', '—', `Festivo: ${holidays.get(key)}`]);
      continue;
    }
    if (isWeekend) {
      rows.push([dateStr, dayName, '—', '—', '—', '—', 'Fin de semana']);
      continue;
    }

    if (dayEntries.length === 0) {
      rows.push([dateStr, dayName, '—', '—', '0h 00m', `-${dailyH}h 00m`, 'Sin registro']);
      totalGoalMins += dailyH * 60;
      continue;
    }

    // Puede haber múltiples fichajes en el mismo día
    let dayMins = 0;
    for (const e of dayEntries) {
      if (e.check_out) dayMins += diff_minutes(e.check_in, e.check_out);
    }
    totalWorkedMins += dayMins;
    totalGoalMins   += dailyH * 60;

    const firstIn  = fmt_time(dayEntries[0].check_in);
    const lastOut  = dayEntries[dayEntries.length - 1].check_out
      ? fmt_time(dayEntries[dayEntries.length - 1].check_out)
      : 'Activo';
    const diff     = dayMins - dailyH * 60;
    const diffStr  = (diff >= 0 ? '+' : '') + fmt_duration(diff);
    const obs      = dayEntries.length > 1 ? `${dayEntries.length} fichajes` : '';

    rows.push([dateStr, dayName, firstIn, lastOut, fmt_duration(dayMins), diffStr, obs]);
  }

  // ── Totales ──
  rows.push([]);
  const totalDiff = totalWorkedMins - totalGoalMins;
  rows.push(['TOTALES', '', '', '',
    fmt_duration(totalWorkedMins),
    (totalDiff >= 0 ? '+' : '') + fmt_duration(totalDiff),
    ''
  ]);

  // ── Firma ──
  rows.push([]);
  rows.push([]);
  rows.push(['El/La empleado/a firma el presente registro como conforme:']);
  rows.push([]);
  rows.push(['Firma:', '____________________________', '', 'Fecha:', new Date().toLocaleDateString('es-ES')]);

  // ── Hoja 2: Resumen ──────────────────────────
  const effectiveEnd  = monthEnd < new Date() ? monthEnd : new Date();
  const monthWorkDays = working_days_between(monthStart, effectiveEnd, workDays);
  const workedDays    = Object.keys(byDay).filter(k => new Date(k) <= new Date()).length;

  const summary = [
    ['RESUMEN DEL MES'],
    [],
    ['Empleado',         name],
    ['Cargo',            position || '—'],
    ['Período',          monthLabel],
    ['Jornada diaria',   `${dailyH}h`],
    [],
    ['Días laborables (hasta hoy)',  monthWorkDays],
    ['Días con registro',             workedDays],
    ['Total horas trabajadas',        fmt_duration(totalWorkedMins)],
    ['Total horas objetivo',          fmt_duration(totalGoalMins)],
    ['Balance',                       (totalDiff >= 0 ? '+' : '') + fmt_duration(totalDiff)],
    [],
    ['Generado el', new Date().toLocaleString('es-ES')],
  ];

  // ── Crear libro Excel ────────────────────────
  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  // Anchos de columna
  ws1['!cols'] = [
    { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 10 },
    { wch: 17 }, { wch: 14 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Registro diario');

  const ws2 = XLSX.utils.aoa_to_sheet(summary);
  ws2['!cols'] = [{ wch: 30 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');

  // Descargar
  const filename = `TimeControl_${name.replace(/\s+/g, '_')}_${year}-${String(month+1).padStart(2,'0')}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast('✓ Excel descargado', 'success');
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
  DOM.setName.value         = State.profile.full_name    || '';
  DOM.setPosition.value     = State.profile.position     || '';
  DOM.setDailyHours.value   = State.profile.daily_hours  || 8;
  DOM.setWorkDays.value     = State.profile.work_days    || 5;
  DOM.setTimezone.value     = State.profile.timezone     || 'Europe/Madrid';
  DOM.setVacationDays.value = State.profile.vacation_days || 22;
  DOM.setPendingHours.value = State.profile.pending_hours || 0;
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
      id:            State.user.id,
      full_name:     DOM.setName.value.trim(),
      position:      DOM.setPosition.value.trim(),
      daily_hours:   parseFloat(DOM.setDailyHours.value) || 8,
      work_days:     parseInt(DOM.setWorkDays.value) || 5,
      timezone:      DOM.setTimezone.value,
      vacation_days: parseInt(DOM.setVacationDays.value) || 22,
      pending_hours: parseFloat(DOM.setPendingHours.value) || 0,
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
   MODO EDICIÓN — PIN
───────────────────────────────────────────── */

/** Abre el modal de PIN */
DOM.editModeBtn.addEventListener('click', () => {
  if (State.editMode) {
    exit_edit_mode();
    return;
  }
  setMsg(DOM.pinError, '');
  DOM.pinInput.value = '';
  DOM.pinModal.classList.remove('hidden');
  setTimeout(() => DOM.pinInput.focus(), 100);
});

DOM.pinClose.addEventListener('click', () => DOM.pinModal.classList.add('hidden'));
DOM.pinModal.addEventListener('click', e => { if (e.target === DOM.pinModal) DOM.pinModal.classList.add('hidden'); });

/** Confirmar PIN para entrar en modo edición */
DOM.pinConfirm.addEventListener('click', () => {
  const entered = DOM.pinInput.value.trim();
  if (entered !== '2704') {
    setMsg(DOM.pinError, 'PIN incorrecto.');
    return;
  }
  DOM.pinModal.classList.add('hidden');
  enter_edit_mode();
});

// También confirmar con Enter
DOM.pinInput.addEventListener('keydown', e => { if (e.key === 'Enter') DOM.pinConfirm.click(); });

function enter_edit_mode() {
  State.editMode = true;
  DOM.editModeBtn.textContent = '🔓';
  DOM.editModeBtn.classList.add('active');
  DOM.editModeBanner.classList.remove('hidden');
  showToast('✏️ Modo edición activado', 'default');
  // Re-render la vista activa para que aparezcan los controles de edición
  const activeView = document.querySelector('.nav-btn.active')?.dataset.view;
  if (activeView === 'history') render_history();
  if (activeView === 'stats')   render_stats();
}

function exit_edit_mode() {
  State.editMode = false;
  DOM.editModeBtn.textContent = '🔒';
  DOM.editModeBtn.classList.remove('active');
  DOM.editModeBanner.classList.add('hidden');
  showToast('🔒 Modo edición desactivado', 'default');
  // Re-render la vista activa para quitar botones de edición
  const activeView = document.querySelector('.nav-btn.active')?.dataset.view;
  if (activeView === 'history') render_history();
  if (activeView === 'stats')   render_stats();
}

DOM.editModeExit.addEventListener('click', exit_edit_mode);

/* ─────────────────────────────────────────────
   EDITAR FICHAJE
───────────────────────────────────────────── */

function open_entry_edit_modal(id, dateKey, timeIn, timeOut) {
  DOM.entryEditId.value   = id;
  DOM.entryEditDate.value = dateKey;
  DOM.entryEditIn.value   = timeIn  || '';
  DOM.entryEditOut.value  = timeOut || '';
  // Mostrar fecha legible
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  DOM.entryEditDateLabel.textContent = date.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  setMsg(DOM.entryEditMsg, '');
  DOM.entryEditModal.classList.remove('hidden');
}

DOM.entryEditClose.addEventListener('click', () => DOM.entryEditModal.classList.add('hidden'));
DOM.entryEditModal.addEventListener('click', e => { if (e.target === DOM.entryEditModal) DOM.entryEditModal.classList.add('hidden'); });

/** Guardar cambios en fichaje */
DOM.entryEditSave.addEventListener('click', async () => {
  const id      = DOM.entryEditId.value;
  const dateKey = DOM.entryEditDate.value;
  const [y, m, d] = dateKey.split('-').map(Number);
  const timeIn  = DOM.entryEditIn.value;
  const timeOut = DOM.entryEditOut.value;

  if (!timeIn) { setMsg(DOM.entryEditMsg, 'La hora de entrada es obligatoria.'); return; }

  const checkIn  = new Date(y, m-1, d, ...timeIn.split(':').map(Number)).toISOString();
  const checkOut = timeOut ? new Date(y, m-1, d, ...timeOut.split(':').map(Number)).toISOString() : null;

  DOM.entryEditSave.disabled = true;
  DOM.entryEditSave.innerHTML = '<span class="spinner"></span>';

  const { error } = await sb().from('time_entries')
    .update({ check_in: checkIn, check_out: checkOut })
    .eq('id', id)
    .eq('user_id', State.user.id);

  DOM.entryEditSave.disabled = false;
  DOM.entryEditSave.textContent = 'Guardar cambios';

  if (error) { setMsg(DOM.entryEditMsg, 'Error: ' + error.message); return; }

  setMsg(DOM.entryEditMsg, '✓ Guardado', 'success');
  setTimeout(() => {
    DOM.entryEditModal.classList.add('hidden');
    render_history();
    refresh_dashboard();
  }, 800);
});

/** Eliminar fichaje */
DOM.entryEditDelete.addEventListener('click', async () => {
  if (!confirm('¿Eliminar este fichaje? Esta acción no se puede deshacer.')) return;
  const id = DOM.entryEditId.value;
  const { error } = await sb().from('time_entries')
    .delete().eq('id', id).eq('user_id', State.user.id);
  if (error) { setMsg(DOM.entryEditMsg, 'Error: ' + error.message); return; }
  DOM.entryEditModal.classList.add('hidden');
  render_history();
  refresh_dashboard();
  showToast('Fichaje eliminado', 'default');
});

/* ─────────────────────────────────────────────
   EDITAR DÍA CALENDARIO
───────────────────────────────────────────── */

/** Carga los overrides del mes visible */
async function load_day_overrides(year, month) {
  const start = new Date(year, month, 1).toISOString().split('T')[0];
  const end   = new Date(year, month + 1, 0).toISOString().split('T')[0];
  const { data } = await sb().from('day_overrides')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('date', start)
    .lte('date', end);
  State.dayOverrides.clear();
  for (const o of (data || [])) State.dayOverrides.set(o.date, o);
}

/** También cargar overrides del año completo para vacaciones */
async function load_day_overrides_year(year) {
  const { data } = await sb().from('day_overrides')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);
  State.dayOverrides.clear();
  for (const o of (data || [])) State.dayOverrides.set(o.date, o);
}

/** Abre modal de edición de día */
async function open_day_edit_modal(dateKey) {
  if (!State.editMode) return;
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m-1, d);
  DOM.dayEditLabel.textContent = date.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  DOM.dayEditDate.value = dateKey;

  // Precargar tipo actual
  const existing = State.dayOverrides.get(dateKey);
  document.querySelectorAll('.day-type-btn').forEach(b => b.classList.remove('selected'));
  if (existing) {
    const btn = document.querySelector(`.day-type-btn[data-type="${existing.type}"]`);
    if (btn) btn.classList.add('selected');
    DOM.dayEditLabelInput.value  = existing.label  || '';
    DOM.dayEditHoursInput.value  = existing.hours  || 8;
  } else {
    // Sin override: si el día tiene fichajes reales, preseleccionar "Laboral"
    DOM.dayEditLabelInput.value  = '';
    DOM.dayEditHoursInput.value  = 8;
  }

  // Cargar fichajes existentes de ese día (para mostrar/editar horas)
  const dayStart = new Date(y, m-1, d, 0, 0, 0).toISOString();
  const dayEnd   = new Date(y, m-1, d, 23, 59, 59).toISOString();
  const { data: dayEntries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', dayStart)
    .lte('check_in', dayEnd)
    .order('check_in', { ascending: true });

  State._dayEditEntries = dayEntries || [];

  if (dayEntries?.length) {
    DOM.dayEditWorkIn.value  = fmt_time_24(dayEntries[0].check_in);
    const last = dayEntries[dayEntries.length - 1];
    DOM.dayEditWorkOut.value = last.check_out ? fmt_time_24(last.check_out) : '';
    if (!existing) {
      document.querySelector('.day-type-btn[data-type="work"]')?.classList.add('selected');
    }
  } else {
    DOM.dayEditWorkIn.value  = '';
    DOM.dayEditWorkOut.value = '';
    if (!existing) {
      document.querySelector('.day-type-btn[data-type="work"]')?.classList.add('selected');
    }
  }

  const selectedType = document.querySelector('.day-type-btn.selected')?.dataset.type || 'work';
  update_day_edit_fields(selectedType);
  setMsg(DOM.dayEditMsg, '');
  DOM.dayEditModal.classList.remove('hidden');
}

/** Formatea fecha ISO → "HH:MM" en hora local (para <input type=time>) */
function fmt_time_24(isoDate) {
  const d = new Date(isoDate);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/** Muestra/oculta campos según tipo */
function update_day_edit_fields(type) {
  const showLabel = ['national_holiday', 'local_holiday'].includes(type);
  const showHours = ['vacation', 'pending_hours'].includes(type);
  const showWork  = type === 'work';
  DOM.dayEditLabelField.classList.toggle('hidden', !showLabel);
  DOM.dayEditHoursField.classList.toggle('hidden', !showHours);
  DOM.dayEditWorkFields.classList.toggle('hidden', !showWork);
}

// Selección de tipo
document.querySelectorAll('.day-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    update_day_edit_fields(btn.dataset.type);
  });
});

DOM.dayEditClose.addEventListener('click', () => DOM.dayEditModal.classList.add('hidden'));
DOM.dayEditModal.addEventListener('click', e => { if (e.target === DOM.dayEditModal) DOM.dayEditModal.classList.add('hidden'); });

/** Guardar override de día (y fichaje si es tipo "Laboral") */
DOM.dayEditSave.addEventListener('click', async () => {
  const dateKey = DOM.dayEditDate.value;
  const type    = document.querySelector('.day-type-btn.selected')?.dataset.type;
  if (!type) { setMsg(DOM.dayEditMsg, 'Selecciona un tipo de día.'); return; }

  const label = DOM.dayEditLabelInput.value.trim();
  const hours = parseFloat(DOM.dayEditHoursInput.value) || 8;

  DOM.dayEditSave.disabled = true;
  DOM.dayEditSave.innerHTML = '<span class="spinner"></span>';

  // ── Caso "Laboral": crear/actualizar el fichaje real ──
  if (type === 'work') {
    const timeIn  = DOM.dayEditWorkIn.value;
    const timeOut = DOM.dayEditWorkOut.value;

    if (!timeIn) {
      setMsg(DOM.dayEditMsg, 'Indica al menos la hora de entrada.');
      DOM.dayEditSave.disabled = false;
      DOM.dayEditSave.textContent = 'Guardar';
      return;
    }

    const [y, m, d] = dateKey.split('-').map(Number);
    const checkIn  = new Date(y, m-1, d, ...timeIn.split(':').map(Number)).toISOString();
    const checkOut = timeOut ? new Date(y, m-1, d, ...timeOut.split(':').map(Number)).toISOString() : null;

    const existingEntries = State._dayEditEntries || [];

    let entryError = null;
    if (existingEntries.length > 0) {
      // Actualizar el primer fichaje del día, eliminar el resto si hubiera duplicados
      const { error } = await sb().from('time_entries')
        .update({ check_in: checkIn, check_out: checkOut })
        .eq('id', existingEntries[0].id)
        .eq('user_id', State.user.id);
      entryError = error;
    } else {
      // Crear nuevo fichaje
      const { error } = await sb().from('time_entries')
        .insert({ user_id: State.user.id, check_in: checkIn, check_out: checkOut });
      entryError = error;
    }

    if (entryError) {
      setMsg(DOM.dayEditMsg, 'Error al guardar el fichaje: ' + entryError.message);
      DOM.dayEditSave.disabled = false;
      DOM.dayEditSave.textContent = 'Guardar';
      return;
    }

    // Eliminar cualquier override existente para este día (vuelve a ser día laboral normal)
    await sb().from('day_overrides')
      .delete().eq('user_id', State.user.id).eq('date', dateKey);
    State.dayOverrides.delete(dateKey);

  } else {
    // ── Resto de tipos: solo guardar el override ──
    const { error } = await sb().from('day_overrides').upsert({
      user_id: State.user.id,
      date:    dateKey,
      type, label, hours,
    }, { onConflict: 'user_id,date' });

    if (error) {
      setMsg(DOM.dayEditMsg, 'Error: ' + error.message);
      DOM.dayEditSave.disabled = false;
      DOM.dayEditSave.textContent = 'Guardar';
      return;
    }
  }

  DOM.dayEditSave.disabled = false;
  DOM.dayEditSave.textContent = 'Guardar';
  setMsg(DOM.dayEditMsg, '✓ Guardado', 'success');

  await load_day_overrides(CalState.year, CalState.month);
  setTimeout(() => {
    DOM.dayEditModal.classList.add('hidden');
    render_stats();
    // Si la pestaña histórico está activa, refrescarla también
    const activeView = document.querySelector('.nav-btn.active')?.dataset.view;
    if (activeView === 'history') render_history();
  }, 600);
});

/** Restablecer día a predeterminado */
DOM.dayEditReset.addEventListener('click', async () => {
  const dateKey = DOM.dayEditDate.value;
  await sb().from('day_overrides')
    .delete().eq('user_id', State.user.id).eq('date', dateKey);
  State.dayOverrides.delete(dateKey);
  DOM.dayEditModal.classList.add('hidden');
  render_stats();
  showToast('Día restablecido', 'default');
});

/* ─────────────────────────────────────────────
   PESTAÑA VACACIONES
───────────────────────────────────────────── */

function populate_vac_year_filter() {
  const sel = DOM.vacFilterYear;
  if (!sel) return;
  sel.innerHTML = '';
  const y = new Date().getFullYear();
  for (let i = 0; i <= 2; i++) {
    const opt = document.createElement('option');
    opt.value = y - i;
    opt.textContent = y - i;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', render_vacations);
}

async function render_vacations() {
  const year = parseInt(DOM.vacFilterYear?.value) || new Date().getFullYear();

  await load_day_overrides_year(year);

  const vacDays   = [];
  const pendDays  = [];
  const localDays = [];

  for (const [dateKey, ov] of State.dayOverrides) {
    if (!dateKey.startsWith(String(year))) continue;
    if (ov.type === 'vacation')      vacDays.push(ov);
    if (ov.type === 'pending_hours') pendDays.push(ov);
    if (ov.type === 'local_holiday') localDays.push(ov);
  }

  const profile      = State.profile || {};
  const totalVacDays = parseInt(profile.vacation_days) || 22;
  const dailyH       = parseFloat(profile.daily_hours) || 8;
  const workDays     = parseInt(profile.work_days) || 5;

  // ── Vacaciones ──────────────────────────────
  const usedVacDays  = vacDays.length;
  const remainingVac = totalVacDays - usedVacDays;
  DOM.vacUsed.textContent      = usedVacDays;
  DOM.vacTotal.textContent     = totalVacDays;
  DOM.vacRemaining.textContent = `${remainingVac >= 0 ? remainingVac : 0} restantes`;
  DOM.vacRemaining.style.color = remainingVac >= 0 ? 'var(--green-dim)' : 'var(--red-dim)';

  // ── Horas pendientes ────────────────────────
  // 1. Obtener todos los fichajes del año
  const yearStart = new Date(year, 0, 1).toISOString();
  const yearEnd   = new Date(year, 11, 31, 23, 59, 59).toISOString();
  const { data: entries } = await sb()
    .from('time_entries')
    .select('*')
    .eq('user_id', State.user.id)
    .gte('check_in', yearStart)
    .lte('check_in', yearEnd)
    .not('check_out', 'is', null);

  // 2. Calcular balance acumulado día a día (horas de más / de menos)
  const byDay = {};
  for (const e of (entries || [])) {
    const key = fmt_date_key(new Date(e.check_in));
    if (!byDay[key]) byDay[key] = 0;
    byDay[key] += diff_minutes(e.check_in, e.check_out);
  }

  const holidays = get_holidays(year);
  let accumulatedBalanceMins = 0;

  for (const [dateKey, workedMins] of Object.entries(byDay)) {
    const date = new Date(dateKey);
    const dow  = date.getDay();
    const override = State.dayOverrides.get(dateKey);

    // Ignorar días que no son laborables (fines de semana, festivos, vacaciones, etc.)
    const isWeekend  = dow === 0 || dow === 6;
    const isHoliday  = holidays.has(dateKey);
    const isOverride = override && override.type !== 'work';
    if (isWeekend || isHoliday || isOverride) continue;

    accumulatedBalanceMins += workedMins - dailyH * 60;
  }

  // 3. Horas consumidas por overrides de tipo pending_hours
  const consumedPendMins = pendDays.reduce((s, o) => s + (parseFloat(o.hours) || 0) * 60, 0);

  // 4. Saldo final = balance real acumulado - horas pendientes consumidas
  const finalBalanceMins = accumulatedBalanceMins - consumedPendMins;

  DOM.pendUsed.textContent    = fmt_duration(Math.abs(accumulatedBalanceMins));
  DOM.pendUsed.style.color    = accumulatedBalanceMins >= 0 ? 'var(--green-dim)' : 'var(--red-dim)';
  DOM.pendBalance.textContent = `${finalBalanceMins >= 0 ? '+' : ''}${fmt_duration(finalBalanceMins)} saldo neto`;
  DOM.pendBalance.style.color = finalBalanceMins >= 0 ? 'var(--green-dim)' : 'var(--red-dim)';

  // Actualizar etiqueta de la tarjeta
  const pendCard = DOM.pendUsed.closest('.vac-card');
  if (pendCard) {
    const sub = pendCard.querySelector('.vac-card-sub');
    if (sub) sub.textContent = accumulatedBalanceMins >= 0 ? 'Horas acumuladas de más' : 'Horas en deuda';
  }

  // ── Festivos laborables ──────────────────────
  DOM.localCount.textContent = localDays.length;

  const fmt_vac_date = key => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
  };

  // Render listas
  render_vac_list(DOM.vacList, vacDays.map(o => ({
    date: fmt_vac_date(o.date),
    label: o.label || 'Vacaciones',
    value: `${o.hours || dailyH}h`
  })));
  render_vac_list(DOM.pendList, pendDays.map(o => ({
    date: fmt_vac_date(o.date),
    label: o.label || 'Horas pendientes',
    value: `${o.hours || dailyH}h`
  })));
  render_vac_list(DOM.localList, localDays.map(o => ({
    date: fmt_vac_date(o.date),
    label: o.label || 'Festivo laboral',
    value: ''
  })));
}

function render_vac_list(container, items) {
  if (!items.length) {
    container.innerHTML = '<div class="vac-empty">Sin registros</div>';
    return;
  }
  container.innerHTML = items.map(i => `
    <div class="vac-item">
      <span class="vac-item-date">${i.date}</span>
      <span class="vac-item-label">${i.label}</span>
      ${i.value ? `<span class="vac-item-hours">${i.value}</span>` : ''}
    </div>
  `).join('');
}

/* ─────────────────────────────────────────────
   INICIALIZACIÓN
───────────────────────────────────────────── */
populate_month_filter();
populate_stats_month_filter();
populate_vac_year_filter();
init();
