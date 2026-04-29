import { getCharacterPage, saveSummary, saveInstruction, deleteFeature } from '../world-index-api.js';
import { navigateBackIndex, currentPage, setCurrentPage } from '../../world-index.js';
import { openLocationSelectionOverlay } from './location-overlay.js';
import { openCharacterSelectionOverlay } from './character-overlay.js';
import { openObjectSelectionOverlay } from './object-overlay.js';
import { addEditFieldEventListeners, startEditingCharacterName, renderPlainTextWithFeatureSyntaxToEditFieldHTML, attachFeatureSpanEventListeners, setCurrentlyEditingDiv, setSavedSelection } from '../world-index-editing.js';
import { currentlyEditingDiv, savedSelection } from '../world-index-editing.js';
import { baseUrl } from '../../app.js';
import { openMainIndexPage } from './main-page.js';

export async function openCharacterPage(characterTag) {
    const worldIndex = document.querySelector('.world-index');
    const pageData = await getCharacterPage(characterTag);

    const viewPermission = pageData.view_permission;
    const editpermission = pageData.edit_permission;

    if (!viewPermission) {
        console.log('No view permission for character, ', characterTag);
        return;
    }

    history.pushState({ worldIndex: true}, '', '');

    // Clear the world index
    worldIndex.innerHTML = "";

    const backArrow = document.createElement('button');
    backArrow.innerHTML = '←';
    backArrow.className = 'back-arrow world-index-back-arrow';
    backArrow.setAttribute('aria-label', 'Back to main index page');
    backArrow.addEventListener('click', () => navigateBackIndex());
    worldIndex.appendChild(backArrow);

    const characterImage = document.createElement('img');
    characterImage.style.display = 'none'; // Hide initially
    characterImage.className = 'index-character-image';
    
    const imageUrl = `${baseUrl}/static/images/${characterTag}.png`;
    characterImage.src = imageUrl;
    
    // Show character image only if loaded successfully
    characterImage.onload = () => {
        characterImage.style.display = 'block';
    };
    
    characterImage.onerror = () => {
        characterImage.style.display = 'none';
        console.log(`Character image not found for ${characterTag}`);
    };

    // Create flex container for character name and edit icon
    const characterNameContainer = document.createElement('div');
    characterNameContainer.className = 'character-name-container';
    characterNameContainer.id = 'character-page-title'; // Add ID for aria-labelledby

    const characterName = document.createElement('h1');
    characterName.className = 'world-index-title-name';
    characterName.id = 'character-page-title'; // Add ID for aria-labelledby
    characterName.textContent = pageData.name;

    const editButton = document.createElement('button');
    editButton.innerHTML = '✎';
    editButton.className = 'character-edit-button';
    editButton.setAttribute('aria-label', 'Edit character name');
    editButton.addEventListener('click', () => {
        startEditingCharacterName(characterName, editButton, characterTag, pageData.name);
    });

    characterNameContainer.appendChild(characterName);
    characterNameContainer.appendChild(editButton);

    // Create delete button (positioned absolutely like back arrow)
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '🗑'; // This forces text style
    deleteButton.className = 'feature-delete-button';
    deleteButton.setAttribute('aria-label', 'Delete character');
    deleteButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this character?')) {
            try {
                await deleteFeature(characterTag);
                setCurrentPage("main");
                await openMainIndexPage();
            } catch (error) {
                console.error("Failed to delete character.", error);
            }
        }
    });

    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Summary:';
    summaryHeading.className = 'index-heading';

    let summary = document.createElement('div');;
    summary.className = 'world-info-field-index world-info-field-index-summary';

    const summaryControls = document.createElement('div');
    summaryControls.className = 'index-entry-page-field-controls';

    if (editpermission) {
        summary.contentEditable = true;
        summary.setAttribute('role', 'textbox');
        summary.setAttribute('aria-multiline', 'true');
        // Set placeholder text if summary is empty or "No Summary Yet"
        if (!pageData.summary || pageData.summary === "No Summary Yet" || pageData.summary.trim() === "") {
            summary.setAttribute('index-contenteditable-placeholder', 'Create summary...');
            summary.innerHTML = "";
        } else {
            // Create html with featureSpans for all delimited ids
            const htmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.summary);
            summary.innerHTML = htmlContent;
        }

        const newSummaryLocationButton = document.createElement('button');
        newSummaryLocationButton.className = 'world-index-location-button';
        newSummaryLocationButton.textContent = '+ Location';

        newSummaryLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(summary);
            summary.focus();
            openLocationSelectionOverlay();
        });

        const newSummaryCharacterButton = document.createElement('button');
        newSummaryCharacterButton.className = 'world-index-character-button';
        newSummaryCharacterButton.textContent = '+ Character';

        newSummaryCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(summary);
            summary.focus();
            openCharacterSelectionOverlay();
        });

        const newSummaryObjectButton = document.createElement('button');
        newSummaryObjectButton.className = 'world-index-object-button';
        newSummaryObjectButton.textContent = '+ Object';

        newSummaryObjectButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(summary);
            summary.focus();
            openObjectSelectionOverlay();
        });

        summaryControls.appendChild(newSummaryLocationButton);
        summaryControls.appendChild(newSummaryCharacterButton);
        summaryControls.appendChild(newSummaryObjectButton);

        addEditFieldEventListeners(summary, summaryControls, characterTag, saveSummary);

    } else {
        // Convert plain text with bracket syntax to HTML with clickable spans
        const htmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.summary);
        summary.innerHTML = htmlContent;
    }

    const instructionHeading = document.createElement('h2');
    instructionHeading.textContent = 'Instruction:';
    instructionHeading.className = 'index-heading';

    let instruction = document.createElement('div');
    instruction.className = 'world-info-field-index world-info-field-index-instruction';

    const instructionControls = document.createElement('div');
    instructionControls.className = 'index-entry-page-field-controls';

    if (editpermission) {
        instruction.contentEditable = true;
        instruction.setAttribute('role', 'textbox');
        instruction.setAttribute('aria-multiline', 'true');
        // Set placeholder text if instruction is empty or "No Instruction Yet"
        if (!pageData.instruction || pageData.instruction === "No Instruction Yet" || pageData.instruction.trim() === "") {
            instruction.setAttribute('index-contenteditable-placeholder', 'Enter AI instruction...');
            instruction.innerHTML = "";
        } else {
            // Convert plain text with bracket syntax to HTML with clickable spans
            const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
            instruction.innerHTML = instructionHtmlContent;
        }
        
        const newInstructionLocationButton = document.createElement('button');
        newInstructionLocationButton.className = 'world-index-location-button';
        newInstructionLocationButton.textContent = '+ Location';

        newInstructionLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(instruction);
            // Focus the instruction field to establish cursor position
            instruction.focus();
            openLocationSelectionOverlay();
        });

        const newInstructionCharacterButton = document.createElement('button');
        newInstructionCharacterButton.className = 'world-index-character-button';
        newInstructionCharacterButton.textContent = '+ Character';

        newInstructionCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(instruction);
            instruction.focus();
            openCharacterSelectionOverlay();
        });

        const newInstructionObjectButton = document.createElement('button');
        newInstructionObjectButton.className = 'world-index-object-button';
        newInstructionObjectButton.textContent = '+ Object';

        newInstructionObjectButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(instruction);
            instruction.focus();
            openObjectSelectionOverlay();
        });

        instructionControls.appendChild(newInstructionLocationButton);
        instructionControls.appendChild(newInstructionCharacterButton);
        instructionControls.appendChild(newInstructionObjectButton);

        addEditFieldEventListeners(instruction, instructionControls, characterTag, saveInstruction);

    }  else {
        // Convert plain text with bracket syntax to HTML with clickable spans
        const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
        instruction.innerHTML = instructionHtmlContent;
    }

    const locationHeading = document.createElement('h2');
    locationHeading.textContent = 'Location:';
    locationHeading.className = 'index-heading';

    const location = document.createElement('div');
    location.className = 'world-info-field-index';
    location.setAttribute('data-field-type', 'location'); // Add this line
    
    if (!pageData.location || pageData.location.trim() === "") {
        if (editpermission) {
            location.setAttribute('index-contenteditable-placeholder', 'Add location...');
        }
        location.innerHTML = '';
    } else {
        location.innerHTML = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.location);
    }

    const locationControls = document.createElement('div');
    locationControls.className = 'index-entry-page-field-controls';

    const addLocationButton = document.createElement('button');
    addLocationButton.className = 'world-index-location-button';
    addLocationButton.textContent = '+ Location';

    addLocationButton.addEventListener('click', () => {
        setCurrentlyEditingDiv(location);
        setSavedSelection({});
        location.focus();
        openLocationSelectionOverlay();
    });

    locationControls.appendChild(addLocationButton);

    worldIndex.appendChild(characterImage);
    worldIndex.appendChild(characterNameContainer);
    worldIndex.appendChild(deleteButton);

    worldIndex.appendChild(summaryHeading);
    worldIndex.appendChild(summary);
    worldIndex.appendChild(summaryControls);

    worldIndex.appendChild(instructionHeading);
    worldIndex.appendChild(instruction);
    worldIndex.appendChild(instructionControls);

    worldIndex.appendChild(locationHeading);
    worldIndex.appendChild(location);
    worldIndex.appendChild(locationControls);
    
    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);
    attachFeatureSpanEventListeners(location);

    // Update ARIA labeling for character page
    worldIndex.setAttribute('aria-labelledby', 'character-page-title');
    
    // Set focus to the character name for screen readers
    setTimeout(() => {
        characterName.setAttribute('tabindex', '-1');
        characterName.focus();
        // Announce the page change to screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `Character page for ${pageData.name} loaded`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
    }, 100);

    setCurrentPage(characterTag);
}