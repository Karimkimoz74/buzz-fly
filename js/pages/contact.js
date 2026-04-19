document.getElementById('contactForm').addEventListener('submit', function(event) {
    event.preventDefault(); 
    let isValid = true;

    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const subjectInput = document.getElementById('subject');
    const messageInput = document.getElementById('message');

    const nameError = document.getElementById('nameError');
    const emailError = document.getElementById('emailError');
    const subjectError = document.getElementById('subjectError');
    const messageError = document.getElementById('messageError');

    const inputs = [nameInput, emailInput, subjectInput, messageInput];
    const errors = [nameError, emailError, subjectError, messageError];
    
    inputs.forEach(input => input.classList.remove('error'));
    errors.forEach(error => error.style.display = 'none');

    const nameValue = nameInput.value.trim();
    const nameWords = nameValue.split(/\s+/); 
    const invalidNameChars = /[^a-zA-Z\u0600-\u06FF\s]/; 
    const repeatedChars = /(.)\1{3,}/; 

    if (nameValue === '') {
        nameInput.classList.add('error');
        nameError.innerText = 'Please enter your name.';
        nameError.style.display = 'block';
        isValid = false;
    } else if (nameWords.length < 2) {
        nameInput.classList.add('error');
        nameError.innerText = 'Please enter your full name (first and last name).';
        nameError.style.display = 'block';
        isValid = false;
    } else if (invalidNameChars.test(nameValue)) {
        nameInput.classList.add('error');
        nameError.innerText = 'Name can only contain letters and spaces.';
        nameError.style.display = 'block';
        isValid = false;
    } else if (repeatedChars.test(nameValue)) {
        nameInput.classList.add('error');
        nameError.innerText = 'Please enter a valid real name.';
        nameError.style.display = 'block';
        isValid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailInput.value.trim() === '') {
        emailInput.classList.add('error');
        emailError.innerText = 'Email address is required.';
        emailError.style.display = 'block';
        isValid = false;
    } else if (!emailRegex.test(emailInput.value.trim())) {
        emailInput.classList.add('error');
        emailError.innerText = 'Please enter a valid email format.';
        emailError.style.display = 'block';
        isValid = false;
    }

    if (subjectInput.value.trim() === '') {
        subjectInput.classList.add('error');
        subjectError.innerText = 'Subject is required.';
        subjectError.style.display = 'block';
        isValid = false;
    }

    if (messageInput.value.trim() === '') {
        messageInput.classList.add('error');
        messageError.innerText = 'Message cannot be empty.';
        messageError.style.display = 'block';
        isValid = false;
    }

    if (isValid) {
        document.getElementById('successModal').classList.add('is-active');
        this.reset(); 
    }
});