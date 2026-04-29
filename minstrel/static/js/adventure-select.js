import { baseUrl, navigatePage, setWorld } from './app.js';
import { getWorldPage, setPage } from './world-page.js';
import { setPartyId as setPartyIdCreateCharacter } from './create-character.js';
import { getUserWorlds } from './world-select.js';
import { setupPressedClass } from './utility.js';
import { characterId } from './adventure/adventure.js';

let adventureSelectDiv = null;
let menu = null;
let adventureMenu = null;
let adventureMenuButton = null;
let newAdventureButton = null;
let newWorldButton = null;
let deleteConfirmBackground = null;
let deleteConfirmAcceptButton = null;
let deleteConfirmCancelButton = null;

/** @type {'adventures' | 'worlds'} */
let portalListMode = 'adventures';

export let userAdventures = null;
export { userWorlds } from './world-select.js';

export function load(options = {}) {
    document.title = 'Minstrel AI';


    adventureSelectDiv = document.querySelector('.adventure-select');
    menu = document.querySelector('.adventure-settings-menu');
    adventureMenu = document.getElementById('adventure-menu');
    adventureMenuButton = document.querySelector('.adventure-menu-button');
    newAdventureButton = document.querySelector('.new-adventure-button');
    newWorldButton = document.querySelector('.new-world-button');
    deleteConfirmBackground = document.querySelector('.confirm-modal-background');
    deleteConfirmAcceptButton = document.querySelector('.confirm-accept');
    deleteConfirmCancelButton = document.querySelector('.confirm-cancel');

    if (!adventureSelectDiv) {
        return;
    }

    adventureSelectDiv.innerHTML = '';

    applyPortalListMode();

    if (portalListMode === 'worlds') {
        getUserWorlds(adventureSelectDiv, openMenu, cleanupPage);
    } else {
        getUserAdventures();
    }
    bindEvents();
}

function applyPortalListMode() {
    const viewWorldsBtn = document.getElementById('adventure-menu-view-worlds');
    const viewAdventuresBtn = document.getElementById('adventure-menu-view-adventures');
    if (viewWorldsBtn) {
        viewWorldsBtn.hidden = portalListMode === 'worlds';
    }
    if (viewAdventuresBtn) {
        viewAdventuresBtn.hidden = portalListMode === 'adventures';
    }
    if (newAdventureButton) {
        newAdventureButton.hidden = portalListMode === 'worlds';
    }
    if (newWorldButton) {
        newWorldButton.hidden = portalListMode === 'adventures';
    }
}

function switchPortalList(mode) {
    closeAdventureMenu();
    closeMenu();
    portalListMode = mode;
    const scrollEl = document.querySelector('.adventure-select-scroll');
    if (scrollEl) {
        const h = scrollEl.offsetHeight;
        if (h > 0) {
            scrollEl.style.minHeight = `${h}px`;
        }
    }
    adventureSelectDiv.innerHTML = '';
    applyPortalListMode();
    if (mode === 'worlds') {
        getUserWorlds(adventureSelectDiv, openMenu, cleanupPage);
    } else {
        getUserAdventures();
    }
}

function bindEvents() {
    newAdventureButton.addEventListener('click', function () {
        cleanupPage();
        navigatePage('create-world');
    });

    if (newWorldButton) {
        newWorldButton.addEventListener('click', function () {
            cleanupPage();
            navigatePage('create-world');
        });
    }

    document.body.addEventListener('click', closeMenuClick);
    document.body.addEventListener('keydown', closeMenuKey);

    const adventureScrollContainer = document.querySelector('.adventure-select-scroll');
    if (adventureScrollContainer) {
        adventureScrollContainer.addEventListener('scroll', function () {
            menu.style.display = 'none';
            closeAdventureMenu();
        });
    }

    if (adventureMenuButton && adventureMenu) {
        adventureMenuButton.addEventListener('click', function (event) {
            event.stopPropagation();
            if (adventureMenu.style.display === 'block') {
                closeAdventureMenu();
            } else {
                openAdventureMenu();
            }
        });
    }

    const viewWorldsButton = document.getElementById('adventure-menu-view-worlds');
    if (viewWorldsButton) {
        viewWorldsButton.addEventListener('click', function (event) {
            event.stopPropagation();
            closeAdventureMenu();
            switchPortalList('worlds');
        });
    }

    const viewAdventuresButton = document.getElementById('adventure-menu-view-adventures');
    if (viewAdventuresButton) {
        viewAdventuresButton.addEventListener('click', function (event) {
            event.stopPropagation();
            closeAdventureMenu();
            switchPortalList('adventures');
        });
    }

    const shareButton = document.getElementById('invite-link-button');
    shareButton.addEventListener('click', shareWorldLink);
    const partyInviteButton = document.getElementById('party-invite-link-button');
    partyInviteButton.addEventListener('click', sharePartyInviteLink);
    const deleteWorldButton = document.getElementById('delete-world-button');
    deleteWorldButton.addEventListener('click', openDeleteWorldConfirm);
    const closeMenuButton = document.getElementById("close-menu-accessibility");
    closeMenuButton.addEventListener('click', closeMenu);

    if (deleteConfirmAcceptButton && deleteConfirmCancelButton && deleteConfirmBackground) {
        deleteConfirmAcceptButton.addEventListener('click', confirmDeleteWorld);
        deleteConfirmCancelButton.addEventListener('click', closeDeleteWorldConfirm);

        // Provide a clear pressed state on touch and mouse
        setupPressedClass(deleteConfirmAcceptButton, 'confirm-button-pressed');
        setupPressedClass(deleteConfirmCancelButton, 'confirm-button-pressed');

        // Close when clicking on the darkened background, but not the dialog itself

        deleteConfirmBackground.addEventListener('click', (e) => {
            if (e.target === deleteConfirmBackground) {
                closeDeleteWorldConfirm();
            }
        });
    }
}

function openDeleteWorldConfirm(event) {
    event.stopPropagation();

    const worldId = menu.getAttribute('data-world-id');
    if (!worldId || !deleteConfirmBackground) {
        return;
    }

    deleteConfirmBackground.hidden = false;
    deleteConfirmBackground.setAttribute('aria-hidden', 'false');

    if (deleteConfirmAcceptButton) {
        deleteConfirmAcceptButton.focus();
    }
}

function closeDeleteWorldConfirm() {
    if (!deleteConfirmBackground) {
        return;
    }
    deleteConfirmBackground.hidden = true;
    deleteConfirmBackground.setAttribute('aria-hidden', 'true');
}

function closeMenuClick(e) {
    const inWorldMenu =
        e.target.matches('.adventure-settings-button') || e.target.closest('.adventure-settings-menu');
    const inAdventureMenu =
        e.target.matches('.adventure-menu-button') || e.target.closest('.adventure-menu');
    if (!inWorldMenu && !inAdventureMenu) {
        closeMenu();
        closeAdventureMenu();
    }
}

function closeMenuKey(e) {
    if (e.key === 'Escape') {
        closeMenu();
        closeAdventureMenu();
    }
}

async function getUserAdventures() {
    const url = `${baseUrl}/user-adventures/`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching user adventures.');
        }

        const data = await response.json();

        adventureSelectDiv.innerHTML = '';
        userAdventures = [];

        if (data.length === 0) {
            /*
            const notice = document.createElement('p');
            notice.className = 'no-adventure-notice';
            notice.textContent = "Create an adventure, let's get started!";
            adventureSelectDiv.appendChild(notice);*/
        } else {
            const notice = document.querySelector('.no-adventure-notice')
            //notice.style.display = 'none';
            data.forEach(adventureInfo => {
                userAdventures.push(adventureInfo.world_id);
                const adventureEntry = createAdventureEntry(adventureInfo);
                adventureSelectDiv.appendChild(adventureEntry);
            });
        }

        if (data.length === 0) {
            const notice = document.createElement('p');
            notice.className = 'no-adventure-notice';
            notice.textContent = "Create an adventure, let's get started!";
            adventureSelectDiv.appendChild(notice);
        }
        
        // Show the adventure-select container after content is loaded
        adventureSelectDiv.style.display = 'block';
    } catch (error) {
        console.error('Error fetching user adventures.', error);
    } /*finally {
        const scrollEl = document.querySelector('.adventure-select-scroll');
        if (scrollEl) {
            scrollEl.style.minHeight = '';
        }
    }*/
}

function formatTimestamp(isoString) {
    if (!isoString) return 'unknown';
    
    const date = new Date(isoString);
    const now = new Date();
    
    // Check if same day
    const isSameDay = date.toDateString() === now.toDateString();
    
    if (isSameDay) {
        // Same day: show time only (e.g., "5:15 PM")
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    // Check if same year
    const isSameYear = date.getFullYear() === now.getFullYear();
    
    if (isSameYear) {
        // Same year: show month and day (e.g., "June 15")
        return date.toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    // Different year: show month, day, and year (e.g., "June 16, 2016")
    return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
    });
}

function createAdventureEntry(adventureInfo) {
    const adventureEntryDiv = document.createElement('div');
    adventureEntryDiv.className = 'adventure-entry';
    let worldId = adventureInfo.world_id;
    let characterId = adventureInfo.adventure_id;
    adventureEntryDiv.dataset.worldId = worldId
    adventureEntryDiv.dataset.characterId = characterId

    const adventureName = document.createElement('span');
    adventureName.className = 'adventure-name';
    // Display character name as the primary name
    adventureName.setAttribute('aria-label', adventureInfo.character_name || "Unknown Character");
    adventureName.textContent = adventureInfo.character_name || "Unknown Character";

    const adventureDetailsP = document.createElement('p');
    const lastActive = formatTimestamp(adventureInfo['last_active']);
    adventureDetailsP.innerHTML = `world: ${adventureInfo.world_name || 'Unknown Adventure'}<br>last_played: ${lastActive}`;

    const settingsButton = document.createElement('button');
    settingsButton.className = 'adventure-settings-button';
    settingsButton.setAttribute('aria-label', 'Adventure Settings');
    settingsButton.innerHTML = '<span>☰</span>';
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.setAttribute('aria-controls', 'menu');

    // Attach event listener to button
    settingsButton.addEventListener('click', function (event) {
        event.stopPropagation(); // Prevent event from bubbling up
        openMenu(settingsButton, worldId, characterId);
    });

    adventureEntryDiv.addEventListener('click', (event) => {
        event.stopPropagation();
        openWorldPage(worldId, characterId);
    });

    

    // Make the entire adventure entry keyboard accessible
    adventureEntryDiv.setAttribute('role', 'button');
    adventureEntryDiv.setAttribute('tabindex', '0');
    adventureEntryDiv.setAttribute('aria-label', `${adventureInfo.character_name || "Unknown Character"}. world: ${adventureInfo.world_name || 'Unknown Adventure'}`);
    
    adventureEntryDiv.addEventListener('keydown', (event) => {
        // Activate on Enter or Space
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            openWorldPage(worldId, characterId);
        }
    });

    adventureEntryDiv.appendChild(adventureName);
    adventureEntryDiv.appendChild(adventureDetailsP);
    adventureEntryDiv.appendChild(settingsButton);

    return adventureEntryDiv;
}

//not using
function menuDivClick(event) {
    event.stopPropagation();
}

function openAdventureMenu() {
    if (!adventureMenu || !adventureMenuButton) {
        return;
    }

    const firstItem = adventureMenu.querySelector('[role="menuitem"]:not([hidden])');
    if (!firstItem) {
        return;
    }

    closeMenu();

    adventureMenu.style.visibility = 'hidden';
    adventureMenu.style.display = 'block';

    const rect = adventureMenuButton.getBoundingClientRect();
    const borderWidth = 2;
    adventureMenu.style.top = rect.bottom + 4 - borderWidth + 'px';
    adventureMenu.style.left = rect.right - adventureMenu.offsetWidth + 'px';
    adventureMenu.style.visibility = 'visible';

    adventureMenuButton.setAttribute('aria-expanded', 'true');
    firstItem.focus();
}

function closeAdventureMenu() {
    if (!adventureMenu || !adventureMenuButton) {
        return;
    }
    adventureMenu.style.display = 'none';
    adventureMenu.style.visibility = 'hidden';
    adventureMenuButton.setAttribute('aria-expanded', 'false');
}

function openMenu(settingsButton, worldId, adventureId = null) {
    closeAdventureMenu();

    document.querySelectorAll('.adventure-entry, .world-entry').forEach(entry => {
        entry.classList.add('no-pointer-events');
    });

    //settingsButton.parentNode.insertBefore(menu, settingsButton.nextSibling);
    menu.style.visibility = 'hidden';
    menu.style.display = 'block';
    //const forcedReflow = menu.offsetWidth;

    const rect = settingsButton.getBoundingClientRect();

    //const parentRect = settingsButton.closest('.adventure-entry').getBoundingClientRect();

    const borderWidth = 2;
    //const offsetTop = rect.top - parentRect.top - borderWidth;
    //const offsetLeft = rect.left - parentRect.left;
    const offsetTop = rect.top - borderWidth;
    const offsetLeft = rect.left;

    menu.style.top = offsetTop + "px";
    menu.style.left = (offsetLeft + rect.width - menu.offsetWidth) + "px";
    menu.style.visibility = 'visible';

    settingsButton.setAttribute('aria-expanded', 'true');

    const shareButton = document.getElementById('invite-link-button');
    menu.setAttribute('data-world-id', worldId);
    if (adventureId) {
        menu.setAttribute('data-adventure-id', adventureId);
    } else {
        menu.removeAttribute('data-adventure-id');
    }
    shareButton.focus();
}

function closeMenu() {
    document.querySelectorAll('.adventure-entry, .world-entry').forEach(entry => {
        entry.classList.remove('no-pointer-events');
    });
    document.querySelectorAll('.adventure-settings-button').forEach(entry => {
        entry.setAttribute('aria-expanded', 'false');
    });
    

    const focusedMenu = document.querySelector('.adventure-settings-menu');
    const closestButton = focusedMenu.previousElementSibling;
    closestButton.focus();
    menu.style.display = 'none';
}

export async function openWorldPage(worldId, characterId = null, partyId = null) {
    setWorld(worldId);
    let pageData = await getWorldPage(worldId, characterId);
    setPage(pageData);

    if (partyId) {
        setPartyIdCreateCharacter(partyId);
    }
    cleanupPage();
    navigatePage('world-page');
}

function shareWorldLink(event) {
    event.stopPropagation();
    //const shareButton = document.getElementById('invite-link-button');
    const worldId = menu.getAttribute('data-world-id');
    console.log(baseUrl);
    console.log(worldId);
    const url = `${window.location.origin}/world-invite?worldId=${worldId}`;
    ///world-invite?worldId=010006329e7f08beb454fde7395885010000062f9c558bf1e172ce067efb68e5
    

    navigator.clipboard.writeText(url).then(() => {
        const statusMessage = document.getElementById("clipStatus");
        statusMessage.textContent = "Share link copied to clipboard."; // Screen reader will announce this

        alert("Invite link copied to clipboard!"); // Optional visual notification for sighted users
    }).catch(err => {
        console.error("Failed to copy: ", err);
    });
    closeMenu();
}

async function sharePartyInviteLink(event) {
    event.stopPropagation();

    const worldId = menu.getAttribute('data-world-id');

    try {
        const partyUrl =
            portalListMode === 'worlds'
                ? `${baseUrl}/user-party-id/?world_id=${worldId}`
                : `${baseUrl}/user-party-id/?world_id=${worldId}&character_id=${encodeURIComponent(characterId)}`;

        const partyResponse = await fetch(partyUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!partyResponse.ok) {
            throw new Error('Failed to get party ID');
        }

        const partyData = await partyResponse.json();
        const partyId = partyData.party_id;

        const url = `${window.location.origin}/world-invite?worldId=${worldId}&partyId=${partyId}`;

        navigator.clipboard.writeText(url).then(() => {
            const statusMessage = document.getElementById("clipStatus");
            statusMessage.textContent = "Party invite link copied to clipboard.";

            alert("Party invite link copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy: ", err);
            alert("Failed to copy party invite link to clipboard.");
        });

    } catch (error) {
        console.error('Error creating party invite link:', error);
        alert("Error creating party invite link. Make sure you have a character in this world.");
    }

    closeMenu();
}

async function confirmDeleteWorld(event) {
    event.stopPropagation();

    const worldId = menu.getAttribute('data-world-id');
    const adventureId = menu.getAttribute('data-adventure-id');
    if (!worldId && !adventureId) {
        closeDeleteWorldConfirm();
        return;
    }

    const isAdventureDelete = Boolean(adventureId);
    const url = isAdventureDelete
        ? `${baseUrl}/remove-adventure`
        : `${baseUrl}/remove-world`;
    const data = isAdventureDelete
        ? { adventure_id: adventureId }
        : { world: worldId };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            if (isAdventureDelete) {
                console.log('removed adventure', adventureId);
            } else {
                console.log('removed world', worldId);
            }
            closeDeleteWorldConfirm();
            closeMenu();
            if (portalListMode === 'worlds') {
                getUserWorlds(adventureSelectDiv, openMenu, cleanupPage);
            } else {
                getUserAdventures();
            }
        } else {
            throw new Error("Failed to delete.");
        }
    } catch (error) {
        console.error(error);
        alert(isAdventureDelete ? "Error removing adventure." : "Error removing world.");
    }
}

function cleanupPage() {
    document.body.removeEventListener("click", closeMenuClick);
    document.body.removeEventListener("keydown", closeMenuKey);
}

/*
function createWorldSettingsMenu() {
// Create the outer div and set its class and style
const menuDiv = document.createElement('div');
menuDiv.className = 'world-settings-menu';
menuDiv.style.display = 'none';

// Create the unordered list
const menuList = document.createElement('ul');

// Array of menu items
const items = ['Edit World', 'Delete World', 'View Details'];

// Loop through the items array to create each list item
items.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    menuList.appendChild(listItem);
});

// Append the list to the div
menuDiv.appendChild(menuList);

// Append the div to the body
document.body.appendChild(menuDiv);
}*/