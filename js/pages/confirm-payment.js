/* confirm-payment.js — page-specific interactions only */

document.addEventListener('DOMContentLoaded', () => {

  // Auto-format card number: spaces every 4 digits
  document.getElementById('cardNumber')?.addEventListener('input', function () {
    this.value = this.value
      .replace(/\D/g, '')
      .replace(/(.{4})/g, '$1 ')
      .trim()
      .slice(0, 19);
  });

  // Auto-format expiry MM / YY
  document.getElementById('expiry')?.addEventListener('input', function () {
    let val = this.value.replace(/\D/g, '');
    if (val.length >= 3) val = val.slice(0, 2) + ' / ' + val.slice(2, 4);
    this.value = val;
  });

  // Complete booking — validate then redirect
  document.getElementById('completeBtn')?.addEventListener('click', () => {
    const fields = ['firstName', 'lastName', 'email', 'cardNumber', 'expiry', 'cvv'];
    let valid = true;

    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) {
        el.classList.add('is-invalid');
        valid = false;
      } else {
        el.classList.remove('is-invalid');
      }
    });

    if (valid) window.location.href = '/pages/booking-confirmation.html';
  });

  // Remove invalid state on input
  document.querySelectorAll('.form-control').forEach(input => {
    input.addEventListener('input', () => input.classList.remove('is-invalid'));
  });

});
