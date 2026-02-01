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

// const form = document.getElementById('mentorForm');
// const name = document.getElementById('fname');
// const email = document.getElementById('email');
// const work = document.getElementById('work');
// const phone = document.getElementById('phone');


// form.addEventListener('submit', e => {
//   e.preventDefault();

//   validateInputs();
// });

// const setError = (element, message) => {
//   const inputControl = element.parentElement;
//   const errorDisplay = inputControl.querySelector('.error');

//   errorDisplay.innerText = message;
//   inputControl.classlist.add('error');
//   inputControl.classlist.remove('success')
// }

// const setSuccess = element => {
//   const inputControl = element.parentElement;
//   const errorDisplay = inputControl.querySelector('.error');
  
//   errorDisplay.innerText = '';
//   inputControl.classlist.add('success')
//   inputControl.classList.remove('error')
// }

// const isValidEmail =  email => {
//   const re = "[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$"
//   return re.test(string(email).toLowerCase());
// }

// const validateInputs = () => {
//   const nameValue = fname.value.trim();
//   const emailValue = email.value.trim();
//   const workValue = work.value.trim();
//   const phoneValue = phone.value.trim();

//   if(nameValue === '') {
//     setError(fname, 'Full Name Is Required');
//   } else {
//     setSuccess(fname)
//   }

//   if(emailValue === '') {
//     setError(email, 'Valid e-mail address required')
//   } else if(!isValidEmail(emailValue)) {
//     setError(email, 'Provide a valid email address')
//   } else {
//     setSuccess(email);
//   }

//   if(workValue === '') {
//     setError(work, 'Occupation required')
//   } else {
//     setSuccess(work)
//   }

//   if(phoneValue === '') {
//     setError(phone, 'Phone-Number is required');
//   } else if (phoneValue.length >1 <11) {
//     setError(phone, 'Phone-Number must not be less than 11 characters')
//   } else {
//     setSuccess(phone);
//   }
// }


// window.addEventListener("scroll", function() {
//   const reveals = document.querySelectorAll(".reveal");

//   reveals.forEach(reveal => {
//     const windowHeight = window.innerHeight;
//     const elementTop = reveal.getBoundingClientRect().top;
//     const revealPoint = 100;

//     if (elementTop < windowHeight - revealPoint) {
//       reveal.classList.add("active");
//     }
//   });
// });



// const reveals = document.querySelector('.reveal');
// const observer = new IntersectionObserver(entries => {
//   entries.forEach(entry => {
//     if (entry.isIntersecting) {
//       entry.target.classlist.add('show')
//     }
//   });
// });

reveals.forEach(el => observer.observe(el));
