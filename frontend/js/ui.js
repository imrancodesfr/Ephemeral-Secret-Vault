// Shared UI helpers: toasts, user session, ID copy, list pickers

function ensureToastContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

export function toast(message, type = 'success', duration = 4000) {
  const c = ensureToastContainer();
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  el.onclick = () => el.remove();
  c.appendChild(el);
  setTimeout(() => { el.remove(); }, duration);
}

export function getUser() {
  // A session is only "logged in" when we hold both the user object and the token.
  if (!localStorage.getItem('token')) return null;
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export function getToken() {
  return localStorage.getItem('token') || '';
}

// Gate for protected pages: redirect to login when there is no session.
export function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

export function signOut() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  try { fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  window.location.href = 'login.html';
}

export async function requireLogin(elemId) {
  const user = getUser();
  if (!user) {
    toast('Please sign in first (login.html)', 'error');
    return null;
  }
  const el = document.getElementById(elemId);
  if (el) el.value = user.id;
  return user;
}

export function copyText(text) {
  if (!text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Copied: ' + text, 'info', 1500));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied: ' + text, 'info', 1500);
  }
}

export function idWithCopy(id, labelPrefix) {
  if (!id) return '';
  const label = id.length > 18 ? id.slice(0, 9) + '…' + id.slice(-6) : id;
  return '<span class="id-copy" onclick="window.__copy(\'' + id + '\')" title="click to copy">' + (labelPrefix || '') + label + '</span>';
}

export function showBanner(elemId, message, ok) {
  const b = document.getElementById(elemId);
  if (!b) return;
  b.className = 'msg-banner show ' + (ok ? 'ok' : 'bad');
  b.textContent = message || (ok ? 'Success' : 'Something went wrong');
}

export function handleError(elemId, res, fallback) {
  const msg = (res && res.error) || fallback || 'Something went wrong';
  showBanner(elemId, msg, false);
  toast(msg, 'error');
}

export function handleSuccess(elemId, msg) {
  showBanner(elemId, msg, true);
  toast(msg, 'success');
}
