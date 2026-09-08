const API_BASE = '';

function sessionToken() {
  return localStorage.getItem('token') || '';
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function buildHeaders(forPost) {
  const headers = {};
  if (forPost) headers['Content-Type'] = 'application/json';
  const t = sessionToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;
  return headers;
}

async function handleSession(res) {
  if (res.status === 401) {
    clearSession();
    try { await fetch(API_BASE + '/api/auth/logout', { method: 'POST' }); } catch (e) {}
    const page = window.location.pathname.split('/').pop() || 'index.html';
    if (page !== 'login.html' && page !== 'index.html') {
      window.location.href = 'login.html?next=' + encodeURIComponent(page);
    }
  }
  return res.status === 204 ? { success: true } : res.json();
}

const api = {
  async get(url) {
    try {
      const res = await fetch(API_BASE + url, { headers: buildHeaders(false), credentials: 'same-origin' });
      return await handleSession(res);
    } catch (e) {
      return { error: e.message };
    }
  },
  async post(url, data) {
    try {
      const res = await fetch(API_BASE + url, {
        method: 'POST',
        headers: buildHeaders(true),
        credentials: 'same-origin',
        body: JSON.stringify(data),
      });
      return await handleSession(res);
    } catch (e) {
      return { error: e.message };
    }
  },
};