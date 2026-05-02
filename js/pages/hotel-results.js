/* =====================================================
   Buzz Fly — hotel-results.js
   Behaviors specific to the hotel-results page.
   ===================================================== */

document.querySelectorAll(".fav-btn").forEach(function (button) {
  button.addEventListener("click", function () {
    button.classList.toggle("is-active");

    const icon = button.querySelector("img");
    if (button.classList.contains("is-active")) {
      icon.src = "../assets/icons/favorite.svg";
    } else {
      icon.src = "../assets/icons/favorite_outline.svg";
    }
  });
});
