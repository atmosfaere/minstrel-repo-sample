import { navigatePage, chat, setWorld, baseUrl, world, socket } from '../app.js';
import { createAriaLiveRegion, queueAnnouncement } from '../aria.js';
import { sanitizeHTML } from '../utility.js';
import { closeSimulationAccordion, fetchCharacterSimulationStatus } from './simulation-menu.js';

// ---------------------------------------------------------------------------
// World feature span utilities
// ---------------------------------------------------------------------------

export function createWorldFeatureSpan(objectName, objectId) {
    // Escape the values to prevent XSS
    const escapedName = sanitizeHTML(objectName);
    const escapedId = sanitizeHTML(objectId);
    return `<span class="world-feature-span" data-object-id="${escapedId}">${escapedName}</span>`;
}

function processStaticMessageIds(message) {
    // Pattern 1: [feature_name] @@id@@ (ID outside brackets)
    let processedMessage = message.replace(/\[([^\]]+)\]\s*@@([^@]+)@@/g, (match, featureName, id) => {
        return createWorldFeatureSpan(featureName, id);
    });

    // Pattern 2: [feature_name @@id@@] (ID inside brackets)
    processedMessage = processedMessage.replace(/\[([^@]+)\s+@@([^@]+)@@\]/g, (match, featureName, id) => {
        return createWorldFeatureSpan(featureName, id);
    });

    // Pattern 3: [feature_name] [@@id@@] (ID in separate brackets)
    processedMessage = processedMessage.replace(/\[([^\]]+)\]\s*\[@@([^@]+)@@\]/g, (match, featureName, id) => {
        return createWorldFeatureSpan(featureName, id);
    });

    // Pattern 4: feature_name @@id@@ (no brackets)
    processedMessage = processedMessage.replace(/([^\s]+)\s+@@([^@]+)@@/g, (match, featureName, id) => {
        return createWorldFeatureSpan(featureName, id);
    });

    return processedMessage;
}

export function processMessageText(message) {
    message = sanitizeHTML(message);
    message = processStaticMessageIds(message);
    return message;
}

// ---------------------------------------------------------------------------
// World loading overlay
// ---------------------------------------------------------------------------

let worldLoadingOverlay = null;
let worldLoadingProgressFill = null;
let worldLoadingTimerEl = null;
let worldLoadingStartTime = null;
const WORLD_LOADING_MIN_DURATION_DEFAULT = 2400;
const WORLD_CREATING_MIN_DURATION = 5200;
const WORLD_LOADING_HISTORY_FALLBACK = 6000;
const WORLD_CREATING_HISTORY_FALLBACK = 5200;
let worldLoadingMinDuration = WORLD_LOADING_MIN_DURATION_DEFAULT;
let worldLoadingIntervalId = null;
let worldIndexImageLoaded = false;
let initialConversationLoaded = false;
let worldAssetsReady = false;
let worldLoadingHideRequested = false;
let worldLoadingHistoryTimeoutId = null;
let worldLoadingMode = 'loading';

export function setupWorldLoadingOverlay() {
    worldLoadingOverlay = document.querySelector('.world-loading-overlay');
    if (!worldLoadingOverlay) return;

    worldLoadingProgressFill = worldLoadingOverlay.querySelector('.loading-bar-fill');
    worldLoadingTimerEl = worldLoadingOverlay.querySelector('.loading-timer');

    // Determine mode (creating vs loading) based on navigation source
    try {
        const storedMode = window.sessionStorage ? window.sessionStorage.getItem('worldLoadingMode') : null;
        worldLoadingMode = storedMode === 'creating' ? 'creating' : 'loading';
        if (window.sessionStorage) {
            window.sessionStorage.removeItem('worldLoadingMode');
        }
    } catch (e) {
        console.warn('Unable to read worldLoadingMode from sessionStorage', e);
        worldLoadingMode = 'loading';
    }

    // Adjust minimum duration based on mode
    worldLoadingMinDuration = (worldLoadingMode === 'creating')
        ? WORLD_CREATING_MIN_DURATION
        : WORLD_LOADING_MIN_DURATION_DEFAULT;

    // Update title/subtitle text based on mode
    const titleEl = worldLoadingOverlay.querySelector('.world-loading-title');
    const subtitleEl = worldLoadingOverlay.querySelector('.world-loading-subtitle');
    if (worldLoadingMode === 'creating') {
        if (titleEl) titleEl.textContent = 'Creating world...';
        if (subtitleEl) {
            subtitleEl.textContent = 'Warming up world processing...';
        }
    } else {
        if (titleEl) titleEl.textContent = 'Loading world...';
        if (subtitleEl) {
            subtitleEl.textContent = 'Readying environment, fetching history, waking up characters...';
        }
    }

    worldLoadingStartTime = performance.now();
    worldAssetsReady = false;
    worldLoadingHideRequested = false;
    worldIndexImageLoaded = false;
    initialConversationLoaded = false;

    worldLoadingOverlay.classList.remove('hidden');

    // Announce to screen readers that loading has started
    const loadingMessage = worldLoadingMode === 'creating'
        ? 'Creating world. Please wait.'
        : 'Loading world. Please wait.';
    createAriaLiveRegion();
    queueAnnouncement(loadingMessage);

    if (worldLoadingProgressFill) {
        worldLoadingProgressFill.style.width = '0%';
    }
    if (worldLoadingTimerEl) {
        worldLoadingTimerEl.textContent = '0.0s';
    }

    if (worldLoadingIntervalId) {
        clearInterval(worldLoadingIntervalId);
    }
    worldLoadingIntervalId = setInterval(updateWorldLoadingOverlay, 100);

    // Fallback: if no initial history/messages arrive, treat as ready after a grace period
    if (worldLoadingHistoryTimeoutId) {
        clearTimeout(worldLoadingHistoryTimeoutId);
    }
    const historyFallbackDuration = (worldLoadingMode === 'creating')
        ? WORLD_CREATING_HISTORY_FALLBACK
        : WORLD_LOADING_HISTORY_FALLBACK;
    worldLoadingHistoryTimeoutId = setTimeout(() => {
        if (!initialConversationLoaded) {
            console.log('No initial messages received, treating world as loaded for overlay.');
            initialConversationLoaded = true;
            maybeMarkWorldAssetsReady();
        }
    }, historyFallbackDuration);
}

export function setupWorldIndexImageLoading(imgElement) {
    if (!imgElement) {
        return;
    }

    const markLoaded = () => {
        worldIndexImageLoaded = true;
        maybeMarkWorldAssetsReady();
    };

    if (imgElement.complete && imgElement.naturalWidth !== 0) {
        // Image was loaded from cache
        markLoaded();
    } else {
        imgElement.addEventListener('load', () => {
            markLoaded();
        }, { once: true });
        imgElement.addEventListener('error', () => {
            console.warn('World index button image failed to load');
            // Still allow loading screen to finish
            markLoaded();
        }, { once: true });
    }
}

function updateWorldLoadingOverlay() {
    if (!worldLoadingOverlay) {
        return;
    }

    const elapsed = performance.now() - worldLoadingStartTime;

    if (worldLoadingTimerEl) {
        worldLoadingTimerEl.textContent = (elapsed / 1000).toFixed(1) + 's';
    }

    if (worldLoadingProgressFill) {
        let percent;
        if (!worldAssetsReady) {
            // Ease up to ~80% over the first few seconds while things load
            const t = Math.min(elapsed / worldLoadingMinDuration, 1);
            percent = 10 + (80 - 10) * t;
        } else {
            percent = 100;
        }
        worldLoadingProgressFill.style.width = `${Math.min(percent, 100)}%`;
    }

    if (worldLoadingHideRequested && elapsed >= worldLoadingMinDuration) {
        hideWorldLoadingOverlay();
    }
}

export function maybeMarkWorldAssetsReady() {
    if (worldAssetsReady) {
        return;
    }
    if (!worldIndexImageLoaded || !initialConversationLoaded) {
        return;
    }
    worldAssetsReady = true;
    requestHideWorldLoadingOverlay();
}

function requestHideWorldLoadingOverlay() {
    if (!worldLoadingOverlay) {
        return;
    }
    worldLoadingHideRequested = true;
    const elapsed = performance.now() - worldLoadingStartTime;
    if (elapsed >= worldLoadingMinDuration) {
        hideWorldLoadingOverlay();
    }
}

function hideWorldLoadingOverlay() {
    if (!worldLoadingOverlay) {
        return;
    }

    worldLoadingOverlay.classList.add('hidden');

    if (worldLoadingIntervalId) {
        clearInterval(worldLoadingIntervalId);
        worldLoadingIntervalId = null;
    }
    if (worldLoadingHistoryTimeoutId) {
        clearTimeout(worldLoadingHistoryTimeoutId);
        worldLoadingHistoryTimeoutId = null;
    }

    // Announce to screen readers that loading is complete
    queueAnnouncement('World loaded and ready.');
}

/**
 * Called by addConversation / addEarlierMessages in conversation.js when initial
 * history arrives, so the loading overlay knows the conversation is ready.
 */
export function markConversationLoaded() {
    initialConversationLoaded = true;
    maybeMarkWorldAssetsReady();
}

// ---------------------------------------------------------------------------
// Adventure WebSocket route handlers
// ---------------------------------------------------------------------------

export function handlePartyIdResponse(content) {
    const partyId = content.party_id;

    console.log('Party ID response:', partyId);

    if (window.playerMenuDataResolver) {
        window.playerMenuDataResolver.data.partyId = partyId;
        window.playerMenuDataResolver.waitingFor = window.playerMenuDataResolver.waitingFor.filter(item => item !== 'party');

        if (window.playerMenuDataResolver.waitingFor.length === 0) {
            clearTimeout(window.playerMenuDataResolver.timeout);
            window.playerMenuDataResolver.resolve(window.playerMenuDataResolver.data);
            window.playerMenuDataResolver = null;
        }
    } else {
        const playerMenu = getPlayerMenu();
        console.log('Current party:', playerMenu.getAttribute('data-party-id'));
        updatePlayerMenuOptions();
    }
}

export function handleFriendStatusResponse(content) {
    const isFriend = content.is_friend;

    console.log('Friend status response:', isFriend);

    if (window.playerMenuDataResolver) {
        window.playerMenuDataResolver.data.isFriend = isFriend;
        window.playerMenuDataResolver.waitingFor = window.playerMenuDataResolver.waitingFor.filter(item => item !== 'friend');

        if (window.playerMenuDataResolver.waitingFor.length === 0) {
            clearTimeout(window.playerMenuDataResolver.timeout);
            window.playerMenuDataResolver.resolve(window.playerMenuDataResolver.data);
            window.playerMenuDataResolver = null;
        }
    } else {
        const playerMenu = getPlayerMenu();
        playerMenu.setAttribute('data-is-friend', isFriend);
        updatePlayerMenuOptions();
    }
}

export function receiveWorldChat(content) {
    chat_id = content.id;
    navigatePage(chat);
}

export function handleSetWorld(content) {
    const worldId = content.world_id;

    if (worldId) {
        setWorld(worldId);
        console.log('World updated successfully to:', worldId);
    } else {
        console.warn('Received set world message without world_id');
    }
}

// ---------------------------------------------------------------------------
// Nearby activity
// ---------------------------------------------------------------------------
export function isNearbyActivitySpeakerName(name) {
    if (name == null || typeof name !== 'string') return false;
    const trimmed = name.trim().toLowerCase();
    return trimmed.startsWith('player') || trimmed.startsWith('party') || trimmed.startsWith('nearby');
}

export function applyNearbyActivityMessageStyles(messageParagraphEl) {
    if (!messageParagraphEl) return;
    const bubble = messageParagraphEl.closest('.chat-bubble');
    if (bubble) {
        bubble.classList.add('no-bubble');
    }
    const messageTextDiv = messageParagraphEl.closest('.message-text');
    if (messageTextDiv) {
        messageTextDiv.classList.add('nearby-activity-message');
    }
}
// ---------------------------------------------------------------------------
// Player / character menus, party, friend, icon upload
// ---------------------------------------------------------------------------

/** Current user's character id for the active adventure session (set when entering a world). */
export let characterId = null;

export function setCharacterId(id) {
    characterId = id;
}

function getPlayerMenu() {
    return document.querySelector('.player-settings-menu');
}

function getCharacterMenu() {
    return document.querySelector('.character-settings-menu');
}

export function updatePlayerMenuOptions() {
    const playerMenu = getPlayerMenu();
    const leavePartyButton = document.getElementById('player-leave-party-button');
    const addIconButton = document.getElementById('player-add-icon-button');
    const addFriendButton = document.getElementById('player-add-friend-button');

    const menuCharacterId = playerMenu.getAttribute('data-character-id');
    const currentUserPartyId = playerMenu.getAttribute('data-target-party-id');
    const isFriend = playerMenu.getAttribute('data-is-friend') === 'true';

    console.log('updatePlayerMenuOptions called with:', {
        menuCharacterId,
        currentUserPartyId,
        isFriend,
        buttons: {
            leavePartyButton: !!leavePartyButton,
            addIconButton: !!addIconButton,
            addFriendButton: !!addFriendButton
        }
    });

    const clickedCharacterPartyId = playerMenu.getAttribute('data-party-id');

    if (currentUserPartyId && clickedCharacterPartyId && currentUserPartyId === clickedCharacterPartyId) {
        leavePartyButton.style.display = 'block';
        leavePartyButton.textContent = 'Leave Party';
        console.log('Same party - showing Leave Party');
    } else if (clickedCharacterPartyId && clickedCharacterPartyId !== currentUserPartyId) {
        leavePartyButton.style.display = 'block';
        leavePartyButton.textContent = 'Join Party';
        console.log('Different party - showing Join Party');
    } else {
        leavePartyButton.style.display = 'none';
        console.log('No party info - hiding button');
    }

    if (menuCharacterId === characterId) {
        console.log('Showing add icon button - same character');
        addIconButton.style.display = 'block';
    } else {
        console.log('Hiding add icon button - different character');
        addIconButton.style.display = 'none';
    }

    if (menuCharacterId !== characterId) {
        console.log('Showing add friend button - different character');
        addFriendButton.style.display = 'block';
        addFriendButton.textContent = isFriend ? 'Remove Friend' : 'Add Friend';
    } else {
        console.log('Hiding add friend button - same character');
        addFriendButton.style.display = 'none';
    }
}

export async function openPlayerSettingsMenu(characterNameButton) {
    const playerMenu = getPlayerMenu();
    const clickedCharacterId = characterNameButton.dataset.characterId;
    const clickedUserId = characterNameButton.dataset.userId;
    const clickedPartyId = characterNameButton.dataset.partyId;

    console.log('Opening player menu for characterId: ' + clickedCharacterId);
    console.log('userId: ' + clickedUserId);
    console.log('partyId: ' + clickedPartyId);

    const menuData = await getPlayerMenuData(clickedCharacterId, clickedUserId);
    console.log('Menu data received:', menuData);

    playerMenu.style.visibility = 'hidden';
    playerMenu.style.display = 'block';

    const rect = characterNameButton.getBoundingClientRect();
    const borderWidth = 2;
    playerMenu.style.top = (rect.top - borderWidth) + "px";
    playerMenu.style.left = rect.left + "px";
    playerMenu.style.visibility = 'visible';

    characterNameButton.setAttribute('aria-expanded', 'true');

    playerMenu.setAttribute('data-character-id', clickedCharacterId);
    // Always clear first to avoid stale data from a previous click
    playerMenu.setAttribute('data-party-id', clickedPartyId || '');

    if (menuData) {
        playerMenu.setAttribute('data-target-party-id', menuData.partyId || '');
        playerMenu.setAttribute('data-is-friend', menuData.isFriend || 'false');
        playerMenu.setAttribute('data-character-owner-id', menuData.characterOwnerId || '');

        // When viewing your own character the button dataset won't carry a party ID,
        // so use the party ID returned for the current user.
        if (!clickedPartyId && clickedCharacterId === characterId && menuData.partyId) {
            playerMenu.setAttribute('data-party-id', menuData.partyId);
        }
    }

    console.log('Calling updatePlayerMenuOptions with:', {
        menuCharacterId: clickedCharacterId,
        currentCharacterId: characterId,
        partyId: menuData?.partyId,
        isFriend: menuData?.isFriend
    });
    updatePlayerMenuOptions();

    characterNameButton.focus();
}

async function getPlayerMenuData(clickedCharacterId, clickedUserId) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('Timeout waiting for player menu data');
            resolve(null);
        }, 2000);

        window.playerMenuDataResolver = {
            resolve,
            timeout,
            data: {},
            clickedCharacterId,
            clickedUserId,
            waitingFor: []
        };

        try {
            window.playerMenuDataResolver.waitingFor.push('party');
            socket.send(JSON.stringify({
                'route': 'get party id',
                'content': {}
            }));

            window.playerMenuDataResolver.waitingFor.push('friend');
            socket.send(JSON.stringify({
                'route': 'check friend',
                'content': { 'user_id': clickedUserId }
            }));
        } catch (error) {
            console.error('Error requesting player menu data:', error);
            clearTimeout(timeout);
            resolve(null);
        }
    });
}

export function openCharacterMenu(element) {
    const characterMenu = getCharacterMenu();
    characterMenu.style.visibility = 'hidden';
    characterMenu.style.display = 'block';

    const rect = element.getBoundingClientRect();
    const borderWidth = 2;

    characterMenu.style.top = (rect.top - borderWidth) + "px";

    if (element.classList.contains('character-name')) {
        characterMenu.style.left = (rect.left + rect.width - characterMenu.offsetWidth) + "px";
    } else {
        const screenWidth = window.innerWidth;
        const isOnRightHalf = (rect.left + rect.width / 2) > (screenWidth / 2);

        if (isOnRightHalf) {
            characterMenu.style.left = (rect.left + rect.width - characterMenu.offsetWidth) + "px";
        } else {
            characterMenu.style.left = rect.left + "px";
        }
    }

    characterMenu.style.visibility = 'visible';
    element.setAttribute('aria-expanded', 'true');

    const buttonCharacterId = element.dataset.characterId || element.dataset.objectId;
    console.log('characterId: ' + buttonCharacterId);
    characterMenu.setAttribute('data-character-id', buttonCharacterId);
    fetchCharacterSimulationStatus(buttonCharacterId);
    element.focus();
}

export function closeCharacterMenu() {
    document.querySelectorAll('.character-name-button').forEach(entry => {
        entry.setAttribute('aria-expanded', 'false');
    });

    const focusedMenu = document.querySelector('.character-settings-menu');
    if (focusedMenu) {
        const closestButton = focusedMenu.previousElementSibling;
        if (closestButton) closestButton.focus();
    }
    getCharacterMenu().style.display = 'none';
    closeSimulationAccordion();
}

export function closePlayerMenu() {
    document.querySelectorAll('.user-name').forEach(entry => {
        entry.setAttribute('aria-expanded', 'false');
    });

    getPlayerMenu().style.display = 'none';
}

export function leaveParty() {
    const playerMenu = getPlayerMenu();
    const currentUserPartyId = playerMenu.getAttribute('data-target-party-id');
    const clickedCharacterPartyId = playerMenu.getAttribute('data-party-id');
    const buttonText = document.getElementById('player-leave-party-button').textContent;

    if (buttonText === 'Leave Party') {
        const confirmed = confirm('Are you sure you want to leave the party?');
        if (confirmed) {
            console.log('Leaving party:', currentUserPartyId);
            socket.send(JSON.stringify({
                'route': 'leave party',
                'content': {}
            }));
            closePlayerMenu();
        } else {
            console.log('Party leave cancelled by user');
        }
    } else if (buttonText === 'Join Party') {
        const confirmed = confirm('Are you sure you want to join this party?');
        if (confirmed) {
            console.log('Joining party:', clickedCharacterPartyId);
            socket.send(JSON.stringify({
                'route': 'join party',
                'content': { 'party_id': clickedCharacterPartyId }
            }));
            closePlayerMenu();
        } else {
            console.log('Party join cancelled by user');
        }
    } else {
        console.log('Unknown party action');
    }
}

export function addPlayerIcon() {
    const playerMenu = getPlayerMenu();
    const menuCharacterId = playerMenu.getAttribute('data-character-id');

    if (menuCharacterId === characterId) {
        console.log("Add player icon for character:", menuCharacterId);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        fileInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (file) {
                console.log('Selected file:', file.name);
                uploadCharacterIcon(file, menuCharacterId);
            }
            document.body.removeChild(fileInput);
        });

        document.body.appendChild(fileInput);
        fileInput.click();

        closePlayerMenu();
    } else {
        console.log('Cannot add icon - not your character');
    }
}

export async function toggleFriend() {
    const playerMenu = getPlayerMenu();
    const menuCharacterId = playerMenu.getAttribute('data-character-id');
    const isFriend = playerMenu.getAttribute('data-is-friend') === 'true';

    if (menuCharacterId !== characterId) {
        console.log(isFriend ? 'Removing friend:' : 'Adding friend:', menuCharacterId);

        try {
            alert(isFriend ? 'Friend removed successfully!' : 'Friend added successfully!');
            closePlayerMenu();
        } catch (error) {
            console.error('Error managing friend:', error);
            alert('Failed to manage friend. Please try again.');
        }
    } else {
        console.log('Cannot add yourself as friend');
    }
}

export function openCharacterInstructions() {
    console.log('character instructions button pressed');
}

export function addIcon() {
    console.log("Add icon");

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            console.log('Selected file:', file.name);
            const characterId = getCharacterMenu().getAttribute('data-character-id');
            if (characterId) {
                uploadCharacterIcon(file, characterId);
            } else {
                console.error('No character ID found for icon upload');
            }
        }
        document.body.removeChild(fileInput);
    });

    document.body.appendChild(fileInput);
    fileInput.click();
}

async function uploadCharacterIcon(file, characterId) {
    try {
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('File size too large. Please select an image under 5MB.');
            return;
        }

        if (!file.type.startsWith('image/')) {
            alert('Please select a valid image file.');
            return;
        }

        const addIconButton = document.getElementById('add-icon-button');
        const originalText = addIconButton.textContent;
        addIconButton.textContent = 'Uploading...';
        addIconButton.disabled = true;

        const formData = new FormData();
        formData.append('icon', file);
        formData.append('character_id', characterId);
        formData.append('world', world);

        console.log('Uploading icon for character:', characterId);

        const response = await fetch(`${baseUrl}/upload-character-icon`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        if (result.success) {
            console.log('Icon uploaded successfully');
            updateCharacterIconInUI(characterId, result.icon_url || `${baseUrl}/static/images/${characterId}.png`);
            closeCharacterMenu();
        } else {
            throw new Error(result.message || 'Upload failed');
        }

    } catch (error) {
        console.error('Error uploading icon:', error);
        alert(`Failed to upload icon: ${error.message}`);
    } finally {
        const addIconButton = document.getElementById('add-icon-button');
        if (addIconButton) {
            addIconButton.textContent = 'Add Icon';
            addIconButton.disabled = false;
        }
    }
}

function updateCharacterIconInUI(characterId, iconUrl) {
    const characterIcons = document.querySelectorAll(`.character-icon[id="${characterId}"] img`);
    characterIcons.forEach(img => {
        const cacheBustUrl = iconUrl + '?t=' + Date.now();
        img.src = cacheBustUrl;
        img.onload = () => {
            img.classList.remove('icon-hidden');
            const parent = img.closest('.character-icon');
            if (parent) {
                parent.classList.remove('icon-hidden');
            }
        };
    });
}
