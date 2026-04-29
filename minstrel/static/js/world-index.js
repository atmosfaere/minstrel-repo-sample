import { baseUrl, world} from './app.js';
import { debounce } from './utility.js';

import { openMainIndexPage } from './world-index/page-renderers/main-page.js';
import { openWorldPage } from './world-index/page-renderers/world-page.js';
import { openLocationPage } from './world-index/page-renderers/location-page.js';
import { openCharacterPage } from './world-index/page-renderers/character-page.js';
import { openObjectPage } from './world-index/page-renderers/object-page.js';
import { openDocumentPage } from './world-index/page-renderers/document-page.js';
//import { openContainerPage } from './world-index/page-renderers/container-page.js';
import { trapFocus } from './world-index/world-index-accessibility.js';
import { restoreFocus } from './world-index/world-index-accessibility.js';


export let currentPage = "main";

export function setCurrentPage(page) {
    currentPage = page;
}

let lastInteractionWasKeyboard = false;


let worldIndexOpen = false;

// Not really using lastInteractionWasKeyboard
document.addEventListener('keydown', (e) => {
    // Only consider navigation keys as keyboard interaction
    if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Space' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Escape') {
        lastInteractionWasKeyboard = false;
    }
});

document.addEventListener('mousedown', () => {
    lastInteractionWasKeyboard = false;
});

export async function openWorldIndex() {
    const worldIndex = document.querySelector('.world-index');
    const worldIndexButton = document.querySelector('.world-index-button');
    const worldIndexBackground = document.querySelector('.world-index-background');
    const navigationBar = document.querySelector('.navigation-bar');

    worldIndexBackground.hidden = false;
    worldIndexButton.setAttribute("aria-expanded", "true");
    worldIndex.hidden = false;
    navigationBar.hidden = true;

    worldIndex.setAttribute('role', 'dialog');
    worldIndex.setAttribute('aria-modal', 'true');
    worldIndex.setAttribute('aria-labelledby', 'world-index-title');

    history.pushState({ worldIndex: true}, '', '');
    
    console.log("pushing state", currentPage);
    if (currentPage === "main") {
        await openMainIndexPage();
    } else if (currentPage === "world") {
        await openWorldPage();
    }
        else {
        await openPage(currentPage);
    }
    
    trapFocus(worldIndex);
    
    // Focus first element if keyboard interaction
    if (lastInteractionWasKeyboard) {
        const firstFocusable = worldIndex.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
    }
    const firstFocusable = worldIndex.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
    firstFocusable.focus();

    worldIndexOpen = true;
}

export function closeWorldIndex() {
    const worldIndex = document.querySelector('.world-index');
    const worldIndexButton = document.querySelector('.world-index-button');
    const worldIndexBackground = document.querySelector('.world-index-background');
    const navigationBar = document.querySelector('.navigation-bar');

    worldIndexBackground.hidden = true;

    worldIndexButton.setAttribute("aria-expanded", "false");
    worldIndex.hidden = true;
    worldIndex.innerHTML = "";
    
    navigationBar.hidden = false;
    
    // Clean up ARIA attributes
    worldIndex.removeAttribute('role');
    worldIndex.removeAttribute('aria-modal');
    worldIndex.removeAttribute('aria-labelledby');

    // Restore focus and remove focus trap
    restoreFocus();
 
    if (lastInteractionWasKeyboard) {
        console.log("lastInteractionWasKeyboard");
    }

    worldIndexButton.focus();
    worldIndexButton.blur();

    const buttonImg = worldIndexButton.querySelector('img');
    buttonImg.style.filter = 'none';
    buttonImg.style.backgroundColor = 'transparent';

    worldIndexOpen = false;
}

export async function openPage(parsedTag) {
    if (parsedTag.startsWith('l')) {
        await openLocationPage(parsedTag);
    } else if (parsedTag.startsWith('c')) {
        await openCharacterPage(parsedTag);
    } else if (parsedTag.startsWith('d')) {
        await openDocumentPage(parsedTag);
    } else if (parsedTag.startsWith('s')) {
        await openContainerPage(parsedTag);
    } else if (parsedTag.startsWith('o')) {
        await openObjectPage(parsedTag);
    } else {
        console.warn(`Unrecognized id prefix character: ${parsedTag}`);
        openMainIndexPage();
    }
}

export function resetCurrentIndexPage() {
    currentPage = "main";
}

export async function navigateBackIndex() {
    if (worldIndexOpen) {
        if (currentPage !== "main") {
            // Don't push new state when going back to main
            currentPage = "main";
            await openMainIndexPage();
            console.log("Navigating back to main world index");
            
            // Re-establish focus trap on world index after navigation
            const worldIndex = document.querySelector('.world-index');
            trapFocus(worldIndex);
        } else {
            closeWorldIndex();
            console.log("Closing world index");
        }
    } else {
        navigatePage('adventure-select');
    }
}