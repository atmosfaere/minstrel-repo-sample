import { checkAuthentication, navigatePage, baseUrl } from './app.js';

let inputElement = document.getElementById('input');
let statusMessage = document.querySelector('.status-message');
const postText = document.querySelector('.post-text');

const urlParams = new URLSearchParams(window.location.search);

export function load() {
    console.log('loading invite js');
    inputElement = document.getElementById('input');
    statusMessage = document.querySelector('.status-message');
    bindEvents();
}

function bindEvents() {
    document.getElementById('next-button').addEventListener('click', checkInviteCode)

    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.keyCode === 13) {
            event.preventDefault();
            checkInviteCode();
        }
    });
}

async function checkInviteCode() {
    const url = `${baseUrl}/invite`;
    const inputValue = inputElement.value;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ input: inputValue })
        });
        if (response.ok) {
            sessionStorage.setItem('inviteVerified', 'true');
            navigatePage('register');
        }
        if (!response.ok) {
            statusMessage.textContent = "Invalid code";
            console.error('Invalid invite code:');
            statusMessage.style.visibility = "visible";
            throw new Error(`HTTP status code: ${response.status}`);
        }
    } catch (error) {
        console.error('Error processing invite', error);
        statusMessage.textContent = "Failed to process request. Please try again.";
        statusMessage.style.visibility = "visible";
        return false;
    }
}


