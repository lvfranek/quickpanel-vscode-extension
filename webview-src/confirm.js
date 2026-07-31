/** Custom confirm modal. */

let modalResolve = null;

export function showConfirm(title, body) {
  return new Promise(function (resolve) {
    modalResolve = resolve;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('confirm-modal').classList.remove('hidden');
  });
}

export function initConfirm() {
  document.getElementById('modal-confirm').onclick = function () {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (modalResolve) { modalResolve(true); modalResolve = null; }
  };
  document.getElementById('modal-cancel').onclick = function () {
    document.getElementById('confirm-modal').classList.add('hidden');
    if (modalResolve) { modalResolve(false); modalResolve = null; }
  };
  document.getElementById('confirm-modal').addEventListener('click', function (e) {
    if (e.target === document.getElementById('confirm-modal')) {
      document.getElementById('confirm-modal').classList.add('hidden');
      if (modalResolve) { modalResolve(false); modalResolve = null; }
    }
  });
}
