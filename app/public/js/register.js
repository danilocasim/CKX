/**
 * CKX Register page
 */
(function () {
  const form = document.getElementById('registerForm');
  const errorEl = document.getElementById('registerError');

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
      const displayName = document.getElementById('displayName').value.trim() || undefined;
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const passwordConfirm = document.getElementById('passwordConfirm').value;

      if (!email || !password) {
        showError('Please enter email and password.');
        return;
      }
      if (password.length < 8) {
        showError('Password must be at least 8 characters.');
        return;
      }
      if (password !== passwordConfirm) {
        showError('Passwords do not match.');
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await Auth.register(email, password, displayName);
        const token = Auth.getToken();
        if (token) {
          window.location.href = '/auth/set-cookie?token=' + encodeURIComponent(token) + '&redirect=/dashboard';
        } else {
          window.location.href = '/dashboard';
        }
      } catch (err) {
        showError(err.message || 'Registration failed.');
        btn.disabled = false;
      }
    });
  }
})();
