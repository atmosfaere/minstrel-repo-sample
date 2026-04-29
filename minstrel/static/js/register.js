import { checkAuthentication, checkInvite, navigatePage, baseUrl } from './app.js';

let state = "email";
let email = null;
let username = null;
let password = null;
let input = null;
let statusMessage = null;
let postText = null;
let thirdParty = false;
let identifier = null;
let urlParams = null;
let thirdPartyRedirect = null;

//use secure cookie for thirdpartyjwt
if (thirdPartyRedirect) {
    thirdParty = true;
    state = "username";
    showUsernameInput();
}

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

    input = document.getElementById('input');
    statusMessage = document.querySelector('.status-message');
    postText = document.querySelector('.post-text');
    urlParams = new URLSearchParams(window.location.search);
    thirdPartyRedirect = urlParams.get('thirdPartyRedirect');
    bindEvents();
}

function bindEvents() {

    document.getElementById('next-button').addEventListener('click', async function () {
        switch (state) {
            case "email":
                checkEmail(input.value).then(isValid => {
                    if (isValid) {
                        email = input.value;
                        console.log("Email valid and available");
                        showUsernameInput();
                    } else {
                        console.log("Email validation failed");
                        //showEmailInput();
                    }
                });
                break;

            case "username":
                //continue with registration if no issues with username
                checkUsername(input.value).then(isValid => {
                    if (isValid) {
                        username = input.value;
                        console.log("Username valid and available");
                        if (thirdParty === false) {
                            showPasswordInput();
                        } else {
                            createAccount(null);
                        }
                    }
                    else {
                        //showUsernameInput();
                    }
                });
                break;
            case "password":
                if (checkPassword(input.value)) {
                    //make sure characters are unicode/utf-8
                    password = input.value;
                    //console.log('Username:', username, 'Password:', password);
                    //showValidationInput();
                    if (await createAccount()) {
                        console.log('account created');
                        navigatePage('home');
                    }

                } else {
                    //show verification;
                }

                break;
            case "validate":
                createAccount(input.value);
                break;
        }
    });

    const signInLink = document.getElementById('sign-in-link');
    if (signInLink) {
        signInLink.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent the default anchor behavior
            navigatePage('sign-in');
        });
    }
}




function showEmailInput() {
    //Not currently being used, already in html
    document.getElementById('page-label').textContent = "Create Account";
    document.getElementById('entry-label').textContent = "Email:";
    input.setAttribute('aria-label', 'Email');
    state = "email";
}
function showUsernameInput() {
    //hide user agreement and third party logins
    hideAltLogin()
    postText.innerHTML = 'Choose a unique username to represent you on our platform.'
    document.getElementById('input').value = "";
    document.getElementById('page-label').textContent = "Choose a Username";
    document.getElementById('entry-label').textContent = "Username:";
    input.setAttribute('aria-label', 'Username');
    state = "username";
}

function showPasswordInput() {
    const inputContainer = document.querySelector('.input-container');
    //prevent creation of another verification field 
    removePasswordVerify();
    postText.innerHTML = 'Your password must contain at least 8 characters, including one uppercase letter, one lowercase letter, one number, and one special character.'

    document.getElementById('input').value = "";
    document.getElementById('input').type = "password";
    document.getElementById('page-label').textContent = "Create a Password";
    document.getElementById('entry-label').textContent = "Password:";

    var verifyContainer = inputContainer.cloneNode(true);
    verifyContainer.id = "verify-container"; // Assign a new ID to avoid conflicts

    // Find elements within the cloned container
    var verifyInput = verifyContainer.querySelector('.registration-field');
    verifyInput.id = "verify-password";
    verifyInput.type = "password";
    //verifyInput.placeholder = "Verify Password";
    verifyInput.value = ""; // Ensure the cloned input is empty

    var verifyButton = verifyContainer.querySelector('.next-button');
    verifyButton.style.visibility = "hidden"; // Hide the button initially

    var verifyLabel = document.createElement('p');
    verifyLabel.className = "entry-label";
    verifyLabel.id = "verify-label";
    verifyLabel.textContent = "Verify Password:";

    inputContainer.insertAdjacentElement('afterend', verifyLabel);
    verifyLabel.insertAdjacentElement('afterend', verifyContainer);

    input.setAttribute('aria-label', 'Password');
    verifyInput.setAttribute('aria-label', 'Verify Password');

    state = "password";
}

function showValidationInput() {
    removePasswordVerify();
    var button = document.querySelector('.next-button');
    button.textContent = 'Verify';
    postText.innerHTML = '';
    document.getElementById('input').value = "";
    document.getElementById('input').style.width = "30%";
    document.getElementById('input').type = 'text'
    removePasswordVerify();
    document.getElementById('page-label').textContent = "Verify your Email";
    document.getElementById('entry-label').textContent = "Please click on the link in the email that was sent to " + email + " OR enter your confirmation code here";
    document.getElementById('entry-label').style.fontSize = '14px';
    input.setAttribute('aria-label', 'Enter Code');
    state = "validate";
}

function removePasswordVerify() {
    var existingVerify = document.getElementById("verify-container");
    if (existingVerify) {
        existingVerify.remove();
    }
    var verifyLabel = document.getElementById("verify-label");
    if (verifyLabel) {
        verifyLabel.remove();
    }
}

function validateEmailFormat(email) {
    const re = /^[\p{L}\p{N}._-]+@[\p{L}\p{N}._-]+\.[\p{L}\p{N}]{2,}$/u;
    return re.test(String(email).toLowerCase());
}

async function checkEmail(email) {
    if (!validateEmailFormat(email)) {
        statusMessage.textContent = "Enter a valid email address";
        statusMessage.style.visibility = "visible";
        return false;
    }
    const url = `${baseUrl}/email-availability`;
    if (!await checkAvailability(email, url, 'email')) {
        return false;
    }
    if (email < 3 || email > 320) {
        statusMessage.textContent = "Enter a valid email address";
        statusMessage.style.visibility = "visible";
        return false;
    }
    else {
        statusMessage.style.visibility = "hidden";
        return true;
    }
}

function validateUsername(username) {
    const pattern = /^[a-zA-Z0-9_-]+$/;

    if (username.length < 3 || username.length > 25) {
        statusMessage.textContent = "Username must be between 3 and 25 characters.";
        statusMessage.style.visibility = "visible";
        return false;
    }

    if (!pattern.test(username)) {
        statusMessage.textContent = "Username contains invalid characters.";
        statusMessage.style.visibility = "visible";
        return false;
    }
    return true;
}

async function checkUsername(username) {
    //toggle censorship of usernames, also option in world settings.
    if (!validateUsername(username)) {
        return false;
    }
    const url = `${baseUrl}/username-availability`;
    if (!await checkAvailability(username, url, 'username')) {
        return false;
    } else {
        statusMessage.style.visibility = "hidden";
        return true;
    }
}

async function checkAvailability(input, url, type) {
    //const url = 'http://minstrelai.com/username-availability/';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ [type]: input })
        });
        if (!response.ok) {
            throw new Error(`HTTP status code: ${response.status}`);
        }
        const data = await response.json();
        const isAvailable = data.hasOwnProperty('available') ? data.available : null;
        if (isAvailable === false) {
            statusMessage.textContent = `${type === 'email' ? 'Email' : 'Username'} is not available`;
            statusMessage.style.visibility = "visible";
            return false;
        } else if (isAvailable === null) {
            statusMessage.textContent = "Server error, invalid response";
            statusMessage.style.visibility = "visible";
            console.error('The server response did not contain the "available" property:', data);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error during availability check:', error);

        // Check if the error is a network error or a server error
        if (error.message.includes("Failed to fetch")) {
            statusMessage.textContent = "Connection error";
        } else if (error.message.startsWith("HTTP status")) {
            statusMessage.textContent = "Server error, please try again later";
        } else {
            statusMessage.textContent = "Unexpected error, please try again";
        }

        statusMessage.style.visibility = "visible";
        return false;
    }
}

function checkPassword() {
    const password = document.getElementById('input').value;
    const verifyPassword = document.getElementById('verify-password').value;

    if (password.length < 8) {
        statusMessage.textContent = "Password must be at least 8 characters long";
        statusMessage.style.visibility = "visible";
        return false;
    }

    if (password.length > 128) {
        statusMessage.textContent = "Password must be less than 128 characters";
        statusMessage.style.visibility = "visible";
        return false;
    }

    // Check for a number
    if (!/\d/.test(password)) {
        statusMessage.textContent = "Password must include at least one number";
        statusMessage.style.visibility = "visible";
        return false;
    }

    // Check for a lowercase letter
    if (!/[a-z]/.test(password)) {
        statusMessage.textContent = "Password must include at least one lowercase letter";
        statusMessage.style.visibility = "visible";
        return false;
    }

    // Check for an uppercase letter
    if (!/[A-Z]/.test(password)) {
        statusMessage.textContent = "Password must include at least one uppercase letter";
        statusMessage.style.visibility = "visible";
        return false;
    }

    // Check for a special character (any character that isn't a letter or number)
    if (!/[^\w]/.test(password)) {
        statusMessage.textContent = "Password must include at least one special character";
        statusMessage.style.visibility = "visible";
        return false;
    }



    if (password !== verifyPassword) {
        statusMessage.textContent = "Passwords don't match";
        statusMessage.style.visibility = "visible";
        return false;

    } else {
        statusMessage.style.visibility = "hidden";
        return true;
    }
}

async function checkValidationCode(code) {
    const url = `${baseUrl}/verify-email`;

    // Prepare the request options
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: code })
    };

    try {
        const response = await fetch(url, requestOptions);
        const data = await response.json();

        if (!response.ok) {
            throw new Error('Error validating code: ' + response.statusText);
        }

        if (data.success) {
            console.log('Validation successful:', data.message);
            return true;
        } else {
            statusMessage.textContent = "Invalid Code";
            statusMessage.style.visibility = "visible";
            console.error('Validation failed:', data.message);
            return false;
        }
    } catch (error) {
        console.error('Error verifying code:', error);
        let errorMessage = error.message.includes("Failed to fetch") ?
            "Error validating code: connection error" :
            error.message;
        statusMessage.textContent = errorMessage;
        statusMessage.style.visibility = "visible";
    }
}
//verify 3rd party jwt and get account details at account creation if 3rd party not succesful go back, don't show username
function continueThirdParty(sub, providedEmail) {
    if (email !== null) {
        email = providedEmail;
    }
    identifier = sub
    thirdParty = true;
    //if null don't create entry in s3
    showUsernameInput();

}

async function createAccount(entered_code) {
    const url = `${baseUrl}/create-account`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, username, password, identifier })
        });
        if (!response.ok) {
            throw new Error(`HTTP status code: ${response.status}`);
        }
        const data = await response.json();
        if (!data) {
            statusMessage.textContent = `Couldn't create account`;
            statusMessage.style.visibility = "visible";
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error during availability check:', error);

        // Check if the error is a network error or a server error
        if (error.message.includes("Failed to fetch")) {
            statusMessage.textContent = "Connection error";
        } else if (error.message.startsWith("HTTP status")) {
            statusMessage.textContent = "Server error, please try again later";
        } else {
            statusMessage.textContent = "Unexpected error, please try again";
        }

        statusMessage.style.visibility = "visible";
        return false;
    }
    window.location.href = '/home';

}

function navigateToSignIn() {
    window.location.href = '/sign-in';
}

function hideAltLogin() {
    // Select and hide the login divider
    const loginDivider = document.querySelector('.login-divider');
    if (loginDivider) {
        loginDivider.style.display = 'none';
    }

    // Select and hide all login buttons
    const loginButtons = document.querySelectorAll('.login-button');
    loginButtons.forEach(button => {
        button.style.display = 'none';
    });

    // Select and hide the agreement paragraph
    const agreement = document.querySelector('.agreement');
    if (agreement) {
        agreement.style.display = 'none';
    }
}

document.addEventListener('AppleIDSignInOnSuccess', (event) => {
    // Handle successful response.
    console.log(event.detail.data);
});


document.addEventListener('AppleIDSignInOnFailure', (event) => {
    // Handle error.
    console.log(event.detail.error);
});