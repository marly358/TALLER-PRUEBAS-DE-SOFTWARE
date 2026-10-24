const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
let token = sessionStorage.getItem('cineflex-token');
let movie = null;
let selectedSeat = null;
let routeVersion = 0;
async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, { ...options, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== '/login') clearSession();
    throw new Error(data.message || 'No fue posible completar la solicitud.');
  }
  return data;
}
function clearSession() {
  token = null;
  sessionStorage.removeItem('cineflex-token');
  movie = null;
  selectedSeat = null;
  $('movies').replaceChildren();
  $('seats').replaceChildren();
  $('payment-form').reset();
  for (const id of ['ticket-id', 'ticket-movie', 'ticket-seat', 'ticket-total']) $(id).textContent = '';
  history.replaceState(null, '', '#login');
  show('login');
}
function show(view) {
  for (const name of ['login', 'cartelera', 'reserva', 'ticket']) $(`${name}-view`).hidden = name !== view;
  $('logout').hidden = !token;
}
function navigate(view) {
  if (location.hash === `#${view}`) route();
  else location.hash = view;
}
async function route() {
  const version = ++routeVersion;
  const view = location.hash.slice(1) || 'login';
  if (!token) { history.replaceState(null, '', '#login'); show('login'); return; }
  if (view === 'reserva' && movie) { show('reserva'); return; }
  if (view === 'ticket' && $('ticket-id').textContent) { show('ticket'); return; }
  try {
    const { movies } = await api(`/movies${$('genre').value ? `?genre=${encodeURIComponent($('genre').value)}` : ''}`);
    if (version !== routeVersion || !token) return;
    $('movies').replaceChildren(...movies.map(item => {
      const card = document.createElement('article');
      card.className = 'movie-card'; card.dataset.genre = item.genre;
      const poster = document.createElement('div'); poster.className = `poster poster-${item.id}`;
      const title = document.createElement('b'); title.textContent = item.title; poster.append(title);
      const info = document.createElement('div'); info.className = 'movie-info';
      const genre = document.createElement('p'); genre.className = 'eyebrow'; genre.textContent = item.genre;
      const heading = document.createElement('h2'); heading.textContent = item.title;
      const meta = document.createElement('p'); meta.className = 'movie-meta'; meta.textContent = `${item.duration} min · ${money(item.price)}`;
      const button = document.createElement('button'); button.id = `buy-${item.id}`; button.textContent = 'Elegir asientos →';
      button.onclick = async () => {
        try { movie = item; await loadSeats(); navigate('reserva'); }
        catch (error) { $('catalog-error').textContent = error.message; }
      };
      info.append(genre, heading, meta, button); card.append(poster, info); return card;
    }));
    $('catalog-error').textContent = '';
    history.replaceState(null, '', '#cartelera'); show('cartelera');
  } catch (error) { if (token) { show('cartelera'); $('catalog-error').textContent = error.message; } }
}
async function loadSeats() {
  const { seats } = await api(`/movies/${movie.id}/seats`);
  selectedSeat = null;
  $('selected-seat').textContent = 'Sin seleccionar'; $('pay-button').disabled = true;
  $('payment-form').reset(); $('payment-error').textContent = '';
  $('movie-title').textContent = movie.title;
  $('movie-details').textContent = `${movie.genre} · ${movie.duration} min · Sala ${movie.id}`;
  $('total').textContent = money(movie.price);
  $('seats').replaceChildren(...seats.map(seat => {
    const button = document.createElement('button'); button.id = `seat-${seat.id}`;
    button.className = 'seat'; button.textContent = seat.id; button.disabled = !seat.available;
    button.setAttribute('aria-label', `Asiento ${seat.id}${seat.available ? ' disponible' : ' ocupado'}`);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => {
      for (const other of document.querySelectorAll('.seat')) { other.classList.remove('selected'); other.setAttribute('aria-pressed', 'false'); }
      selectedSeat = seat.id; button.classList.add('selected'); button.setAttribute('aria-pressed', 'true');
      $('selected-seat').textContent = seat.id; $('pay-button').disabled = false;
    };
    return button;
  }));
}
$('login-form').onsubmit = async event => {
  event.preventDefault(); $('login-button').disabled = true; $('login-error').textContent = '';
  try {
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
    token = data.token; sessionStorage.setItem('cineflex-token', token); $('password').value = ''; navigate('cartelera');
  } catch (error) { $('login-error').textContent = error.message; }
  finally { $('login-button').disabled = false; }
};
$('genre').onchange = route;
$('back-cartelera').onclick = () => navigate('cartelera');
$('new-booking').onclick = () => navigate('cartelera');
$('logout').onclick = async () => {
  $('logout').disabled = true;
  try { await api('/logout', { method: 'POST' }); clearSession(); }
  catch (error) { if (token) window.alert(`No se pudo cerrar la sesión: ${error.message}`); }
  finally { $('logout').disabled = false; }
};
$('payment-form').onsubmit = async event => {
  event.preventDefault(); $('pay-button').disabled = true; $('payment-error').textContent = '';
  try {
    const { ticket } = await api('/reservations', { method: 'POST', body: JSON.stringify({ movieId: movie.id, seat: selectedSeat, cardNumber: $('card-number').value }) });
    $('ticket-movie').textContent = ticket.movie; $('ticket-seat').textContent = ticket.seat;
    $('ticket-total').textContent = money(ticket.total); $('ticket-id').textContent = ticket.id;
    $('card-number').value = ''; navigate('ticket');
  } catch (error) { $('payment-error').textContent = error.message; }
  finally { $('pay-button').disabled = !selectedSeat; }
};
window.addEventListener('hashchange', route);
window.addEventListener('pageshow', route);
route();
