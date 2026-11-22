(function () {
  const root = document.getElementById("travel-root");
  if (!root || typeof TRAVEL_DATA === "undefined") return;

  if (TRAVEL_DATA.length === 0) {
    root.innerHTML = '<p class="travel-empty">More photos coming soon.</p>';
    return;
  }

  // Flat list of every photo on the page, in display order, for lightbox prev/next.
  const allPhotos = [];

  TRAVEL_DATA.forEach((trip) => {
    const tripSection = document.createElement("section");
    tripSection.className = "travel-trip";

    const heading = document.createElement("h2");
    heading.textContent = trip.title + (trip.dateLabel ? ` · ${trip.dateLabel}` : "");
    tripSection.appendChild(heading);

    trip.locations.forEach((location) => {
      if (location.title) {
        const locHeading = document.createElement("h3");
        locHeading.className = "travel-location";
        locHeading.textContent = location.title;
        tripSection.appendChild(locHeading);
      }

      const grid = document.createElement("div");
      grid.className = "travel-grid";

      location.photos.forEach((photo) => {
        const index = allPhotos.length;
        allPhotos.push(photo);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "travel-thumb";
        btn.setAttribute("aria-label", "Open photo: " + photo.alt);

        const img = document.createElement("img");
        img.src = photo.thumb;
        img.alt = photo.alt;
        img.loading = "lazy";
        btn.appendChild(img);

        btn.addEventListener("click", () => openLightbox(index));
        grid.appendChild(btn);
      });

      tripSection.appendChild(grid);
    });

    root.appendChild(tripSection);
  });

  // --- lightbox ---
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = lightbox.querySelector(".lightbox-image");
  const lightboxCaption = lightbox.querySelector(".lightbox-caption");
  const closeBtn = lightbox.querySelector(".lightbox-close");
  const prevBtn = lightbox.querySelector(".lightbox-prev");
  const nextBtn = lightbox.querySelector(".lightbox-next");

  let current = -1;

  function openLightbox(index) {
    current = index;
    showCurrent();
    lightbox.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.classList.remove("no-scroll");
  }

  function showCurrent() {
    const photo = allPhotos[current];
    lightboxImage.src = photo.full;
    lightboxImage.alt = photo.alt;
    lightboxCaption.textContent = photo.alt;
  }

  function step(delta) {
    current = (current + delta + allPhotos.length) % allPhotos.length;
    showCurrent();
  }

  closeBtn.addEventListener("click", closeLightbox);
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
})();
