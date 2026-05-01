import * as signIn from './sign-in.js';
import * as register from './register.js';
import * as invite from './invite.js';
import * as adventureSelect from './adventure-select.js'
import * as worldPage from './world-page.js'
import * as chatPage from './conversation/conversation.js'
import * as createWorld from './create-world.js'
import * as createCharacter from './create-character.js'
import * as notes from '/static/notes/js/notes-app.js'

// Cache busting
(() => {
    /*
    // Prevent reload loop: if just reloaded, clear flag and skip
    if (sessionStorage.getItem('jsJustReloaded') === 'true') {
        sessionStorage.removeItem('jsJustReloaded');
        // Store the current timestamp so future reloads work as intended
        const getCurrentTimestamp = () => {
            const scripts = document.querySelectorAll('script[src*="app.js"]');
            for (const script of scripts) {
                const url = new URL(script.src);
                if (url.searchParams.has('v')) {
                    return url.searchParams.get('v');
                }
            }
            return null;
        };
        const currentTimestamp = getCurrentTimestamp();
        if (currentTimestamp) {
            localStorage.setItem('jsTimestamp', currentTimestamp);
        }
        return;
    }

    // Get current timestamp from script tag
    const getCurrentTimestamp = () => {
        const scripts = document.querySelectorAll('script[src*="app.js"]');
        for (const script of scripts) {
            const url = new URL(script.src);
            if (url.searchParams.has('v')) {
                return url.searchParams.get('v');
            }
        }
        return null;
    };

    const currentTimestamp = getCurrentTimestamp();
    const lastTimestamp = localStorage.getItem('jsTimestamp');

    if (currentTimestamp && lastTimestamp && lastTimestamp !== currentTimestamp) {
        console.log('JS timestamp changed, clearing all caches...');
        
        // Clear service worker caches for JS files (if service worker exists)
        const clearServiceWorkerCaches = async () => {
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    const clearPromises = cacheNames.map(async cacheName => {
                        const cache = await caches.open(cacheName);
                        const requests = await cache.keys();
                        
                        // Delete only JS files from cache
                        const jsDeletePromises = requests
                            .filter(request => request.url.endsWith('.js'))
                            .map(request => cache.delete(request));
                        
                        return Promise.all(jsDeletePromises);
                    });
                    
                    await Promise.all(clearPromises);
                    console.log('Service worker caches cleared');
                } catch (error) {
                    console.warn('Service worker cache clear failed:', error);
                }
            }
        };

        // Clear regular browser cache by forcing hard reload
        const clearBrowserCache = () => {
            // Force clear browser cache with location.reload(true) - though deprecated, 
            // this is more reliable than window.location.reload()
            sessionStorage.setItem('jsJustReloaded', 'true');
            
            // Use multiple methods to ensure cache bypass
            if (typeof window.location.reload === 'function') {
                // Try hard reload first (bypasses cache)
                try {
                    window.location.reload(true);
                } catch (e) {
                    // Fallback to regular reload
                    window.location.reload();
                }
            } else {
                // Fallback: add cache-buster to current URL and navigate
                const url = new URL(window.location.href);
                url.searchParams.set('_cacheBust', Date.now());
                window.location.href = url.toString();
            }
        };

        // Execute both clearing methods
        clearServiceWorkerCaches().then(() => {
            console.log('All caches cleared, reloading...');
            clearBrowserCache();
        }).catch(error => {
            console.warn('Cache clear failed:', error);
            clearBrowserCache();
        });
        
        //return; // Don't continue with app initialization
        console.log('cache cleared, continuing with app initialization');
    }*/

    /*
    // Store current timestamp for next time
    if (currentTimestamp) {
        localStorage.setItem('jsTimestamp', currentTimestamp);
    }*/
})();

window.__MINSTREL_APP__ = true;

export const baseUrl = '';
export const domainAndPort = window.location.host; // This will automatically use the current domain
//export const baseUrl = 'http://192.168.40.180:5004';
//export const domainAndPort = '192.168.40.180:5004';
//export const baseUrl = 'http://127.0.0.1:5004';
//export const domainAndPort = '127.0.0.1:5004';
export const nonce = document.querySelector('meta[name="csp-nonce"]').getAttribute('content');

export let world = null;
export let chat = null;
export let socket = null;

let isWorldInvite = null;
let worldInviteUrl = null;
let partyInviteId = null;

let currentPage = null;

/** True when the bottom-nav adventure icon should show the active (current) state. */
function isAdventureNavPage(page) {
    return (
        page === 'adventure-select' ||
        page === 'world-select' ||
        page === 'world-page' ||
        page === 'world'
    );
}

function injectAppNav(page) {
    const bar = document.querySelector('.navigation-bar');
    if (!bar) {
        return;
    }

    const adventureNavCurrent = isAdventureNavPage(page) ? 'page' : 'false';
    const notesNavCurrent = page === 'notes' ? 'page' : 'false';

    bar.innerHTML = `
        <nav class="app-nav" role="navigation" aria-label="App pages">
            <div class="app-nav-items">
                <button type="button"
                        class="app-nav-item"
                        data-nav-page="adventure-select"
                        aria-label="Adventure worlds"
                        aria-current="${adventureNavCurrent}">
                    <svg class="app-nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                </button>
                <button type="button"
                        class="app-nav-item"
                        data-nav-page="notes"
                        aria-label="Notes"
                        aria-current="${notesNavCurrent}">
                    <svg class="app-nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                    </svg>
                </button>
            </div>
        </nav>
    `;

    bar.querySelectorAll('[data-nav-page]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-nav-page');
            if (target) {
                navigatePage(target);
            }
        });
    });
}

function swapBodyFromTemp(tempContainer) {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
    while (tempContainer.firstChild) {
        document.body.appendChild(tempContainer.firstChild);
    }
}

export async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth-check');
        if (response.ok) {
            sessionStorage.setItem('isAuthenticated', 'true');
            return true; // Return true to indicate successful authentication
        } else {
            sessionStorage.setItem('isAuthenticated', 'false');
            return false; // Return false to indicate authentication failed
        }
    } catch (error) {
        console.error('Error checking authentication:', error);
        sessionStorage.setItem('isAuthenticated', 'false');
        return false; // Handle errors by treating them as failed authentication
    }
}

export async function checkInvite() {
    try {
        const response = await fetch('/api/invite-check');
        if (response.ok) {
            sessionStorage.setItem('inviteVerified', 'true');
            return true; // Return true to indicate invite verification success
        } else {
            sessionStorage.setItem('inviteVerified', 'false');
            return false; // Return false to indicate invite verification failure
        }
    } catch (error) {
        console.error('Error checking invite:', error);
        sessionStorage.setItem('inviteVerified', 'false');
        return false; // Handle errors by treating them as failed invite verification
    }
}

function openWorldInvite() {
    //const params = new URLSearchParams(window.location.search);
    //const worldParam = params.get('worldId');
    if (worldInviteUrl) {
        console.log('world invite link opened');
        //const params = new URLSearchParams(worldInviteUrl);
        //const worldParam = params.get('worldId');
        //world = worldParam;
        console.log('open', world)
        adventureSelect.openWorldPage(world, partyInviteId);
    } else {
        console.log('URL is world-invite but no worldParam found in URL.')
    }
    partyInviteId = null;
    isWorldInvite = false;
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener("load", async () => {
            try {
                const reg = await navigator.serviceWorker.register("/service-worker.js");
                console.log("Service Worker registered!", reg);
            } catch (err) {
                console.error("Service Worker registration failed:", err);
            }
        });
    }
}

window.onload = async () => {
    //registerServiceWorker();

    const path = window.location.pathname;
    //change to just invite or / once not serving html through endpoint
    if (path === '/world-invite') {
        console.log('world-invite detected');
        isWorldInvite = true;
        const params = new URLSearchParams(window.location.search);
        world = params.get('worldId');
        partyInviteId = params.get('partyId');
        worldInviteUrl = true;
        console.log('detected world', world);
    }
    try {
        const isAuthenticated = await checkAuthentication();
        if (isAuthenticated) {
            navigatePage('');
        } else {
            const inviteVerified = await checkInvite();
            if (inviteVerified) {
                navigatePage('register');
            } else {
                navigatePage('invite');
            }
        }

        
    } catch (error) {
        console.error('Error checking authentication:', error);
        navigatePage('invite');
    }

    //const path = window.location.pathname;
    //change to just invite or / once not serving html through endpoint
    
};

export function navigatePage(page) {
    const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';
    const inviteVerified = sessionStorage.getItem('inviteVerified') === 'true';

    if (!isAuthenticated) {
        if (!inviteVerified) {
            page = 'invite'
        } else {
            if (page !== 'register') {
                page = 'sign-in';
            }
        }
    }
    console.log("navigating to", page);
    //history.pushState({ page }, `${page}`, `/${page}`);
    history.pushState({ page: baseUrl }, "", "/");

    

    loadModule(page);
}

window.navigatePage = navigatePage;

window.onpopstate = function (event) {
    console.log("pop state", event.state);
    // Call module-specific back navigation if available
    if (currentPage === 'world') {
        chatPage.navigateBack();
    }
    else if (currentPage === 'world-page') {
        navigatePage('adventure-select');
    } else if (currentPage === 'create-world') {
        navigatePage('adventure-select');
    } else {
        navigatePage('adventure-select');
    }
};

function loadModule(page) {
    page = page === '' ? 'adventure-select' : page; // Update 'page' based on whether it is empty or not
    let filePath = `/${page}`;
    console.log("navigating to page", page);
    //document.open();
    //document.close();

    fetch(baseUrl + filePath, {
        headers: { 'Accept': 'text/html' }   // make SW treat it as HTML
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok fetching html');
            }
            return response.text();
        })
        .then(html => {
            const mainBody = document.getElementById('main-body');
            const middleContainer = document.querySelector('.middle-container');
            const tempContainer = document.createElement('div');
            switch (page) { // Call the load function from respective modules to initialize or handle specific scripts
                case 'sign-in':
                    //document.body.className = 'sign-in-body'; was removing styles from registration page before sign-in was displayed, moved below
                    tempContainer.innerHTML = html;
                    


                    // Wait for all images to load
                    waitForImagesToLoad(tempContainer, () => {
                        while (document.body.firstChild) {
                            document.body.removeChild(document.body.firstChild);
                        }

                        // Move all children from tempContainer to body
                        while (tempContainer.firstChild) {
                            document.body.appendChild(tempContainer.firstChild);
                        }
                        document.body.className = 'sign-in-body';
                        signIn.load();
                        loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js", function () {
                            // Initialize the Apple sign-in here
                            initializeAppleSignIn();
                        });
                    });
                    break;
                case 'register':
                    document.body.className = 'auth-body';
                    document.body.innerHTML = html;
                    register.load();
                    break;
                case 'invite':
                    console.log('loading invite in router');
                    document.body.className = 'auth-body';
                    document.body.innerHTML = html;
                    requestAnimationFrame(() => {
                        invite.load();
                    });
                    break;
                case 'adventure-select':
                    if (isWorldInvite) {
                        console.log("opening world invite");
                        openWorldInvite();
                        return;
                    }

                    document.body.className = 'default-body';
                    tempContainer.innerHTML = html;
                    //middleContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        console.log("callback called");
                        injectAppNav(page);
                        adventureSelect.load();
                    });
                    break;
                case 'world-select':
                    document.body.className = 'default-body';
                    tempContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        injectAppNav(page);
                        worldSelect.load();
                    });
                    break;
                case 'create-world':
                    document.body.className = 'default-body';
                    tempContainer.innerHTML = html;
                    //middleContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        console.log("callback called");
                        injectAppNav(page);
                        createWorld.load();
                    });
                    break;
                case 'create-character':
                    document.body.className = 'default-body';
                    tempContainer.innerHTML = html;
                    //middleContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        console.log("callback called");
                        injectAppNav(page);
                        createCharacter.load();
                    });
                    break;

                case 'world-page':
                    document.body.className = 'default-body';
                    tempContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        console.log("callback called");
                        injectAppNav(page);
                        requestAnimationFrame(() => {
                            worldPage.load();
                        });
                    });
                    break;
                case 'world':
                    document.body.className = 'default-body';
                    tempContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        console.log("world page images loaded, initializing chat");
                        injectAppNav(page);
                        chatPage.load(page);
                    });
                    break;
                case 'notes':
                    document.body.className = 'default-body';
                    if (!document.querySelector('link[data-page="notes"]')) {
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = '/static/notes/css/notes.css';
                        link.dataset.page = 'notes';
                        document.head.appendChild(link);
                    }
                    tempContainer.innerHTML = html;
                    waitForImagesToLoad(tempContainer, () => {
                        swapBodyFromTemp(tempContainer);
                        injectAppNav(page);
                        notes.load();
                    });
                    break;
                case '':
                    //only want to load mainBody if being sent from sign-in or register, maybe do it there, then just do middle container here
                    document.body.className = 'default-body';
                    document.body.innerHTML = html;
                    break;
                default:
                    mainBody.innerHTML = html;
                    //Home.load(); // Default to home if unknown
            }
            currentPage = page;
            // App nav is injected inside waitForImagesToLoad callbacks so the DOM is the
            // new page (world.html's empty <img src=""> defers the callback — injecting here
            // would target the previous page and get wiped on swap).
            //loadCSSForPage(page); // Load CSS after HTML content is updated
        })
        .catch(error => {
            console.error('Failed to load the page: ', error);
            document.querySelector('.content-container').innerHTML = '<p>Error loading the page.</p>'; // Error handling
        });
}

function loadScript(url, callback) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = url;
    script.onload = callback;  // callback function to run after the script is loaded
    document.head.appendChild(script);
}

function initializeAppleSignIn() {
    // Configuration object as per Apple's requirements
    //console.log("nonce ", nonce);
    /* disabled until apple auth is setup
    document.getElementById('apple-signin-button').addEventListener('click', function (event) {
        event.preventDefault();
        AppleID.auth.signIn();
    });*/

    const config = {
        clientId: '[CLIENT_ID]', // Your Apple client ID
        scope: '[SCOPES]',       // Scopes for which you're requesting access
        redirectURI: '[REDIRECT_URI]', // URI to which users will be redirected after authentication
        state: '[STATE]',        // Optional state used to maintain state between the request and callback
        nonce: nonce
    };

    // Initialize the Apple sign-in
    AppleID.auth.init(config);

    // Optionally, you can set up event listeners or callbacks here
}


function waitForImagesToLoad(containerElement, callback) {
    const images = containerElement.getElementsByTagName('img');
    let loadedCount = 0;

    for (let img of images) {
        if (img.complete && img.naturalHeight !== 0) {
            loadedCount++;
        } else {
            img.onload = () => {
                loadedCount++;
                if (loadedCount === images.length) {
                    callback(); // All images are loaded, call the callback
                }
            };
            img.onerror = () => {
                console.error("Error loading image", img.src);
                loadedCount++;
                if (loadedCount === images.length) {
                    callback(); // Call callback even if some images fail to load
                }
            };
        }
    }

    if (images.length === 0 || loadedCount === images.length) {
        callback();
    }
}
/*
function pageRequiresAuthentication(page) {
    // Define which pages require authenticated access
    const protectedPages = ['profile', 'dashboard', 'settings'];
    return protectedPages.includes(page);
}*/
/*
function loadCSSForPage(page) {
    const head = document.getElementsByTagName('head')[0];
    const existingLink = document.getElementById('page-specific-css');

    if (existingLink) {
        head.removeChild(existingLink);
    }

    const cssFiles = ['about', 'contact']; // Only these pages have specific CSS
    if (cssFiles.includes(page)) {
        const link = document.createElement('link');
        link.id = 'page-specific-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = `/static/css/${page}.css`;
        head.appendChild(link);
    }
}*/

//notify notification, if message is chat and page = chats don't increment number of new message = 0, if page = world don't increment world messages

export function setWorld(value) {
    world = value;
}

export function setChat(value) {
    chat = value;
}

export function setSocket(value) {
    socket = value;
}
function loginSuccess() {
    sessionStorage.setItem('isAuthenticated', 'true');
    navigatePage('home');
}

function logout() {
    sessionStorage.setItem('isAuthenticated', 'false');
    navigatePage('sign-in');
}
