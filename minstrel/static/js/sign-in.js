import { checkAuthentication, checkInvite, navigatePage, baseUrl } from './app.js';

// Match values in auth/third_party.py
const GOOGLE_CLIENT_ID = 'your-google-client-id.apps.googleusercontent.com';
const APPLE_CLIENT_ID  = 'com.your.app';

let state = "account";
let email = null;
let username = null;
let password = null;
let input = null;
let statusMessage = null;
let postText = null;
let remember_me_checkbox = null;
let oauthProvider = null;

export async function load() {
    try {
        const isAuthenticated = await checkAuthentication();
        if (isAuthenticated) {
            navigatePage('');
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
    statusMessage = document.querySelector('.status-message');
    postText = document.querySelector('.post-text');
    remember_me_checkbox = document.getElementById('remember-me');

    await bindEvents();
}

async function bindEvents() {
    input = document.getElementById('input');
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

    const signUpLink = document.getElementById('signup-link');
    if (signUpLink) {
        signUpLink.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent the default anchor behavior
            navigatePage('register');
        });
    }
}



async function proceedSignIn() {
    console.log("triggered proceed");
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
            console.log("proceeding state password");
            if (checkPassword(input.value)) {
                //make sure characters are unicode/utf-8
                password = input.value;

                //console.log('Account:', username, 'Password:', password);
                console.log("submitting login");
                if (await submitLogin()) {
                    console.log("received response submitLogin");
                    sessionStorage.setItem('isAuthenticated', 'true');
                    navigatePage('');
                }

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
    postText.style.visibility = 'visible';
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
        statusMessage.textContent = "Account passwords are 8 characters long or more";
        statusMessage.style.visibility = "visible";
        return false;
    } else {
        return true;
    }
}

async function submitLogin() {
    const url = `${baseUrl}/sign-in`;
    const data = {
        email: email,
        username: username,
        password: password,
        remember_me: remember_me_checkbox.checked
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            return true;
        } else if (response.status === 401 || response.status === 404) {
            // 401 if incorrect, 404 if can't find user in s3
            //showAccountInput();
            statusMessage.textContent = "Invalid login details.";
            statusMessage.style.visibility = "visible";
            console.error('Login failed: Invalid credentials');
            return false;
        }

        else {
            showAccountInput();
            statusMessage.textContent = "Login failed. Please try again.";
            statusMessage.style.visibility = "visible";
            return false;
        }
    } catch (error) {
        console.error('Error processing sign-in', error);
        statusMessage.textContent = "Failed to process request. Please try again.";
        statusMessage.style.visibility = "visible";
        return false;
    }
}

function navigateToForgotPassword() {
    window.location.href = '/forgot-password';
}



// ── OAuth provider initialisation (called from app.js after each SDK loads) ───

export function initGoogleAuth() {
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (googleResponse) => {
            await handleOAuthToken('google', { id_token: googleResponse.credential });
        },
        ux_mode: 'popup',
        auto_select: false,
        context: 'signin',
        use_fedcm_for_prompt: true,
    });
    const googleBtn = document.querySelector('.gsi-material-button');
    if (googleBtn) googleBtn.addEventListener('click', () => google.accounts.id.prompt());
}

export function initAppleAuth() {
    AppleID.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: 'name email',
        redirectURI: `${window.location.origin}/auth/apple/callback`,
        usePopup: true,
    });
    const appleBtn = document.querySelector('.apple-signin-button');
    if (appleBtn) {
        appleBtn.addEventListener('click', async () => {
            try {
                const appleResponse = await AppleID.auth.signIn();
                const payload = { id_token: appleResponse.authorization.id_token };
                if (appleResponse.user) payload.user = JSON.stringify(appleResponse.user);
                await handleOAuthToken('apple', payload);
            } catch (err) {
                if (err?.error !== 'popup_closed_by_user') {
                    console.error('Apple Sign-In error:', err);
                    statusMessage.textContent = 'Apple Sign-In failed. Please try again.';
                    statusMessage.style.visibility = 'visible';
                }
            }
        });
    }
}

// ── Shared OAuth response handler ─────────────────────────────────────────────

async function handleOAuthToken(provider, payload) {
    statusMessage.textContent = 'Signing in…';
    statusMessage.style.visibility = 'visible';

    try {
        const response = await fetch(`${baseUrl}/auth/${provider}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (!response.ok) {
            statusMessage.textContent = data.detail || 'Sign-in failed. Please try again.';
            statusMessage.style.visibility = 'visible';
            return;
        }

        statusMessage.style.visibility = 'hidden';

        if (data.status === 'ok') {
            sessionStorage.setItem('isAuthenticated', 'true');
            navigatePage('');
        } else if (data.status === 'new_user') {
            // No account found on the sign-in page — send them to register
            statusMessage.textContent = 'No account found. Redirecting to create an account…';
            statusMessage.style.visibility = 'visible';
            setTimeout(() => navigatePage('register'), 1500);
        } else if (data.status === 'conflict') {
            oauthProvider = provider;
            showLinkProviderUI(provider);
        }
    } catch (err) {
        console.error('OAuth token error:', err);
        statusMessage.textContent = 'Connection error. Please try again.';
        statusMessage.style.visibility = 'visible';
    }
}

// ── Account linking UI (conflict path) ───────────────────────────────────────

function showLinkProviderUI(provider) {
    const providerName = provider === 'google' ? 'Google' : 'Apple';

    // Hide divider + OAuth buttons if present
    document.querySelector('.login-divider')?.style.setProperty('display', 'none');
    document.querySelector('.social-signin-container')?.style.setProperty('display', 'none');

    document.getElementById('entry-label').textContent = 'Email or Username:';
    input.value = '';
    input.type = 'text';
    input.setAttribute('aria-label', 'Email or Username');
    if (postText) {
        postText.innerHTML = `An account with this email already exists. Enter your password to link your ${providerName} account.`;
        postText.style.visibility = 'visible';
    }

    // Swap the Next button for a Link button and wire it
    const nextButton = document.getElementById('next-button');
    nextButton.textContent = 'Link Account';

    // Remove any old listener by replacing the node
    const freshButton = nextButton.cloneNode(true);
    nextButton.parentNode.replaceChild(freshButton, nextButton);
    freshButton.addEventListener('click', async () => {
        const emailOrUsername = input.value.trim();
        const linkPassword = document.getElementById('link-password')?.value ?? '';
        if (!emailOrUsername || !linkPassword) {
            statusMessage.textContent = 'Please fill in all fields';
            statusMessage.style.visibility = 'visible';
            return;
        }
        await submitLinkProvider(emailOrUsername, linkPassword);
    });

    // Insert a password field
    const existingPwd = document.getElementById('link-password-label');
    if (!existingPwd) {
        const inputContainer = document.querySelector('.input-container');
        const pwdLabel = document.createElement('p');
        pwdLabel.className = 'entry-label';
        pwdLabel.id = 'link-password-label';
        pwdLabel.textContent = 'Password:';

        const pwdInput = document.createElement('input');
        pwdInput.type = 'password';
        pwdInput.id = 'link-password';
        pwdInput.className = 'registration-field';
        pwdInput.setAttribute('aria-label', 'Password');

        inputContainer.insertAdjacentElement('afterend', pwdLabel);
        pwdLabel.insertAdjacentElement('afterend', pwdInput);
    }

    statusMessage.style.visibility = 'hidden';
    state = 'link_provider';
}

async function submitLinkProvider(emailOrUsername, linkPassword) {
    statusMessage.textContent = 'Linking account…';
    statusMessage.style.visibility = 'visible';

    const re = /^[\p{L}\p{N}._-]+@[\p{L}\p{N}._-]+\.[\p{L}\p{N}]{2,}$/u;
    const isEmail = re.test(emailOrUsername);
    try {
        const response = await fetch(`${baseUrl}/auth/link-provider`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                email: isEmail ? emailOrUsername : null,
                username: isEmail ? null : emailOrUsername,
                password: linkPassword,
            }),
        });
        const data = await response.json();
        if (response.ok && data.status === 'ok') {
            sessionStorage.setItem('isAuthenticated', 'true');
            navigatePage('');
        } else {
            statusMessage.textContent = data.detail || 'Linking failed. Check your credentials and try again.';
            statusMessage.style.visibility = 'visible';
        }
    } catch (err) {
        console.error('Link provider error:', err);
        statusMessage.textContent = 'Connection error. Please try again.';
        statusMessage.style.visibility = 'visible';
    }
}
