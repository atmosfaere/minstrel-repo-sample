import { baseUrl, setWorld } from './app.js';
import { setCharacterId } from './adventure/adventure.js';
import { userAdventures } from './adventure-select.js';

let characterId = null;

export function load() {
    createPage();
    bindEvents();
    
    // Set focus to the world name textarea
    const worldNameTextarea = document.getElementById('world-name');
    if (worldNameTextarea) {
        worldNameTextarea.focus();
    }
    
    // Ensure advanced section starts collapsed
    const advancedContent = document.getElementById('advanced-content');
    if (advancedContent) {
        advancedContent.hidden = true;
    }
}

function bindEvents() {
    const textAreas = document.querySelectorAll('.world-info-field');

    textAreas.forEach((textarea) => {
        textarea.addEventListener('input', () => {
            resizeTextarea(textarea);
        });
    });

    const backArrowButton = document.querySelector('.back-arrow');
    backArrowButton.setAttribute('aria-label', 'Back Button');
    backArrowButton.addEventListener('click', function () {
        navigatePage('adventure-select');
    });

    // Advanced section toggle
    const advancedToggle = document.getElementById('advanced-toggle');
    const advancedContent = document.getElementById('advanced-content');
    const dropdownArrow = document.querySelector('.dropdown-arrow');

    advancedToggle.addEventListener('click', function() {
        advancedContent.hidden = !advancedContent.hidden;
        dropdownArrow.classList.toggle('rotated', advancedContent.hidden);
    });

    // Conditional visibility handlers
    setupConditionalVisibility();

    //const enterWorldButton = document.querySelector('.enter-world-button');

    document.querySelector(".enter-world-button").addEventListener("click", async function () {
        // Retrieve values from the form fields
        const worldName = document.getElementById("world-name").value.trim();
        const worldSummary = document.getElementById("world-summary").value.trim();
        const characterName = document.getElementById("character-name").value.trim();
        // Correcting ID for character summary as per previous feedback
        const characterSummary = document.getElementById("character-summary").value.trim(); // Ensure this id is unique and correctly assigned in the HTML

        // Check if worldName or characterName are empty
        if (!worldName || !characterName) {
            alert("World name and character name are required.");
            return; // Stop execution if the check fails
        }

        // Create a JSON object with the data including advanced settings
        const advancedSettings = getAdvancedSettings();
        const data = {
            world_name: worldName,
            world_summary: worldSummary,
            character_name: characterName,
            character_summary: characterSummary,
            advanced_settings: advancedSettings
        };

        // Define the URL where the request will be sent
        const url = `${baseUrl}/create-world`;

        try {
            // Send a POST request to the server
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(data)
            });

            // Check if the request was successful
            if (response.ok) {
                const jsonResponse = await response.json();
                const worldId = jsonResponse.world_id;
                const characterId = jsonResponse.character_id;
                setWorld(worldId);
                setCharacterId(characterId);
                // Tell the world loading overlay that this world was just created
                try {
                    if (window.sessionStorage) {
                        window.sessionStorage.setItem('worldLoadingMode', 'creating');
                    }
                } catch (e) {
                    console.warn('Unable to set worldLoadingMode in sessionStorage', e);
                }
                navigatePage('world');
            } else {
                throw new Error("Failed to save details.");
            }
        } catch (error) {
            console.error(error);
            alert("Error saving details.");
        }
    });
}

function createPage() {
    const worldPageDiv = document.querySelector('.world-page');
    
    // Create enter world button
    const enterWorldButton = document.createElement('button');
    enterWorldButton.type = 'button';
    enterWorldButton.className = 'enter-world-button';
    enterWorldButton.innerHTML = 'Create<br>World';
    worldPageDiv.appendChild(enterWorldButton);
}

function resizeTextarea(el) {
    el.style.height = 'auto';  // Temporarily reset the height to calculate the scrollHeight correctly
    let newHeight = Math.min(el.scrollHeight, 300);  // Determine the new height based on content but limit to 300px
    el.style.height = newHeight + 'px';  // Apply the new height to the textarea
}

function setupConditionalVisibility() {
    const multiverseSelect = document.getElementById('minstrel-multiverse');
    const createPortalsSelect = document.getElementById('create-portals');
    const simulationSelect = document.getElementById('simulation');

    // Get all conditional elements
    const multiverseDependent = document.querySelectorAll('.multiverse-dependent');
    const portalDependent = document.querySelectorAll('.portal-dependent');
    const simulationDependent = document.querySelectorAll('.simulation-dependent');

    function updateVisibility() {
        // Handle multiverse-dependent items
        const multiverseEnabled = multiverseSelect.value === 'true';
        multiverseDependent.forEach(element => {
            if (multiverseEnabled) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        });

        // Handle portal-dependent items (only show if multiverse is enabled AND create portals is not 'false')
        const portalsEnabled = multiverseEnabled && createPortalsSelect.value !== 'false';
        portalDependent.forEach(element => {
            if (portalsEnabled) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        });

        // Handle simulation-dependent items
        const simulationEnabled = simulationSelect.value === 'true';
        simulationDependent.forEach(element => {
            if (simulationEnabled) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        });
    }

    // Add event listeners
    multiverseSelect.addEventListener('change', updateVisibility);
    createPortalsSelect.addEventListener('change', updateVisibility);
    simulationSelect.addEventListener('change', updateVisibility);

    // Initial setup
    updateVisibility();
}

function getAdvancedSettings() {
    return {
        world_settings: {
            add_player: document.getElementById('add-player').value,
            multiplayer: document.getElementById('multiplayer').value,
            minstrel_multiverse: document.getElementById('minstrel-multiverse').value,
            world_entry_origins: document.getElementById('entry-origins').value,
            destination_worlds: document.getElementById('destination-worlds').value,
            simulation: document.getElementById('simulation').value,
            public: document.getElementById('public').value
        },
        player_settings: {
            world_building: document.getElementById('world-building').value,
            view_entries: document.getElementById('view-entries').value,
            discover_new_locations: document.getElementById('discover-locations').value === 'true',
            discover_new_characters: document.getElementById('discover-characters').value === 'true',
            create_portals: document.getElementById('create-portals').value,
            incoming_worlds: document.getElementById('player-incoming').value,
            destination_worlds: document.getElementById('player-destination').value,
            copy_world: document.getElementById('copy-world').value,
            set_simulation: document.getElementById('set-simulation').value,
            owned_locations: document.getElementById('owned-locations').value
        }
    };
}

export function navigateBack() {
    navigatePage('adventure-select');
}