/** Section navigation (home ↔ info). */

export function initTabs() {
  // Back from info to home
  document.querySelectorAll('[data-back-home]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
      var home = document.getElementById('home');
      if (home) { home.classList.add('active'); }
    });
  });
}
