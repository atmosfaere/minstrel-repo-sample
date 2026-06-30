import { navigatePage, baseUrl, world, chat, nonce } from '../app.js';
import { openWorldIndex, closeWorldIndex, navigateBackIndex, openPage } from '../world-index.js';
import { openCharacterPage } from '../world-index/page-renderers/character-page.js';
import { getWorldName } from '../world-page.js';
import { loadImage } from '../image-loader.js';
import { createAriaLiveRegion, queueAnnouncement, resetAriaAnnouncements } from '../aria.js';
import { initializeSimulationView } from '../simulation-view.js';
import { startHeartbeat, stopHeartbeat } from '../conversation-utility.js';
import { sanitizeHTML } from '../utility.js';
import {
    createWorldFeatureSpan,
    processMessageText,
    setupWorldLoadingOverlay,
    setupWorldIndexImageLoading,
    markConversationLoaded,
    receiveWorldChat,
    handleSetWorld,
    handlePartyIdResponse,
    handleFriendStatusResponse,
    isNearbyActivitySpeakerName,
    applyNearbyActivityMessageStyles,
    characterId,
    openPlayerSettingsMenu,
    openCharacterMenu,
    closeCharacterMenu,
    closePlayerMenu,
    leaveParty,
    addPlayerIcon,
    toggleFriend,
    openCharacterInstructions,
    addIcon,
} from '../adventure/adventure.js';
import {
    openSimulationAccordion,
    toggleSimulationSlider,
    handleToggleSimulationKey,
    changeSimulationType,
    onSimulationFrequencyChanged,
} from '../adventure/simulation-menu.js';
import { addSocketMessageListener, addSocketResetListener, makeSocket, socket } from '../socket/socket.js';

let isStreaming = false;
const STREAM_TIMEOUT = 15000;
let timeout;

let mode;
let simulationCharacterId = null;
let partyId = null;

let messageStartIndex = 0;
let scrollingMessages = false;
let isLoadingEarlierMessages = false;

let chatContainer;
let messageScrollContainer;
let promptArea;
let sendButton;

let originalMessageStreamElement = null;
let responseStreamElement;
let processStreamElement = null;
let receivingDelimitedId = false;
let previousStreamWord = null;
let delimitedId = null;
let currentTextNode = null;

let streamingFeatureName = ""
let streamingFeatureId = ""

let streamReceivedOpeningBracket = false;
let streamReceivedClosingBracket = false;
let streamReceivedOpeningAtSymbol = false;
let streamReceivedOpeningAtDelimiter = false;
let streamReceivedClosingAtSymbol = false;
let streamReceivedClosingAtDelimiter = false;

// "Processing..." notification
let processingStep = 0;
let hasReceivedFirstStreamMessage = false;

let characterMenu = null;

let wasBackgrounded = false;

//expose functions to window object toavoid circular imports
window.chatModule = {
    set mode(value) { mode = value; },
    get mode() { return mode; },
    set simulationCharacterId(value) { simulationCharacterId = value; },
    get simulationCharacterId() { return simulationCharacterId; },
    setupSocket
};

export function load(page) {
    chatContainer = document.querySelector(".chat-container");
    characterMenu = document.querySelector('.character-settings-menu');
    messageScrollContainer = document.querySelector(".message-scroll-container");
    promptArea = document.querySelector('.input-field');
    sendButton = document.querySelector('.submit-button');

    const worldIndexButton = document.querySelector('.world-index-button');
    const worldIndexButtonImg = worldIndexButton ? worldIndexButton.querySelector('img') : null;
    if (worldIndexButtonImg) {
        worldIndexButtonImg.src = `${baseUrl}/static/images/world_index_button.png`;
    }

    // Set page title for chat/world page
    const worldName = getWorldName();
    if (worldName) {
        document.title = `Minstrel AI - ${worldName}`;
    } else {
        document.title = 'Minstrel AI';
    }

    // Initialize world loading overlay and track world index image load (world mode only)
    if (page === 'world') {
        setupWorldLoadingOverlay();
        setupWorldIndexImageLoading(worldIndexButtonImg);
    }


    autoResizeInputField();
    //world = sessionStorage.getItem("world")
    //chat = sessionStorage.getItem("chat")
    bindEvents();
    if (page === "world") {
        mode = 'adventure';
    } else if (page === "chat") {
        mode = 'chat';
    }

    setupSocket();

    initializeSocketMode();
}

function bindEvents() {
    sendButton.addEventListener('click', sendMessage);
    promptArea.addEventListener('keydown', function (event) {
        // Check if the key pressed is 'Enter' and if the event did not happen while holding down the 'Shift' key
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('simulation-mode-button').addEventListener('click', initializeSimulationView);

    const messageScrollContainer = document.querySelector(".message-scroll-container");
    messageScrollContainer.addEventListener('scroll', function () {
        closeCharacterMenu();
        closePlayerMenu();

        var scrollHeight = messageScrollContainer.scrollHeight;
        var clientHeight = messageScrollContainer.clientHeight;
        var scrollTop = messageScrollContainer.scrollTop;

        var scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
        // Check if the scroll is at the top of the chat container
        if (messageScrollContainer.scrollTop <= 30) {
            if (!isLoadingEarlierMessages && mode !== 'simulation') { // Only retrieve if not already loading and not in simulation
                retrieveEarlierMessages();
            }
            scrollingMessages = true;
            console.log('scrolled top')
        } else if (scrollPercent <= 60) {
            scrollingMessages = true;
            //console.log('scrolling')
        } else {
            scrollingMessages = false;
            //console.log('not scrolling')
        }
    });

    // world instruction button for screen reader users
    document.getElementById('add-instructions-button').addEventListener("click", function () {
        const form = document.getElementById("sr-only-form");

        // Remove hidden class to make it accessible
        form.classList.remove("visually-hidden");

        document.getElementById("sr-instructions").innerText = "";

        // Move focus to the text input for screen readers
        document.getElementById("sr-instructions").focus();
    });

    document.getElementById("sr-save-button").addEventListener("click", async function () {
        const instructions = document.getElementById("sr-instructions").value;
        const url = `${baseUrl}/add-world-instruction`;

        if (!instructions.trim()) {
            alert("Please enter instructions before saving.");
            return;
        }

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ instruction: instructions, world: world })
            });

            if (!response.ok) {
                throw new Error("Failed to save instructions.");
            }

            alert("Instructions saved successfully!");
        } catch (error) {
            console.error(error);
            alert("Error saving instructions.");
        }

        // Hide the form again after saving
        //document.getElementById("sr-only-form").classList.add("visually-hidden");
    });

    const worldIndexButton = document.querySelector('.world-index-button');
    worldIndexButton.addEventListener('click', () => {
        openWorldIndex();
    });

    document.body.addEventListener('click', function (e) {
        if (!e.target.matches('.character-name') && !e.target.matches('.world-feature-span') && !e.target.closest('.character-settings-menu') &&
            !e.target.matches('.user-name') && !e.target.closest('.player-settings-menu')) {
            closeCharacterMenu();
            closePlayerMenu();
        }
    });

    const worldIndexBackground = document.querySelector('.world-index-background');
    worldIndexBackground.addEventListener('click', () => {
        closeWorldIndex();
    });

    document.body.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeCharacterMenu();
            closePlayerMenu();
            closeWorldIndex();
        }
    });

    document.getElementById('profile-button').addEventListener('click', async () => {
        const characterId = characterMenu.getAttribute('data-character-id');
        if (characterId) {
            closeCharacterMenu();
            await openWorldIndex();
            await openCharacterPage(characterId);
        }
    });
    document.getElementById('instruction-button').addEventListener('click', openCharacterInstructions);
    document.getElementById('simulation-button').addEventListener('click', openSimulationAccordion);
    const simulationToggle = document.getElementById('simulation-toggle');
    simulationToggle.addEventListener('click', (e) => toggleSimulationSlider(simulationToggle));
    simulationToggle.addEventListener('keydown', (e) => handleToggleSimulationKey(e, simulationToggle));

    document.getElementById('previous-simulation-button').addEventListener('click', () => changeSimulationType(-1));
    document.getElementById('next-simulation-button').addEventListener('click', () => changeSimulationType(1));
    document.getElementById('simulation-frequency').addEventListener('change', onSimulationFrequencyChanged);


    document.getElementById('add-icon-button').addEventListener('click', addIcon);
    document.getElementById('close-chat-menu-accessibility').addEventListener('click', closeCharacterMenu);

    // Player menu event handlers
    document.getElementById('player-leave-party-button').addEventListener('click', leaveParty);
    document.getElementById('player-add-icon-button').addEventListener('click', addPlayerIcon);
    document.getElementById('player-add-friend-button').addEventListener('click', toggleFriend);
    document.getElementById('close-player-menu-accessibility').addEventListener('click', closePlayerMenu);
}

export async function setupSocket() {
    addSocketResetListener(onSocketReset);

    await makeSocket();

    addSocketMessageListener(processSocketMessage);

    isLoadingEarlierMessages = false;
}

function initializeSocketMode() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        //wasBackgrounded = false; // Reset background flag on successful connection

        chatContainer = document.querySelector(".chat-container");
        if (chatContainer) {
            while (chatContainer.firstChild) {
                chatContainer.removeChild(chatContainer.firstChild);
            }
        }

        //let the server websocket manager associate the websocket instance with a room and mode
        let room_id = null;

        let socketCharacterId = null;

        if (mode === 'adventure') {
            socketCharacterId = characterId;
        } else if (mode === 'chat') {
            room_id = chat
        } else if (mode === 'simulation') {
            socketCharacterId = simulationCharacterId;
        }
        console.log("socketCharacterId, making socket", socketCharacterId);
        //socket.send(JSON.stringify({ room_id, mode, world, "character": socketCharacterId }));
        if (mode === "adventure" || mode === "simulation") {
            socket.send(JSON.stringify({ 'channel': 'adventure', 'route': 'adventure connect', 'content': { room_id, mode, world, "character": socketCharacterId } }));
        } else if (mode === "chat") {
            socket.send(JSON.stringify({ 'channel': 'chat', 'route': 'chat connect', 'content': { room_id, mode } }));
        }


        // Start heartbeat for activity tracking (only in world mode)
        if (mode === 'adventure') {
            //startHeartbeat(socket);
        }
    }
}

function onSocketReset() {
    initializeSocketMode();
}


//let mode = chat !== null ? 'chat' : (world !== null ? 'world' : null);


//retrieve earlier messages if scroll to top
function retrieveEarlierMessages() {
    //socket.send('retrieve_earlier_messages', { index: messageStartIndex });
    console.log("retrieve earlier scroll request", messageStartIndex);
    isLoadingEarlierMessages = true;
    socket.send(JSON.stringify({ 'channel': mode, 'route': 'retrieve earlier messages', 'content': { index: messageStartIndex } }));
    // if send fails
    // isLoadingEarlierMessages = false;
    // 
}

function sendMessage() {
    if (isStreaming) {
        console.log("Stream already active");
        return;
    }
    let userMessage = document.querySelector('.input-field').value;

    if (userMessage === "") {
        console.log("empty message")
        return;
    }

    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
        console.warn("Socket is closed or closing. Reconnecting...");
        setupSocket();
    }

    console.log("sending userMessage");
    console.log("mode ", mode);
    console.log(userMessage);
    socket.send(JSON.stringify({ 'channel': mode, 'route': 'message', 'content': { 'message': userMessage } }));
}

/*
async function getWorldChat() {
    socket.send(JSON.stringify({ 'route': 'get world chat', 'content': { 'message': userMessage } }));
}*/

function streamResponse(chunk) {
    clearTimeout(timeout); // Clear the previous timeout
    chunk = sanitizeHTML(chunk);

    let closingBracketInChunk = false;
    let openingAtSymbolInChunk = false;
    let openingAtDelimiterInChunk = false;
    let closingAtSymbolInChunk = false;

    // Stop and clear "processing..." animation on first stream message
    if (!hasReceivedFirstStreamMessage) {
        hasReceivedFirstStreamMessage = true;
        responseStreamElement.innerHTML = "";

        // Recreate and reattach currentTextNode since innerHTML cleared it
        currentTextNode = document.createTextNode("");
        responseStreamElement.appendChild(currentTextNode);

        originalMessageStreamElement = document.createElement('p');
    }

    if (chunk.includes('[')) {
        console.log("received opening bracket");
        streamReceivedOpeningBracket = true;
    }

    // Only check for closing bracket if opening bracket was found
    if (streamReceivedOpeningBracket && chunk.includes(']') && !streamReceivedClosingAtDelimiter) {
        console.log("chunk has closing bracket");
        streamReceivedOpeningBracket = false;
        streamReceivedClosingBracket = true;
        closingBracketInChunk = true;

        // Extract the feature name from between brackets
        const content = processStreamElement.textContent;
        const bracketMatch = content.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
            streamingFeatureName = bracketMatch[1];
        }
    }

    if (!closingBracketInChunk && streamReceivedClosingBracket && chunk !== " " && ((!chunk === " " && !chunk.includes('@')) && (!chunk.includes('[') && !chunk.includes('@')))) {
        // Not an id, replace original text
        console.log("not an id, replacing original text, chunk: ", chunk);
        currentTextNode.textContent = responseStreamElement.textContent;
        currentTextNode.textContent += chunk;
        processStreamElement.textContent += chunk;
        originalMessageStreamElement.textContent += chunk;
        return;
    }

    if (streamReceivedClosingBracket && chunk.includes('@')) {
        console.log("received opening @ symbol");
        streamReceivedClosingBracket = false;
        streamReceivedOpeningAtSymbol = true;
        openingAtSymbolInChunk = true;
        if (chunk.includes('@@')) {
            console.log("received opening @@ delimiter");
            streamReceivedOpeningAtSymbol = false;
            streamReceivedOpeningAtDelimiter = true;
            receivingDelimitedId = true;
            openingAtDelimiterInChunk = true;
        }


    }

    // Check for @@ pattern (opening at symbol + delimiter)
    if (!openingAtSymbolInChunk && streamReceivedOpeningAtSymbol && !streamReceivedClosingAtSymbol) {
        if (chunk.includes('@')) {
            console.log("received opening @@ delimiter");
            streamReceivedOpeningAtSymbol = false;
            streamReceivedOpeningAtDelimiter = true;
            openingAtDelimiterInChunk = true;
            receivingDelimitedId = true;
        }
    }

    if (receivingDelimitedId) {
        streamingFeatureId += chunk;
    }

    if (!openingAtSymbolInChunk && !openingAtDelimiterInChunk && streamReceivedOpeningAtDelimiter && chunk.includes('@')) {
        streamReceivedOpeningAtDelimiter = false;
        streamReceivedClosingAtSymbol = true;
        closingAtSymbolInChunk = true;
        console.log("received closing @ symbol");

        if (chunk.includes('@@')) {
            streamReceivedClosingAtSymbol = false;
            streamReceivedClosingAtDelimiter = true;
            console.log("received closing @@ delimiter");
        }
    }

    if (!closingAtSymbolInChunk && streamReceivedClosingAtSymbol && chunk.includes('@')) {
        streamReceivedClosingAtSymbol = false;
        streamReceivedClosingAtDelimiter = true;
        console.log("received closing @@ delimiter");
    }

    if (streamReceivedClosingAtDelimiter) {
        console.log("processing id");
        processStreamElement.textContent += chunk;
        const content = processStreamElement.textContent;
        const idMatch = content.match(/@@([^@]+)@@/);
        if (idMatch) {
            console.log("matched id");
            const id = idMatch[1];
            //currentTextNode.textContent += id;
            addObjectIdMenuSpan(delimitedId);
            delimitedId = '';

            currentTextNode = document.createTextNode("");
            responseStreamElement.appendChild(currentTextNode);
        }
        else {
            console.log("didn't match id");
            //couldn't extract id, replace original text
            currentTextNode.textContent = processStreamElement.textContent;
            currentTextNode.textContent += chunk;
            processStreamElement.textContent += chunk;
        }

        receivingDelimitedId = false;
        streamReceivedClosingAtDelimiter = false;
        originalMessageStreamElement.textContent += chunk;
        return;
    }

    if (chunk === "END_OF_STREAM") {
        isStreaming = false;

        console.log("received: end of stream")

        // Force a reflow to ensure the DOM is updated
        void responseStreamElement.offsetHeight;
        // Force a repaint
        requestAnimationFrame(() => { });

        queueAnnouncement(processStreamElement.textContent);

        if (responseStreamElement.innerHTML == "") {
            console.log('empty response');
            responseStreamElement.closest('.button-container').remove();
        }
        console.log("processing final text");
        responseStreamElement.innerHTML = processMessageText(originalMessageStreamElement.textContent);
        return
    }

    //
    if (!receivingDelimitedId) {
        currentTextNode.textContent += chunk.replace(/[\[\]]/g, '');
        //console.log("Added to currentTextNode:", chunk, "Total visible:", currentTextNode.textContent);
    }

    originalMessageStreamElement.textContent += chunk;
    processStreamElement.textContent += chunk;
    console.log("processStreamElement.textContent: ", processStreamElement.textContent);

    // Autoscrolling
    if (currentTextNode && currentTextNode.parentElement) {
        const textElement = currentTextNode.parentElement;
        const rect = textElement.getBoundingClientRect();
        const containerRect = messageScrollContainer.getBoundingClientRect();

        // If the top of the text element is visible (not above the container), scroll to bottom
        if (rect.top >= containerRect.top && !scrollingMessages) {
            messageScrollContainer.scrollTo({ top: messageScrollContainer.scrollHeight, behavior: 'smooth' });
        }
    }

    timeout = setTimeout(() => {
        console.log("Stream timeout reached. Stopping read.");
        isStreaming = false; // Reset the streaming flag
        queueAnnouncement(processStreamElement.textContent);
        //streamContainer = false;
        console.log("processing final text");
        console.log("originalMessageStreamElement.textContent: ", originalMessageStreamElement.textContent);
        responseStreamElement.innerHTML = processMessageText(originalMessageStreamElement.textContent);
    }, STREAM_TIMEOUT);
}

function addObjectIdMenuSpan(id) {
    const text = processStreamElement.textContent;
    const bracketRegex = /\[([^\]]+)\]/g;
    let match;
    let lastMatch = null;

    // Find the index of the @@id@@ pattern - use the extracted ID from the regex match
    const idMatch = text.match(/@@([^@]+)@@/);
    const extractedId = idMatch ? idMatch[1] : id;
    const idPattern = `@@${extractedId}@@`;
    const idIndex = text.indexOf(idPattern);

    // Find the bracket match where the closing bracket comes before the @@id@@
    while ((match = bracketRegex.exec(text)) !== null) {
        const closingBracketIndex = match.index + match[0].length - 1; // Index of ']'

        // Only consider this match if its closing bracket comes before the @@id@@
        if (closingBracketIndex < idIndex) {
            lastMatch = match;
        }
    }

    console.log("addobject found match, text: ", text, "id: ", id, "idIndex: ", idIndex, "match: ", lastMatch);

    if (!lastMatch) {
        return;
    }
    const objectName = lastMatch[1].trim();
    const beforeText = text.slice(0, lastMatch.index);

    // Find text after the ID pattern @@id@@
    const afterIdMatch = text.match(/@@[^@]+@@(.*)$/);
    let afterText = afterIdMatch ? afterIdMatch[1] : '';
    afterText = afterText.replace(/[\[\]]/g, '');

    // Set the current text node to only the text before the bracketed name
    currentTextNode.textContent = beforeText;

    // Create the span HTML string
    const spanHTML = createWorldFeatureSpan(objectName, id);

    // Create a DOM element from the HTML string
    const tempNode = document.createElement('p');
    tempNode.innerHTML = spanHTML;
    const span = tempNode.firstChild;

    // Insert the span after the current text node
    if (currentTextNode.nextSibling) {
        responseStreamElement.insertBefore(span, currentTextNode.nextSibling);
    } else {
        responseStreamElement.appendChild(span);
    }

    // Add any remaining text after the ID and create new text node for future streaming
    const afterTextNode = document.createTextNode(afterText);
    responseStreamElement.appendChild(afterTextNode);
    // Update currentTextNode to point to this new text node for future streaming
    currentTextNode = afterTextNode;

    console.log('clearing processStreamElement');
    processStreamElement.textContent = "";
}

function createLeftContainer(message, username, userId, characterName, characterId = null, partyId = null, prepend = false,) {
    message = sanitizeHTML(message);
    const newFlexContainer = document.createElement("div");
    newFlexContainer.classList.add("response-container");
    //const iconVisibility = character_id ? 'block' : 'none';
    const iconDisplayClass = 'icon-hidden';
    const id = characterId;
    const displayName = characterName ? characterName : username;

    newFlexContainer.innerHTML = `
        <p class="user-name">${displayName}</p>
        <div class="message-container left-align">
            <button class="character-icon ${iconDisplayClass}" id="${id}" alt="${characterName}, Character Icon">
                <img src="" alt="" class="${iconDisplayClass}">
            </button>
            <div class="user-chat-bubble round">
                <div class="message-text">
                    <p>${message}</p>
                </div>
            </div>
        </div>
    `;
    // Attach menu event listener to character name
    const characterNameButton = newFlexContainer.querySelector(".user-name");

    if (mode === "adventure") {
        characterNameButton.dataset.characterId = characterId;
        characterNameButton.dataset.userId = userId;
        if (partyId) {
            characterNameButton.dataset.partyId = partyId;
        }

        characterNameButton.addEventListener('click', async function (event) {
            event.stopPropagation();

            await openPlayerSettingsMenu(characterNameButton);
            setTimeout(() => {
                const menu = document.getElementById('player-settings-menu');
                const firstMenuItemButton = menu.querySelector('[role="menuitem"] button:not(.sr-only)');
                if (firstMenuItemButton) {
                    firstMenuItemButton.focus();
                }
            }, 0);
        });
    }

    if (id) {
        const img = newFlexContainer.querySelector('img');
        const imageUrl = `${baseUrl}/static/images/${id}.png`;
        loadCharacterIcon(imageUrl, img);
    }

    //add chat bubble to dom
    if (prepend) {
        const scrollTop = messageScrollContainer.scrollTop; // Get current scroll position of the container
        const scrollHeightBefore = messageScrollContainer.scrollHeight; // Get the scroll height before adding content

        chatContainer.prepend(newFlexContainer); // Prepend the new content

        const scrollHeightAfter = messageScrollContainer.scrollHeight; // Get the new scroll height after adding content
        const addedHeight = scrollHeightAfter - scrollHeightBefore; // Calculate the height of the added content

        messageScrollContainer.scrollTo(0, scrollTop + addedHeight); // Adjust scroll position to maintain the view
    } else {
        chatContainer.appendChild(newFlexContainer);
    }

    return newFlexContainer.querySelector('.message-text p');
}

function createRightContainer(message, name = "", id = "", partyId = "", prepend = false) {
    const processedMessage = processMessageText(message);
    const newFlexContainer = document.createElement("div");
    newFlexContainer.classList.add("response-container");
    const iconDisplayClass = 'icon-hidden';
    name = name ?? "";
    if (name == "narrator") {
        name = "";
    }
    id = id ?? "";

    const shouldHideNameButton = name === "" || name === "none";
    const hiddenAttribute = shouldHideNameButton ? 'hidden' : '';

    newFlexContainer.innerHTML = `
        <button
            class="character-name"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="character-settings-menu"
            aria-label="${name}"
            ${hiddenAttribute}
        >
            ${name}
        </button>
        <div class="message-container right-align">
            <div class="chat-bubble round">
                <div class="message-text">
                    <p></p>
                </div>
            </div>
            <button class="character-icon ${iconDisplayClass}" id="${id}" alt="${name}, Character Icon">
                <img src="" alt="" class="${iconDisplayClass}">
            </button>
        </div>
    `;

    const messageElement = newFlexContainer.querySelector('.message-text p');
    messageElement.innerHTML = processedMessage;

    // Attach menu event listener to character name
    const characterNameButton = newFlexContainer.querySelector(".character-name");
    characterNameButton.dataset.characterId = id;
    characterNameButton.dataset.partyId = partyId;

    // Only add event listeners if the button is not hidden
    if (!shouldHideNameButton) {
        characterNameButton.addEventListener('click', async function (event) {
            event.stopPropagation();
            openCharacterMenu(characterNameButton)
            setTimeout(() => {
                const menu = document.getElementById('character-settings-menu');
                const firstMenuItemButton = menu.querySelector('[role="menuitem"] button:not(.sr-only)');
                if (firstMenuItemButton) {
                    firstMenuItemButton.focus();
                }
            }, 0);
        });
    }

    if (id) {
        const img = newFlexContainer.querySelector('img');
        const imageUrl = `${baseUrl}/static/images/${id}.png`;
        loadCharacterIcon(imageUrl, img);
    }

    if (prepend) {
        chatContainer.prepend(newFlexContainer);
    } else {
        chatContainer.appendChild(newFlexContainer);
    }

    // Attach event delegation for world-feature-span clicks
    const messageTextDiv = newFlexContainer.querySelector('.message-text');
    if (!messageTextDiv._featureClickAttached) {
        messageTextDiv.addEventListener("click", function (e) {
            const span = e.target.closest(".world-feature-span");
            if (!span) return;
            const objectId = span.dataset.objectId;
            if (!objectId) {
                console.warn("Clicked .world-feature-span without a valid objectId.", { span, event: e });
                return;
            }
            if (objectId.startsWith("c")) openCharacterMenu(span);
            else if (objectId.startsWith("l")) openLocationMenu(span);
            else if (objectId.startsWith("p")) openPlayerCharacterMenu(span);
        });
        messageTextDiv._featureClickAttached = true;
    }

    return messageElement;
}

function addNearbyActivity(content) {
    let message = content.message
    let sender = content.sender
    let partyId = content.party_id || null
    let nearbyActivityMessageElement = createRightContainer(message, sender, "", partyId)
    applyNearbyActivityMessageStyles(nearbyActivityMessageElement);
}

function loadCharacterIcon(url, imgElement) {
    imgElement.src = url;

    imgElement.onload = () => {
        //imgElement.style.display = 'block';
        imgElement.classList.remove('icon-hidden');

        const parent = imgElement.closest('.character-icon');
        if (parent) {
            //parent.style.display = 'block';
            parent.classList.remove('icon-hidden');
        }
    };
}

function processSocketMessage(data) {
    console.log("received ws message");

    if (data.channel !== 'conversation') {
        return;
    }

    switch (data.route) {
        case 'server message':
            handleServerMessage(data);
            break;
        case 'user message':
            handleUserMessage(data.content);
            break;
        case 'received message':
            handleNotifyReceivedMessage();
            break;
        case 'received message busy':
            handleNotifyBusy();
            break;
        case 'received room message':
            handleNotifyRoomMessage();
            break;
        case 'set response sender':
            console.log('received request to set sender');
            handleSetSender(data.content);
            break;
        case 'response stream':
            //console.log("print")
            streamResponse(data.content.word);
            break;
        case 'nearby activity':
            addNearbyActivity(data.content);
            break;
        case 'conversation':
            addConversation(data.content);
            break;
        case 'earlier messages':
            addEarlierMessages(data.content);
            break;
        case 'receive world chat':
            console.log("received world chat id route");
            receiveWorldChat(data.content);
            break;
        case 'party id response':
            handlePartyIdResponse(data.content);
            break;
        case 'friend status response':
            handleFriendStatusResponse(data.content);
            break;
        case 'set world':
            handleSetWorld(data.content);
            break;
        default:
            console.log('Unknown message route:', data.content);
    }
}

//need to make button normal again
function handleNotifyReceivedMessage() {
    //if streaming = false on server for room, meaning an ai stream will begin for the prompt, then message is sent here, send only to client that sent prompt
    promptArea.value = "";
    //shrink textarea
    autoResizeInputField();
    //make button normal again
    console.log("message received, processing will begin")
}

//make button normal
function handleNotifyBusy() {
    // if streaming = true on server for room, then message is sent here, send only to client that sent prompt
    // important, user may send messages in same interval, or in case one user doesn't receive "notifyRoomMessage" that sets isStreaming to true due to connection issue
    //
    // make button normal again
    console.log("server busy processing another room message")
};

//make button normal
function handleNotifyRoomMessage() {
    // stop users from sending messages to save server resources while a message is being processed
    isStreaming = true;

    timeout = setTimeout(() => {
        console.log("Stream timeout reached. Stopping stream.");
        isStreaming = false; // Reset the streaming flag
    }, STREAM_TIMEOUT);

    // make button normal again
    console.log("received message from a user, streaming will begin")
};

function handleServerMessage(content) {
    // error messages and server communication
    console.log("server message: " + content.text)
    rightAlignedP = createRightContainer();
    rightAlignedP.innerHTML = content.text;
}

function handleUserMessage(content) {
    console.log("Received user message from server");
    const leftContainer = createLeftContainer(content.text, content.username, content.user_id, content.character, content.character_id, content.party_id);
    // rightAlignedP = createRightContainer(); now creating when set sender name

    if (!scrollingMessages) {
        leftContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function handleSetSender(content) {
    console.log(content.sender);
    console.log(content.sender_id);

    var responseCharacter = content.sender;
    if (content.sender === "narrator") {
        responseCharacter = null;
    }

    delimitedId = '';
    // reset flag that shows currently streaming delimited id
    receivingDelimitedId = false;
    previousStreamWord = null;
    const responseCharacterId = content.sender_id;

    responseStreamElement = createRightContainer("", responseCharacter, responseCharacterId, false);
    processStreamElement = document.createElement("p");

    // Clear the existing content and create a new text node
    //responseStreamElement.textContent = ""; // Clear any existing content
    currentTextNode = document.createTextNode("");
    responseStreamElement.appendChild(currentTextNode);

    // Initialize screen reader accessibility for new response
    createAriaLiveRegion();
    resetAriaAnnouncements();

    // Start processing animation
    hasReceivedFirstStreamMessage = false;
    startProcessingAnimation();

    // Scroll to bottom
    messageScrollContainer.scrollTo({ top: messageScrollContainer.scrollHeight, behavior: 'smooth' });
}

function startProcessingAnimation() {
    processingStep = 0;
    const timeInterval = 170;

    const processingAnimationInterval = setInterval(() => {
        if (hasReceivedFirstStreamMessage) {
            // Stop animation when first stream message arrives
            clearInterval(processingAnimationInterval);
            return;
        }

        const dots = '.'.repeat(processingStep);
        const processingText = `Processing${dots}`;

        if (currentTextNode) {
            currentTextNode.textContent = processingText;
        }

        processingStep = (processingStep + 1) % 4; // Cycle through 0, 1, 2, 3
    }, timeInterval); // Update every 500ms
}

//examine rename flex-container
function addConversation(content) {
    console.log('received recent conversation')
    const textContainers = document.querySelectorAll('.response-container');

    textContainers.forEach(container => {
        container.parentNode.removeChild(container);
    });

    if (content.messages && Array.isArray(content.messages)) {
        content.messages.forEach(item => {
            if (item.sender && item.message) {
                console.log(item.sender)
                let character = item.name || 'none'
                let character_id = item.character_id || 'none';

                if (item.sender === "user" || item.sender === "player") {
                    createLeftContainer(item.message, item.username, item.user_id, item.name, character_id, item.party_id, false);
                }
                if (item.sender === "assistant") {
                    const messageEl = createRightContainer(item.message, character, character_id, item.party_id, false);
                    if (isNearbyActivitySpeakerName(character)) {
                        applyNearbyActivityMessageStyles(messageEl);
                    }
                }
            }
        });
    }
    if (content.current_message) {
        const messageContainers = document.querySelectorAll('.flex-container');
        if (messageContainers.length > 0) {
            const mostRecentContainer = messageContainers[messageContainers.length - 1];
            const paragraph = mostRecentContainer.querySelector('p');
            if (paragraph) {
                paragraph.innerHTML = content.current_message + paragraph.innerHTML;
            }
        }
    } else {
        console.log("No current message received");
    }

    if ('startIndex' in content) {
        messageStartIndex = content.startIndex;
        console.log("start index" + messageStartIndex);
    } else {
        console.log("no startIndex received for messages");
    }

    messageScrollContainer.scrollTo({ top: messageScrollContainer.scrollHeight, behavior: 'auto' });

    markConversationLoaded();
};

function addEarlierMessages(content) {
    console.log('adding earlier messages');
    console.log('Received data:', JSON.stringify(content));

    isLoadingEarlierMessages = false;

    if (content.messages && Array.isArray(content.messages)) {
        for (let i = content.messages.length - 1; i >= 0; i--) {
            let item = content.messages[i];
            let user = item.user || 'none';
            let character = item.name || '';
            let character_id = item.character_id || 'none';
            if (item.sender && item.message) {
                console.log(item.sender);
                if (item.sender === "user" || item.sender === "player") {
                    createLeftContainer(item.message, user, item.user_id, item.name, character_id, item.party_id, true);
                }
                if (item.sender === "assistant") {
                    const messageEl = createRightContainer(item.message, character, character_id, item.party_id, true);
                    if (isNearbyActivitySpeakerName(character)) {
                        applyNearbyActivityMessageStyles(messageEl);
                    }
                }
            }
        }
    } else {
        console.log("No messages array or not an array.");
    }

    if ('startIndex' in content) {
        messageStartIndex = content.startIndex;
        console.log("start index" + messageStartIndex);
    } else {
        console.log("no startIndex received for messages");
    }

    // If earlier messages are used for initial history, allow this to satisfy loading as well
    markConversationLoaded();
}

function autoResizeInputField() {
    const textarea = document.querySelector('.input-field'); // Selecting the textarea element

    // Reset height to 'auto' to allow shrinkage if the content is removed
    textarea.style.height = 'auto';

    // Set height based on the maximum of scrollHeight and a minimum value, ensuring it doesn't shrink below 5px
    textarea.style.height = `${Math.max(textarea.scrollHeight, 5)}px`;

    // Limit the maximum height to 300px
    if (textarea.scrollHeight > 300) {
        textarea.style.height = '300px';
    }

    // Store the initial scroll height for future reference if not already stored
    if (!textarea.dataset.initialScrollHeight) {
        textarea.dataset.initialScrollHeight = textarea.scrollHeight;
        console.log('Initial scrollHeight stored:', textarea.dataset.initialScrollHeight);
    }
    if (textarea.scrollHeight == textarea.dataset.initialScrollHeight) {
        //57px prevents scrollbar
        textarea.style.height = '57px';
    }
}

export function navigateBack() {
    if (mode === "adventure") {
        navigateBackIndex();
    } else if (mode === "chat") {
        navigatePage('chat-select');
    }

}





//function event listener menu item open world chat,
// navigates to chat page, both conversation.js chat id stored in worlds[world][rooms][room_id][chat]