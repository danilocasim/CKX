/**
 * CKX Navigation - updates nav based on auth state
 * Requires auth.js and a container with id="nav-auth"
 */
const Nav = {
  async init() {
    const navContainer = document.getElementById('nav-auth');
    if (!navContainer) return;

    if (typeof Auth !== 'undefined' && Auth.isAuthenticated()) {
      try {
        const user = await Auth.getUser();
        if (user) {
          navContainer.innerHTML =
            '<a href="/dashboard" class="nav-link">Account</a>' +
            ' <button type="button" onclick="Auth.logout()" class="btn btn-login ms-2" style="padding: 0.4rem 1rem;">Sign Out</button>';
        } else {
          Auth.clearTokens();
          this.showUnauthenticated(navContainer);
        }
      } catch (e) {
        Auth.clearTokens();
        this.showUnauthenticated(navContainer);
      }
    } else {
      this.showUnauthenticated(navContainer);
    }
  },

  showUnauthenticated(container) {
    container.innerHTML = '<a href="/login" class="btn btn-login">Sign In</a>';
  },
};

document.addEventListener('DOMContentLoaded', function () {
  if (typeof Nav !== 'undefined') Nav.init();
});
