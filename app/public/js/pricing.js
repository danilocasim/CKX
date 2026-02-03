/**
 * CK-X Pricing Page JavaScript
 */

document.addEventListener('DOMContentLoaded', function () {
  // Check authentication status
  checkAuthStatus();

  // Initialize button handlers
  initializeButtons();
});

/**
 * Check if user is authenticated
 */
async function checkAuthStatus() {
  // Nav.js populates nav-auth; only update loginBtn if still present (e.g. before nav runs)
  const loginBtn = document.getElementById('loginBtn');
  const token = localStorage.getItem('accessToken');
  if (!token) return;
  try {
    const response = await fetch('/sailor-client/api/v1/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok && loginBtn) {
      const data = await response.json();
      loginBtn.textContent =
        data.data.displayName || data.data.email.split('@')[0];
      loginBtn.href = '/dashboard';
      loginBtn.classList.remove('btn-login');
      loginBtn.classList.add('btn-profile');
    } else if (!response.ok) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  } catch (error) {
    console.error('Auth check failed:', error);
  }
}

/**
 * Initialize button click handlers
 */
function initializeButtons() {
  // Try Free button
  const tryFreeBtn = document.querySelector('.btn-try');
  if (tryFreeBtn) {
    tryFreeBtn.addEventListener('click', function () {
      // Redirect to home page to try mock exam
      window.location.href = '/?mock=true';
    });
  }

  // Buy buttons
  const buyButtons = document.querySelectorAll('.btn-buy');
  buyButtons.forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.preventDefault();

      // Check if user is logged in
      const token = localStorage.getItem('accessToken');
      if (!token) {
        // Show login modal or redirect to login
        showAuthModal();
        return;
      }

      // Get pass type from parent card
      const card = this.closest('.pricing-card');
      const passName = card.querySelector('.pass-name').textContent;

      let passType = '38_hours';
      if (passName.includes('1 Week')) {
        passType = '1_week';
      } else if (passName.includes('2 Weeks')) {
        passType = '2_weeks';
      }

      // Redirect to checkout
      initiateCheckout(passType);
    });
  });
}

/**
 * Show authentication modal
 */
function showAuthModal() {
  window.location.href = '/login?redirect=' + encodeURIComponent('/pricing');
}

/**
 * Initiate Stripe checkout
 * @param {string} passTypeId - Type of pass to purchase (e.g., '38_hours', '1_week', '2_weeks')
 */
async function initiateCheckout(passTypeId) {
  try {
    const token = localStorage.getItem('accessToken');
    const response = await fetch('/sailor-client/api/v1/billing/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ passTypeId }),
    });

    if (response.ok) {
      const data = await response.json();
      // Redirect to Stripe checkout
      if (data.data.url) {
        window.location.href = data.data.url;
      }
    } else {
      const error = await response.json();
      alert(error.message || 'Failed to initiate checkout');
    }
  } catch (error) {
    console.error('Checkout error:', error);
    alert('Failed to initiate checkout. Please try again.');
  }
}

/**
 * Animate stats counter
 */
function animateCounter(element, target, duration = 2000) {
  let start = 0;
  const increment = target / (duration / 16);

  function updateCounter() {
    start += increment;
    if (start < target) {
      element.textContent = Math.floor(start).toLocaleString() + '+';
      requestAnimationFrame(updateCounter);
    } else {
      element.textContent = target.toLocaleString() + '+';
    }
  }

  updateCounter();
}

// Animate user count on page load
const usersCount = document.getElementById('usersCount');
if (usersCount) {
  // Start animation when element is in view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(usersCount, 2500, 1500);
        observer.unobserve(entry.target);
      }
    });
  });
  observer.observe(usersCount);
}
