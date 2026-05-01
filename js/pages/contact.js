/* =====================================================
   Buzz Fly — contact.js
   Form validation + success modal for the contact page.
   Uses Bootstrap's .is-invalid + .invalid-feedback classes
   and Bootstrap's modal component (no custom modal CSS).
   ===================================================== */

document.getElementById("contactForm").addEventListener("submit", function (event) {
  event.preventDefault();
  let isValid = true;

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const subjectInput = document.getElementById("subject");
  const messageInput = document.getElementById("message");

  const nameError = document.getElementById("nameError");
  const emailError = document.getElementById("emailError");
  const subjectError = document.getElementById("subjectError");
  const messageError = document.getElementById("messageError");

  // Reset previous validation state
  const inputs = [nameInput, emailInput, subjectInput, messageInput];
  inputs.forEach(function (input) {
    input.classList.remove("is-invalid");
  });

  // --- Name validation ---
  const nameValue = nameInput.value.trim();
  const nameWords = nameValue.split(/\s+/);
  const invalidNameChars = /[^a-zA-Z؀-ۿ\s]/;
  const repeatedChars = /(.)\1{3,}/;

  if (nameValue === "") {
    nameInput.classList.add("is-invalid");
    nameError.innerText = "Please enter your name.";
    isValid = false;
  } else if (nameWords.length < 2) {
    nameInput.classList.add("is-invalid");
    nameError.innerText = "Please enter your full name (first and last name).";
    isValid = false;
  } else if (invalidNameChars.test(nameValue)) {
    nameInput.classList.add("is-invalid");
    nameError.innerText = "Name can only contain letters and spaces.";
    isValid = false;
  } else if (repeatedChars.test(nameValue)) {
    nameInput.classList.add("is-invalid");
    nameError.innerText = "Please enter a valid real name.";
    isValid = false;
  }

  // --- Email validation ---
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailInput.value.trim() === "") {
    emailInput.classList.add("is-invalid");
    emailError.innerText = "Email address is required.";
    isValid = false;
  } else if (!emailRegex.test(emailInput.value.trim())) {
    emailInput.classList.add("is-invalid");
    emailError.innerText = "Please enter a valid email format.";
    isValid = false;
  }

  // --- Subject validation ---
  if (subjectInput.value.trim() === "") {
    subjectInput.classList.add("is-invalid");
    subjectError.innerText = "Subject is required.";
    isValid = false;
  }

  // --- Message validation ---
  if (messageInput.value.trim() === "") {
    messageInput.classList.add("is-invalid");
    messageError.innerText = "Message cannot be empty.";
    isValid = false;
  }

  // --- Show Bootstrap success modal on valid submit ---
  if (isValid) {
    const modalEl = document.getElementById("successModal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
    this.reset();
  }
});
