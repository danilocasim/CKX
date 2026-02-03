/**
 * CKX Login page
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect') || '/dashboard';

  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('d-none');
  }

  function hideError() {
    errorEl.classList.add('d-none');
  }

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideError();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) {
        showError('Please enter email and password.');
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await Auth.login(email, password);
        const token = Auth.getToken();
        if (token) {
          window.location.href = '/auth/set-cookie?token=' + encodeURIComponent(token) + '&redirect=' + encodeURIComponent(redirect);
        } else {
          window.location.href = redirect;
        }
      } catch (err) {
        showError(err.message || 'Login failed.');
        btn.disabled = false;
      }
    });
  }
})();
