import { getLocationList } from '../world-index-api.js';
import { openNewLocationPage } from './new-location-page.js';
import { insertFeatureSpan } from '../world-index-editing.js';
import { restoreFocus, trapFocus } from '../world-index-accessibility.js';

export async function openLocationSelectionOverlay(options = {}) {
    const featureSelectionOverlay = document.createElement('div');
    featureSelectionOverlay.className = 'feature-selection-overlay';
    
    featureSelectionOverlay.setAttribute('role', 'dialog');
    featureSelectionOverlay.setAttribute('aria-modal', 'true');
    featureSelectionOverlay.setAttribute('aria-labelledby', 'world-index-title-name');
    
    const title = document.createElement('h2');
    title.id = 'world-index-title-name';
    title.textContent = 'New or Existing Location';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);

    featureSelectionOverlay.setAttribute('aria-labelledby', title.id);
    
    const locationButtonsContainer = document.createElement('div');
    locationButtonsContainer.className = 'feature-selection-container';
    
    const newLocationButton = document.createElement('button');
    newLocationButton.className = 'feature-selection-button new-location-button';
    newLocationButton.textContent = 'New Location';
    newLocationButton.addEventListener('click', () => openNewLocationPage());
    locationButtonsContainer.appendChild(newLocationButton);
    
    const existingLocationButton = document.createElement('button');
    existingLocationButton.className = 'feature-selection-button existing-location-button';
    existingLocationButton.textContent = 'Existing Location';
    existingLocationButton.addEventListener('click', () => displayExistingLocations());
    locationButtonsContainer.appendChild(existingLocationButton);
    
    featureSelectionOverlay.appendChild(locationButtonsContainer);
    
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

    const startWithExisting = options.startWithExisting === true;

    if (startWithExisting) {
        // Skip the "New or Existing" choice and jump straight to existing locations
        await displayExistingLocations();
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

async function displayExistingLocations() {
    const allLocations = await getLocationList();
    
    const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
    if (!featureSelectionOverlay) return;
    
    featureSelectionOverlay.innerHTML = "";
    
    const title = document.createElement('h2');
    title.id = 'existing-locations-title';
    title.textContent = 'Select Existing Location';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'feature-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search locations...';
    searchInput.className = 'feature-search-input';
    searchInput.setAttribute('aria-label', 'Search locations');
    searchContainer.appendChild(searchInput);
    
    featureSelectionOverlay.appendChild(searchContainer);
    
    const locationListContainer = document.createElement('div');
    locationListContainer.className = 'location-list-container';
    locationListContainer.setAttribute('role', 'list');
    locationListContainer.setAttribute('aria-label', 'Locations');
    
    function renderLocations(locations) {
        locationListContainer.innerHTML = '';
        
        if (locations.length === 0) {
            const noResults = document.createElement('p');
            noResults.textContent = 'No locations found.';
            noResults.className = 'no-results';
            noResults.setAttribute('role', 'status');
            noResults.setAttribute('aria-live', 'polite');
            locationListContainer.appendChild(noResults);
            return;
        }
        
        locations.forEach(loc => {
            const featureButton = document.createElement('button');
            featureButton.className = 'feature-list-item';
            featureButton.textContent = loc.name;
            featureButton.dataset.locationTag = loc.tag;
            featureButton.setAttribute('role', 'listitem');
            featureButton.setAttribute('aria-label', `${loc.name}`);
            
            featureButton.addEventListener('click', () => {
                console.log('Selected location:', loc.tag, loc.name);
                insertFeatureSpan(loc.tag, loc.name);
            });
            
            locationListContainer.appendChild(featureButton);
        });
    }
    
    renderLocations(allLocations);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredLocations = allLocations.filter(location => 
            location.name.toLowerCase().includes(searchTerm)
        );
        renderLocations(filteredLocations);
    });
    
    featureSelectionOverlay.appendChild(locationListContainer);

    trapFocus(featureSelectionOverlay);
 
    // Change focus for accessibility and allowing escape key to bubble up to container event listener in some browsers
    searchInput.focus();
}