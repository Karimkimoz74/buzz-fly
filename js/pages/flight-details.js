/* flight-details.js — page-specific interactions only */

document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('bookBtn')?.addEventListener('click', () => {
    window.location.href = '/pages/confirm-payment.html';
  });

});
