import { openNewCharacterPage } from './new-character-page.js';
import { getCharacterList } from '../world-index-api.js';
import { insertFeatureSpan } from '../world-index-editing.js';
import { restoreFocus, trapFocus } from '../world-index-accessibility.js';

export async function openCharacterSelectionOverlay() {
    const featureSelectionOverlay = document.createElement('div');
    featureSelectionOverlay.className = 'feature-selection-overlay';
    
    featureSelectionOverlay.setAttribute('role', 'dialog');
    featureSelectionOverlay.setAttribute('aria-modal', 'true');
    featureSelectionOverlay.setAttribute('aria-labelledby', 'world-index-title-name');
    
    const title = document.createElement('h2');
    title.id = 'world-index-title-name';
    title.textContent = 'New or Existing Character';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const characterButtonsContainer = document.createElement('div');
    characterButtonsContainer.className = 'feature-selection-container';
    
    const newCharacterButton = document.createElement('button');
    newCharacterButton.className = 'feature-selection-button new-feature-button';
    newCharacterButton.textContent = 'New Character';
    newCharacterButton.addEventListener('click', () => openNewCharacterPage());
    characterButtonsContainer.appendChild(newCharacterButton);
    
    const existingCharacterButton = document.createElement('button');
    existingCharacterButton.className = 'feature-selection-button existing-feature-button';
    existingCharacterButton.textContent = 'Existing Character';
    existingCharacterButton.addEventListener('click', () => displayExistingCharacters());
    characterButtonsContainer.appendChild(existingCharacterButton);
    
    featureSelectionOverlay.appendChild(characterButtonsContainer);
    
    document.body.appendChild(featureSelectionOverlay);

    const handleClickOutside = (e) => {
        if (!featureSelectionOverlay.contains(e.target)) {
            featureSelectionOverlay.remove();
            restoreFocus();
            document.removeEventListener('click', handleClickOutside, true);
            delete featureSelectionOverlay._outsideClickHandler;
        }
    };
    
    featureSelectionOverlay._outsideClickHandler = handleClickOutside;
    document.addEventListener('click', handleClickOutside, true);

    restoreFocus();

    const startWithExisting = options.startWithExisting === true;

    if (startWithExisting) {
        // Skip the "New or Existing" choice and jump straight to existing characters
        await displayExistingCharacters();
    } else {
        trapFocus(featureSelectionOverlay);

        // Focus the first element after trapping focus, after DOM updates
        requestAnimationFrame(() => {
            const firstFocusable = featureSelectionOverlay.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
            if (firstFocusable) {
                firstFocusable.focus();
            }
        });
    }
}

async function displayExistingCharacters() {
    const allCharacters = await getCharacterList();
    
    const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
    if (!featureSelectionOverlay) return;
    
    featureSelectionOverlay.innerHTML = "";
    
    const title = document.createElement('h2');
    title.id = 'existing-characters-title';
    title.textContent = 'Select Existing Character';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'feature-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search characters...';
    searchInput.className = 'feature-search-input';
    searchInput.setAttribute('aria-label', 'Search characters');
    searchContainer.appendChild(searchInput);
    
    featureSelectionOverlay.appendChild(searchContainer);
    
    const characterListContainer = document.createElement('div');
    characterListContainer.className = 'character-list-container';
    characterListContainer.setAttribute('role', 'list');
    characterListContainer.setAttribute('aria-label', 'Characters');
    
    function renderCharacters(characters) {
        characterListContainer.innerHTML = '';
        
        if (characters.length === 0) {
            const noResults = document.createElement('p');
            noResults.textContent = 'No characters found.';
            noResults.className = 'no-results';
            noResults.setAttribute('role', 'status');
            noResults.setAttribute('aria-live', 'polite');
            characterListContainer.appendChild(noResults);
            return;
        }
        
        characters.forEach(character => {
            const featureButton = document.createElement('button');
            featureButton.className = 'feature-list-item';
            featureButton.textContent = character.name;
            featureButton.dataset.characterTag = character.tag;
            featureButton.setAttribute('role', 'listitem');
            featureButton.setAttribute('aria-label', `${character.name}`);
            
            featureButton.addEventListener('click', () => {
                console.log('Selected character:', character.tag, character.name);
                insertFeatureSpan(character.tag, character.name);
            });
            
            characterListContainer.appendChild(featureButton);
        });
    }
    
    renderCharacters(allCharacters);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredCharacters = allCharacters.filter(character => 
            character.name.toLowerCase().includes(searchTerm)
        );
        renderCharacters(filteredCharacters);
    });
    
    featureSelectionOverlay.appendChild(characterListContainer);

    trapFocus(featureSelectionOverlay);
 
    // Change focus for accessibility and allowing escape key to bubble up to container event listener in some browsers
    searchInput.focus();
}