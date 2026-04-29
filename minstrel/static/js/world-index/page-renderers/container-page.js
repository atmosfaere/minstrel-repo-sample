import { getNewContainer, saveNewContainer } from '../world-index-api.js';
import { openLocationSelectionOverlay } from './location-overlay.js';
import { openCharacterSelectionOverlay } from './character-overlay.js';
import { openObjectSelectionOverlay } from './object-overlay.js';
import { attachFeatureSpanEventListeners, newFeatureCurrentlyEditingTextarea, newFeatureSavedSelection, insertFeatureSpan, setNewFeatureSavedSelection, setNewFeatureCurrentlyEditingTextarea } from '../world-index-editing.js';
import { addSelectionEventListeners, convertEditFieldHTMLToPlainText } from '../world-index-editing.js';
import { trapFocus, restoreFocus } from '../world-index-accessibility.js';
import { setCurrentPage } from '../../world-index.js';

export async function openNewContainerPage() {
    // Remove any existing new-feature-overlay
    const existingOverlay = document.querySelector('.new-feature-overlay');
    if (existingOverlay) existingOverlay.remove();

    const createPermission = true;

    // Return if user doesn't have permission to create containers
    if (!createPermission) {
        console.log('No permission to create containers');
        return;
    }

    // Get a new container id
    const data = await getNewContainer(); // Should return {id}
    const containerTag = data.tag;

    history.pushState({ worldIndex: true}, '', '');

    const newFeatureOverlay = document.createElement('div');
    newFeatureOverlay.className = 'new-feature-overlay';
    newFeatureOverlay.setAttribute('role', 'dialog');
    newFeatureOverlay.setAttribute('aria-modal', 'true');
    newFeatureOverlay.setAttribute('aria-labelledby', 'new-feature-title');

    const containerName = document.createElement('input');
    containerName.className = 'world-index-title-name';
    containerName.type = 'text';
    containerName.value = '';
    containerName.placeholder = 'Enter container name...';
    containerName.setAttribute('aria-label', 'Container Name');

    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Summary:';
    summaryHeading.className = 'index-heading';

    let summary = document.createElement('div');
    summary.className = 'world-info-field-index world-info-field-index-summary';
    summary.contentEditable = true;
    summary.setAttribute('role', 'textbox');
    summary.setAttribute('aria-multiline', 'true');
    summary.setAttribute('index-contenteditable-placeholder', 'Enter container summary...');
    summary.innerHTML = '';
    
    const summaryControls = document.createElement('div');
    summaryControls.className = 'index-entry-page-field-controls';
    
    const newSummaryLocationButton = document.createElement('button');
    newSummaryLocationButton.className = 'world-index-location-button';
    newSummaryLocationButton.textContent = '+ Location';

    newSummaryLocationButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(summary);
        summary.focus();
        openLocationSelectionOverlay();
    }); 

    const newSummaryCharacterButton = document.createElement('button');
    newSummaryCharacterButton.className = 'world-index-character-button';
    newSummaryCharacterButton.textContent = '+ Character';

    newSummaryCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(summary);
        summary.focus();
        openCharacterSelectionOverlay();
    });

    const newSummaryObjectButton = document.createElement('button');
    newSummaryObjectButton.className = 'world-index-object-button';
    newSummaryObjectButton.textContent = '+ Object';

    newSummaryObjectButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(summary);
        summary.focus();
        openObjectSelectionOverlay();
    });

    summaryControls.appendChild(newSummaryLocationButton);
    summaryControls.appendChild(newSummaryCharacterButton);
    summaryControls.appendChild(newSummaryObjectButton);

    const instructionHeading = document.createElement('h2');
    instructionHeading.textContent = 'Instruction:';
    instructionHeading.className = 'index-heading';

    let instruction = document.createElement('div');
    instruction.className = 'world-info-field-index world-info-field-index-instruction';
    instruction.contentEditable = true;
    instruction.setAttribute('role', 'textbox');
    instruction.setAttribute('aria-multiline', 'true');
    instruction.setAttribute('index-contenteditable-placeholder', 'Enter AI instruction...');
    instruction.innerHTML = '';

    const instructionControls = document.createElement('div');
    instructionControls.className = 'index-entry-page-field-controls';

    const newInstructionLocationButton = document.createElement('button');
    newInstructionLocationButton.className = 'world-index-location-button';
    newInstructionLocationButton.textContent = '+ Location';

    newInstructionLocationButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(instruction);
        instruction.focus();
        openLocationSelectionOverlay();
    });

    const newInstructionCharacterButton = document.createElement('button');
    newInstructionCharacterButton.className = 'world-index-character-button';
    newInstructionCharacterButton.textContent = '+ Character';

    newInstructionCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(instruction);
        instruction.focus();
        openCharacterSelectionOverlay();
    });

    const newInstructionObjectButton = document.createElement('button');
    newInstructionObjectButton.className = 'world-index-object-button';
    newInstructionObjectButton.textContent = '+ Object';

    newInstructionObjectButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(instruction);
        instruction.focus();
        openObjectSelectionOverlay();
    });
    
    instructionControls.appendChild(newInstructionLocationButton);
    instructionControls.appendChild(newInstructionCharacterButton);
    instructionControls.appendChild(newInstructionObjectButton);

    addSelectionEventListeners(summary);
    addSelectionEventListeners(instruction);

    const locationHeading = document.createElement('h2');
    locationHeading.textContent = 'Location:';
    locationHeading.className = 'index-heading';
    const location = document.createElement('div');
    location.className = 'world-info-field-index';
    location.setAttribute('data-field-type', 'location');
    location.setAttribute('index-contenteditable-placeholder', 'Add location...');
    location.innerHTML = '';
    const locationControls = document.createElement('div');
    locationControls.className = 'index-entry-page-field-controls';
    const addLocationButton = document.createElement('button');
    addLocationButton.className = 'world-index-location-button';
    addLocationButton.textContent = '+ Location';
    addLocationButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(location);
        setNewFeatureSavedSelection({});
        location.focus();
        openLocationSelectionOverlay();
    });
    locationControls.appendChild(addLocationButton);

    const saveButton = document.createElement('button');
    saveButton.className = 'world-index-save-button world-index-save-button-centered';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => {
        const name = containerName.value.trim();
        const summaryText = convertEditFieldHTMLToPlainText(summary);
        const instructionText = convertEditFieldHTMLToPlainText(instruction);
        const locationText = convertEditFieldHTMLToPlainText(location);
        saveNewContainer(containerTag, name, summaryText, instructionText, locationText);

        // Close the new feature overlay first
        newFeatureOverlay.remove();
        restoreFocus();
        
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
        
        // Add new container to the edit field of the open character, location, or world page
        if (name) {
            insertFeatureSpan(containerTag, name);
        }
    });

    newFeatureOverlay.appendChild(containerName);

    newFeatureOverlay.appendChild(summaryHeading);
    newFeatureOverlay.appendChild(summary);
    newFeatureOverlay.appendChild(summaryControls);

    newFeatureOverlay.appendChild(instructionHeading);
    newFeatureOverlay.appendChild(instruction);
    newFeatureOverlay.appendChild(instructionControls);

    newFeatureOverlay.appendChild(locationHeading);
    newFeatureOverlay.appendChild(location);
    newFeatureOverlay.appendChild(locationControls);

    newFeatureOverlay.appendChild(saveButton);

    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);

    document.body.appendChild(newFeatureOverlay);

    const handleClickOutside = (e) => {
        // Don't close if a feature selection overlay is open
        const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
        if (featureSelectionOverlay) {
            return;
        }
        
        if (!newFeatureOverlay.contains(e.target)) {
            newFeatureOverlay.remove();
            restoreFocus();
            document.removeEventListener('click', handleClickOutside, true);
        }
    };
    
    document.addEventListener('click', handleClickOutside, true);

    trapFocus(newFeatureOverlay);
    // Focus the first input for accessibility
    requestAnimationFrame(() => {
        const firstFocusable = newFeatureOverlay.querySelector('input, button, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
    });

    setCurrentPage(containerId);
}