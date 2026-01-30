function showSideBar() {
    const sidebar = document.querySelector('.sidebar')
    sidebar.style.display = 'flex'
  }

function hideSideBar() {
    const sidebar = document.querySelector('.sidebar')
    sidebar.style.display = 'none'
  }


const track = document.querySelector(".track");
const slides = Array.from(track.children);
const prevBtn = document.querySelector(".prev");
const nextBtn = document.querySelector(".next");
const dotsNav = document.querySelector(".dots");

let index = 0;

// Create dots
slides.forEach((_, i) => {
  const dot = document.createElement("button");
  if (i === 0) dot.classList.add("active");
  dotsNav.appendChild(dot);
});

const dots = Array.from(dotsNav.children);

function updateCarousel() {
  track.style.transform = `translateX(-${index * 100}%)`;
  dots.forEach(dot => dot.classList.remove("active"));
  dots[index].classList.add("active");
}

nextBtn.onclick = () => {
  index = (index + 1) % slides.length;
  updateCarousel();
};

prevBtn.onclick = () => {
  index = (index - 1 + slides.length) % slides.length;
  updateCarousel();
};

dots.forEach((dot, i) => {
  dot.onclick = () => {
    index = i;
    updateCarousel();
  };
});

// Auto-slide (slow = trust)
setInterval(() => {
  index = (index + 1) % slides.length;
  updateCarousel();
}, 6000);


// const observer = new IntersectionObserver((entries)=>{
//   entries.forEach((entry)=>{
//     if(entry.isIntersecting){
//       console.log(entry.target)
//     }
//   })
// }, {})
// const todoElement = document.querySelector(".about")
// todoElement.forEach(el => observer.observe(el))

// document.querySelector('.js-register').addEventListener('click' , () => {
//   window.location.href="/register.html"
// });

  
// document.querySelector('button').addEventListener('click', () => {
//   window.location.href="/register.html"
// })
