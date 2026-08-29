document.addEventListener("DOMContentLoaded", () => {
  // 1. Create Scroll Progress Bar
  const progressContainer = document.createElement("div");
  progressContainer.className = "scroll-progress-container";
  const progressBar = document.createElement("div");
  progressBar.className = "scroll-progress-bar";
  progressContainer.appendChild(progressBar);
  document.body.appendChild(progressContainer);

  window.addEventListener("scroll", () => {
    const winScroll = document.documentElement.scrollTop || document.body.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
    progressBar.style.width = scrolled + "%";
  });

  // 2. Intersection Observer for Scroll Reveals
  const revealOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
  };

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target); // Trigger only once
      }
    });
  }, revealOptions);

  // Bind reveal observers
  document.querySelectorAll(".reveal, .reveal-scale, .stagger-container").forEach(el => {
    revealObserver.observe(el);
  });

  // 3. Text split reveal for main titles
  document.querySelectorAll(".animate-title").forEach(title => {
    const words = title.innerText.split(" ");
    title.innerHTML = "";
    words.forEach((word, index) => {
      const container = document.createElement("span");
      container.className = "split-word-container";
      
      const wordSpan = document.createElement("span");
      wordSpan.className = "split-word";
      wordSpan.innerText = word + " ";
      wordSpan.style.setProperty("--delay", `${index * 0.1}s`);
      
      container.appendChild(wordSpan);
      title.appendChild(container);
    });
    // Add title itself to observer to trigger split animation
    revealObserver.observe(title);
  });
});
