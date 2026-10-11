const form = document.getElementById('authForm');
const errEl = document.getElementById('authError');
const toggleLink = document.getElementById('toggleAuth');
const btn = document.getElementById('authBtn');
let isLogin = true;

toggleLink.addEventListener('click', e => {
  e.preventDefault();
  isLogin = !isLogin;
  btn.textContent = isLogin ? 'LOGIN' : 'REGISTER';
  toggleLink.parentElement.innerHTML = isLogin
    ? 'No account? <a href="#" id="toggleAuth">Register</a>'
    : 'Have account? <a href="#" id="toggleAuth">Login</a>';
  document.getElementById('toggleAuth').addEventListener('click', arguments.callee);
  errEl.textContent = '';
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  errEl.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) return;
  try {
    const res = await fetch('/api/' + (isLogin ? 'login' : 'register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Failed'; return; }
    if (isLogin) window.location.href = '/dashboard.html';
    else { errEl.style.color = '#00d992'; errEl.textContent = 'Registered. Login now.'; isLogin = true; btn.textContent = 'LOGIN'; }
  } catch { errEl.textContent = 'Network error'; }
});

(async () => {
  try {
    const r = await fetch('/api/me');
    if (r.ok) window.location.href = '/dashboard.html';
  } catch {}
})();
