import { baseUrl, world } from './app.js';

let simulationContainer;
let simulationSearch;
let simulationCharacterSelect;
let chatContainer;
let inputContainer;
let messageScrollContainer;
let controlArea;
let backToChatButton;
let simulationCharacterId = null;
let simulationUiInitialized = false;

export function initializeSimulationView() {
	// Lazy-initialize DOM element references on first call
	if (!chatContainer) {
		chatContainer = document.querySelector(".chat-container");
		inputContainer = document.querySelector('.input-container');
		messageScrollContainer = document.querySelector(".message-scroll-container");
		controlArea = document.querySelector('.control-area');
	}

	if (!simulationUiInitialized) {
		createSimulationUI();
	}

	// Switch the view
	window.chatModule.mode = 'simulation';

	// Clear existing messages robustly
	if (chatContainer) {
		while (chatContainer.firstChild) {
			chatContainer.removeChild(chatContainer.firstChild);
		}
	}

	// Show simulation UI, hide chat controls and message area
	simulationContainer.style.display = '';
	inputContainer.style.display = 'none';
	messageScrollContainer.style.display = 'none';
	if (controlArea) controlArea.style.display = 'none';
	fetchSimulatedCharacters();

	// Move focus to the character select dropdown
	if (simulationCharacterSelect) {
		simulationCharacterSelect.focus();
	}
}

function createSimulationUI() {
	simulationContainer = document.createElement('div');
	simulationContainer.id = 'simulation-container';
	simulationContainer.className = 'simulation-container';
	simulationContainer.style.display = 'none';

	simulationSearch = document.createElement('input');
	simulationSearch.type = 'text';
	simulationSearch.id = 'simulation-search';
	simulationSearch.placeholder = 'Search for a character...';
	simulationSearch.addEventListener('input', filterCharacters);

	simulationCharacterSelect = document.createElement('select');
	simulationCharacterSelect.id = 'simulation-character-select';
	simulationCharacterSelect.innerHTML = '<option value="" disabled selected>Select a character</option>';
	simulationCharacterSelect.addEventListener('change', onCharacterSelect);

	backToChatButton = document.createElement('button');
	backToChatButton.id = 'back-to-chat-button';
	backToChatButton.textContent = 'Back to Chat';
	backToChatButton.addEventListener('click', exitSimulationMode);

	simulationContainer.appendChild(simulationSearch);
	simulationContainer.appendChild(simulationCharacterSelect);
	simulationContainer.appendChild(backToChatButton);

	const pageContainer = document.querySelector('.page-container');
	pageContainer.prepend(simulationContainer);
	simulationUiInitialized = true;
}

function exitSimulationMode() {
	window.chatModule.mode = 'world'; // Or whatever the default is
	chatContainer.innerHTML = '';
	// Hide simulation UI, show chat controls and message area
	simulationContainer.style.display = 'none';
	inputContainer.style.display = '';
	messageScrollContainer.style.display = '';
	if (controlArea) controlArea.style.display = '';
	// Potentially reload original chat messages if needed

	//Re-initialize the socket with the new mode
	window.chatModule.setupSocket();

	// Move focus back to the chat input field
	const input = document.querySelector('.input-field');
	if (input) {
		input.focus();
	}
}

async function fetchSimulatedCharacters() {
	try {
		const response = await fetch(`${baseUrl}/get_simulated_characters?world_id=${world}`);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const characters = await response.json();
		populateCharacterSelect(characters);
	} catch (error) {
		console.error("Could not fetch simulated characters:", error);
	}
}

function populateCharacterSelect(characters) {
	simulationCharacterSelect.innerHTML = '<option value="" disabled selected>Select a character</option>';

	// Get current user ID from JWT token
	const currentUserId = getCurrentUserId();

	characters.sort((a, b) => {
		const aIsUser = a.user_id === currentUserId;
		const bIsUser = b.user_id === currentUserId;
		if (aIsUser && !bIsUser) return -1;
		if (!aIsUser && bIsUser) return 1;
		return a.name.localeCompare(b.name);
	});

	characters.forEach(character => {
		if (character.visible || character.user_id === currentUserId) {
			const option = document.createElement('option');
			option.value = character.id;
			option.textContent = character.name;
			simulationCharacterSelect.appendChild(option);
		}
	});
}

function filterCharacters() {
	const filter = simulationSearch.value.toLowerCase();
	for (let option of simulationCharacterSelect.options) {
		if (option.value === "") continue;
		const text = option.textContent.toLowerCase();
		option.style.display = text.includes(filter) ? '' : 'none';
	}
}

function onCharacterSelect(event) {
	simulationCharacterId = event.target.value;
	if (simulationCharacterId) {
		window.chatModule.simulationCharacterId = simulationCharacterId;
		chatContainer.innerHTML = ''; // Clear for new character chat
		messageScrollContainer.style.display = '';
		window.chatModule.setupSocket();
	}
}

// Helper function to get current user ID from JWT token
function getCurrentUserId() {
	// Extract user ID from JWT access_token cookie
	const value = `; ${document.cookie}`;
	const parts = value.split(`; access_token=`);
	if (parts.length === 2) {
		const token = parts.pop().split(';').shift();
		try {
			// JWT payload is the middle part (between the dots)
			const payloadBase64 = token.split('.')[1];
			if (payloadBase64) {
				// Decode base64 payload
				const payload = JSON.parse(atob(payloadBase64));
				return payload.sub; // 'sub' field contains user_id
			}
		} catch (error) {
			console.error('Error decoding JWT token:', error);
		}
	}
	return null;
} 