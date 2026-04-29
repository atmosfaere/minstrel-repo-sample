import { baseUrl } from './app.js';
import { setCharacterId } from './adventure/adventure.js';
import { createAriaLiveRegion, queueAnnouncement } from './aria.js';
import { userAdventures } from './adventure-select.js';
import { world } from './app.js';
import { resetCurrentIndexPage } from './world-index.js';

let pageData = null;
let characterId = null;
let partyInviteId = null;

export function load() {
    // Announce world name when entering world page for accessibility
    const worldName = getWorldName();
    if (worldName) {
        createAriaLiveRegion();
        queueAnnouncement(`${worldName}.`);
    }
    
    createPage();
    bindEvents();

}

function createPage() {
    const worldPageDiv = document.querySelector('.world-page');
    //make sure character name is reset here
    characterId = null;
    console.log(pageData);
    if (!pageData) {
        console.log("Can't open world page, no page data")
        navigatePage('adventure-select');
    }

    const worldName = document.createElement('h1');
    worldName.className = 'world-page-name';
    worldName.textContent = pageData.name;
    worldPageDiv.appendChild(worldName);

    // Add Description, description = summary unless it is modified when making public
    if (pageData.description) {
        const descriptionTitle = document.createElement('p');
        descriptionTitle.className = 'world-page-titles';
        descriptionTitle.textContent = 'Description:';
        worldPageDiv.appendChild(descriptionTitle);

        const descriptionDiv = document.createElement('div');
        descriptionDiv.className = 'world-info-field-world-page';
        const descriptionP = document.createElement('p');
        descriptionP.textContent = pageData.description;
        descriptionDiv.appendChild(descriptionP);
        worldPageDiv.appendChild(descriptionDiv);
    }

    /*
    // Add Summary
    if (pageData && pageData.summary) {
        const summaryTitle = document.createElement('p');
        summaryTitle.className = 'world-page-titles';
        summaryTitle.textContent = 'Summary:';
        worldPageDiv.appendChild(summaryTitle);

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'world-summary';
        const summaryP = document.createElement('p');
        summaryP.textContent = pageData.summary;
        summaryDiv.appendChild(summaryP);
        worldPageDiv.appendChild(summaryDiv);
    }*/

    // Add Notes
    if (pageData.notes) {
        const notesTitle = document.createElement('p');
        notesTitle.className = 'world-page-titles';
        notesTitle.textContent = 'Notes:';
        worldPageDiv.appendChild(notesTitle);

        const notesDiv = document.createElement('div');
        notesDiv.className = 'world-info-field-world-page';
        const notesP = document.createElement('p');
        notesP.textContent = pageData.notes;
        notesDiv.appendChild(notesP);
        worldPageDiv.appendChild(notesDiv);
    }

    // Add Character Name
    if (pageData.character_name && pageData.character_id) {
        characterId = pageData.character_id;

        const characterNameTitle = document.createElement('p');
        characterNameTitle.className = 'world-page-titles';
        characterNameTitle.textContent = 'Character name:';
        worldPageDiv.appendChild(characterNameTitle);

        const characterDiv = document.createElement('div');
        characterDiv.className = 'world-info-field-world-page';
        const charP = document.createElement('p');
        charP.textContent = pageData.character_name;
        characterDiv.appendChild(charP);
        worldPageDiv.appendChild(characterDiv);

        // Create enter world button
        const enterWorldButton = document.createElement('button');
        enterWorldButton.type = 'button';
        enterWorldButton.className = 'enter-world-button';
        enterWorldButton.id = 'enter-world-button';
        enterWorldButton.innerHTML = 'Enter<br>World';
        worldPageDiv.appendChild(enterWorldButton);
    } else {
        
        if (Array.isArray(userAdventures) && userAdventures.includes(world)) {
            //add join world button
            console.log("world added, no character");
            console.log(pageData.character_name);
            console.log(pageData.character_id);

            const joinWorldButton = document.createElement('button');
            joinWorldButton.type = 'button';
            joinWorldButton.className = 'enter-world-button';
            joinWorldButton.id = 'enter-world-button';
            joinWorldButton.innerHTML = 'Join<br>World';
            worldPageDiv.appendChild(joinWorldButton);
        } else {
            
            //add add world and join world buttons
            console.log("world not in users worlds add and join button");
            /*
            const addWorldButton = document.createElement('button');
            addWorldButton.type = 'button';
            addWorldButton.className = 'enter-world-button';
            addWorldButton.id = 'add-world-button';
            addWorldButton.innerHTML = 'Add<br>World';
            worldPageDiv.appendChild(addWorldButton);
            */
            const joinWorldButton = document.createElement('button');
            joinWorldButton.type = 'button';
            joinWorldButton.className = 'enter-world-button';
            joinWorldButton.id = 'join-world-button';
            joinWorldButton.innerHTML = 'Join<br>World';
            worldPageDiv.appendChild(joinWorldButton);
        }
    }

    
}

function bindEvents() {
    const enterWorldButton = document.getElementById('enter-world-button');
    const addWorldButton = document.getElementById('add-world-button');
    const joinWorldButton = document.getElementById('join-world-button');


    if (enterWorldButton) {
        enterWorldButton.addEventListener('click', function () {
            if (characterId != null && characterId !== '') {
                setCharacterId(characterId);
                resetCurrentIndexPage();
                // if invite_link make sure world is added to user worlds, may have deleted previously
                navigatePage('world');
                //enterWorld();
            } else {
                //join world called when joining shared, public world, or when adding new character
                navigatePage('create-character');
            }
        });
    }

    if (addWorldButton) {
        addWorldButton.addEventListener('click', function () {
            addWorld();
        });
    }

    if (joinWorldButton) {
        joinWorldButton.addEventListener('click', function () {
            navigatePage('create-character');
        });
    }
    
    const backArrowButton = document.querySelector('.back-arrow');
    backArrowButton.setAttribute('aria-label', 'Back Button');
    backArrowButton.addEventListener('click', function () {
        navigatePage('adventure-select');
    })
}

export async function getWorldPage(worldId, characterId = null) {
    const url = `${baseUrl}/world-page/`;
    const body = { world_id: worldId };
    if (characterId) {
        body.character_id = characterId;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching world page.');
        }

        const data = await response.json();
        /*
        const dataDict = {};


        //process list of strings into objects, save server cpu
        data.forEach(item => {
            if (typeof item === "string") {
                try {
                    item = JSON.parse(item);
                } catch (error) {
                    console.error("Invalid JSON format:", item);
                    return; 
                }
            }

            const key = Object.keys(item)[0];  // Get the first key from each object
            dataDict[key] = item[key];  // Assign value to the dictionary
        });*/
        console.log(data);

        //return dataDict; 
        return data; 
        
    } catch (error) {
        console.error('Error fetching world page.', error);
    }
}

// Could display party members when joining world
export function setPartyIdWorldPage(partyId) {
    partyInviteId = partyId;
}

export function setPage(dataDict) {
    pageData = dataDict;
}

// For screen reader
export function getWorldName() {
    return pageData ? pageData.name : null;
}