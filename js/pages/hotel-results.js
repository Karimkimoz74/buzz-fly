document.querySelectorAll(".fav-btn").forEach(function (button) {
  button.addEventListener("click", function () {
    button.classList.toggle("is-active");

    const icon = button.querySelector("img");
    icon.src = button.classList.contains("is-active")
    ?"../assets/icons/favorite.svg":"../assets/icons/favorite_outline.svg";
  });
});


document.querySelector(".newsletter-form").addEventListener("submit", function (event) {
    event.preventDefault();
});