import { baseUrl, navigatePage, world } from './app.js';
import { setCharacterId } from './adventure/adventure.js';

let characterId = null;
let partyInviteId = null;

export function load() {
    createPage();
    bindEvents();

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
    })

    //const enterWorldButton = document.querySelector('.enter-world-button');

    document.querySelector(".enter-world-button").addEventListener("click", async function () {
        // Retrieve values from the form fields
        const characterName = document.getElementById("character-name").value.trim();
        // Correcting ID for character summary as per previous feedback
        const characterSummary = document.getElementById("character-summary").value.trim(); // Ensure this id is unique and correctly assigned in the HTML

        // Check if characterName are empty
        if (!characterName) {
            alert("Character name is required.");
            return; // Stop execution if the check fails
        }
        console.log('create-char', world);
        // Create a JSON object with the data
        const data = {
            world: world,
            character_name: characterName,
            character_summary: characterSummary,
            party_id: partyInviteId
        };

        // Define the URL where the request will be sent
        const url = `${baseUrl}/create-character`;

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
                const characterId = jsonResponse.character_id;
                //setWorld(worldId);
                setCharacterId(characterId);
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

export function setPartyId(partyId) {
    partyInviteId = partyId;
}

export function navigateBack() {
    navigatePage('adventure-select');
}