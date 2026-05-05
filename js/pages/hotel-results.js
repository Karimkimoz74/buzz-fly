const hotels = [
  {
    image: "../assets/images/dest-kyoto.png",
    title: "The Emerald Peak Resort",
    rating: "4.9",
    location: "Vitznau, Switzerland",
    price: "540",
    badge: "Eco-Luxe"
  },
  {
    image: "../assets/images/dest-paris.png",
    title: "Haus of Glass",
    rating: "4.8",
    location: "Lucerne City Center",
    price: "320",
    badge: "Design Member"
  },
  {
    image: "../assets/images/dest-ubud.png",
    title: "The Heritage Grand",
    rating: "5.0",
    location: "Weggis Waterfront",
    price: "610",
    badge: "Top Rated"
  },
  {
    image: "../assets/images/dest-zermatt.png",
    title: "Alpine Wellness Spa",
    rating: "4.7",
    location: "Rigi Kaltbad, Switzerland",
    price: "285",
    badge: ""
  },
  {
    image: "../assets/images/hero-islands.png",
    title: "Lakeside Atelier",
    rating: "4.9",
    location: "Meggen, Switzerland",
    price: "415",
    badge: "Hidden Gem"
  },
  {
    image: "../assets/images/stay-amaya.png",
    title: "Villa Azure Lucerne",
    rating: "4.6",
    location: "Hergiswil, Switzerland",
    price: "780",
    badge: ""
  }
];




const container = document.getElementById("cards-container");

hotels.forEach(hotel => {
  container.innerHTML += createHotelCard(hotel);
});



//                                                       var
document.querySelectorAll(".fav-btn").forEach(function (button) {  // querySelectorAll -> NodeList (zay el array)
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





function createHotelCard({
  image,
  title,
  rating,
  location,
  price,
  badge = ""
}) {
  return `
    <div class="col-md-6 col-lg-4">
      <article class="card h-100 border-0 rounded-4 overflow-hidden shadow-sm">

        <div class="position-relative rounded-4 overflow-hidden" style="height: 255px;">
          
          <img src="${image}" class="w-100 h-100 object-fit-cover">

          ${badge ? `
          <span class="position-absolute top-0 start-0 m-3 px-3 py-1 rounded-pill text-uppercase fw-bold glass-badge text-green" style="font-size: 0.8rem;">
            ${badge}
          </span>` : ""}

          <button class="fav-btn position-absolute top-0 end-0 m-3 p-2 rounded-circle border-0 d-flex align-items-center justify-content-center glass-badge shadow-sm">
            <img src="../assets/icons/favorite_outline.svg" style="width: 16px; height: 16px;">
          </button>

        </div>

        <div class="card-body p-4 d-flex flex-column">

          <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
            <h2 class="card-title m-0 fs-3 fw-bold">${title}</h2>

            <span class="rating-badge d-inline-flex align-items-center gap-1 px-2 py-1 rounded fw-bold small text-nowrap bg-light-green">
              <img src="../assets/icons/star.svg" class="icon-sm" alt="">${rating}
            </span>
          </div>

          <p class="d-flex align-items-center gap-1 text-muted small mb-3">
            <img src="../assets/icons/location.svg" style="width: 15px; height: 15px;">
            ${location}
          </p>

          <div class="d-flex justify-content-between align-items-center mt-auto">
            <div class="d-flex align-items-baseline gap-1">
              <strong class="fs-3">$${price}</strong>
              <span class="text-muted small">/night</span>
            </div>

            <a class="btn green-btn px-4" href="../../pages/hotel-details.html">View Deal</a>
          </div>

        </div>

      </article>
    </div>
  `;
}