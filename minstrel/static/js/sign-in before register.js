import { checkAuthentication, checkInvite, navigatePage, base_url } from './app.js';

let state = "account";
let email = null;
let username = null;
let password = null;
let input = document.getElementById('input');
const statusMessage = document.querySelector('.status-message');

export async function load() {
    try {
        const isAuthenticated = await checkAuthentication();
        if (isAuthenticated) {
            navigatePage(window.location.pathname.substring(1) || 'home');
        }

        // If not authenticated, check invite status
        const inviteVerified = await checkInvite();
        if (!inviteVerified) {
            navigatePage('invite');
        }
    } catch (error) {
        console.error('Error checking authentication:', error);
        navigatePage('invite');
    }

    bindEvents();
}

function bindEvents() {
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            proceedSignIn();
        }
    });

    document.getElementById('next-button').addEventListener('click', proceedSignIn);

    input.addEventListener('input', function () {
        if (state == "account") {
            statusMessage.style.visibility = "hidden";
        }
    });
}



function proceedSignIn() {
    switch (state) {
        case "account":
            if (checkEmail(input.value)) {
                email = input.value;
                console.log("Entered email");
                showPasswordInput();
            } else {
                if (checkUsername(input.value)) {
                    username = input.value
                    console.log("Entered username");
                    showPasswordInput();
                }
                }
            break;

        case "password":
            if (checkPassword(input.value)) {
                //make sure characters are unicode/utf-8
                password = input.value;
                //console.log('Account:', username, 'Password:', password);
                submitLogin();

            } else {
                //show verification;
            }
            break;
    }
};



function validateEmailFormat(emailInput) {
    const re = /^[\p{L}\p{N}._-]+@[\p{L}\p{N}._-]+\.[\p{L}\p{N}]{2,}$/u;
    return re.test(String(emailInput).toLowerCase());
}

function checkEmail(emailInput) {
    if (!validateEmailFormat(emailInput)) {
        return false;
    }

    if (emailInput.length < 3 || emailInput.length > 320) {
        statusMessage.textContent = "Enter a valid email or username";
        statusMessage.style.visibility = "visible";
        return false;
    }
    else {
        statusMessage.style.visibility = "hidden";
        return true;
    }
}

function checkUsername(usernameInput) {
    if (usernameInput.length < 3 || usernameInput.length > 320) {
        statusMessage.textContent = "Enter a valid email or username";
        statusMessage.style.visibility = "visible";
        showAccountInput();
        return false;
    }
    else {
        return true;
    }
}
function showAccountInput() {
    input.value = "";
    input.type = "text";
    document.getElementById('entry-label').textContent = "Email or Username:";
    input.setAttribute('aria-label', 'Email or Username');
    state = "account";
}

function showPasswordInput() {
    const postText = document.querySelector('.post-text');
    //const inputContainer = document.querySelector('.input-container');
    document.getElementById('input').value = "";
    document.getElementById('input').type = "password";
    document.getElementById('entry-label').textContent = "Password:";
    postText.style.visibility = 'hidden';
    input.setAttribute('aria-label', 'Password');

    state = "password";
}

function checkPassword(passwordInput) {
    if (passwordInput.length < 8) {
        statusMessage.textContent = "Account passwords are at least 8 characters long";
        statusMessage.style.visibility = "visible";
        return false;
    } else {
        return true;
    }
}

async function submitLogin() {
    const url = `${base_url}/sign-in/`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: email, username: username, password: password })
        });
        if (!response.ok) {
            statusMessage.textContent = "Invalid login details";
            console.error('Invalid login');
            input.text
            statusMessage.style.visibility = "visible";
            showAccountInput();
            throw new Error(`HTTP status code: ${response.status}`);
        }
    } catch (error) {
        console.error('Error processing sign-in', error);
        statusMessage.textContent = "Failed to process request. Please try again.";
        statusMessage.style.visibility = "visible";
        return false;
    }
}

function navigateToSignUp() {
    window.location.href = '/sign-in';
}

function navigateToForgotPassword() {
    window.location.href = '/forgot-password';
}



document.addEventListener('AppleIDSignInOnSuccess', (event) => {
    // Handle successful response.
    console.log(event.detail.data);

    const endpoint = 'https://minstrelai.com/third-party-login-apple';
    sendThirdPartyIdData(endpoint, event.detail.data)
});


document.addEventListener('AppleIDSignInOnFailure', (event) => {
    // Handle error.
    console.log(event.detail.error);
});

async function sendThirdPartyIdData(endpoint, data) {
    try {
        // Send the data using fetch
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        // Process the response
        if (response.ok) {
            const responseData = await response.json();
            console.log('Sent 3rd Party  ', responseData);
        } else {
            console.error('Login failed:', response.status);
        }
    } catch (error) {
        console.error('Error during fetch:', error);
    }
}
