import { getNewDocument, saveNewDocument, getDocumentPage, saveSummary, saveInstruction, saveObjectLocation, saveDocumentText, deleteFeature } from '../world-index-api.js';
import { navigateBackIndex, setCurrentPage } from '../../world-index.js';
import { openLocationSelectionOverlay } from './location-overlay.js';
import { openCharacterSelectionOverlay } from './character-overlay.js';
import { openObjectSelectionOverlay } from './object-overlay.js';
import { attachFeatureSpanEventListeners, newFeatureCurrentlyEditingTextarea, newFeatureSavedSelection, insertFeatureSpan, setNewFeatureSavedSelection, setNewFeatureCurrentlyEditingTextarea } from '../world-index-editing.js';
import { addSelectionEventListeners, convertEditFieldHTMLToPlainText, addEditFieldEventListeners, startEditingCharacterName, renderPlainTextWithFeatureSyntaxToEditFieldHTML, setCurrentlyEditingDiv, setSavedSelection } from '../world-index-editing.js';
import { trapFocus, restoreFocus } from '../world-index-accessibility.js';
import { openMainIndexPage } from './main-page.js';

export async function openNewDocumentPage() {
    // Remove any existing new-feature-overlay
    const existingOverlay = document.querySelector('.new-feature-overlay');
    if (existingOverlay) existingOverlay.remove();

    const createPermission = true;

    // Return if user doesn't have permission to create documents
    if (!createPermission) {
        console.log('No permission to create documents');
        return;
    }

    // Get a new document id
    const data = await getNewDocument(); // Should return {id}
    const documentTag = data.tag;

    history.pushState({ worldIndex: true}, '', '');

    const newFeatureOverlay = document.createElement('div');
    newFeatureOverlay.className = 'new-feature-overlay';
    newFeatureOverlay.setAttribute('role', 'dialog');
    newFeatureOverlay.setAttribute('aria-modal', 'true');
    newFeatureOverlay.setAttribute('aria-labelledby', 'new-feature-title');

    const documentName = document.createElement('input');
    documentName.className = 'world-index-title-name';
    documentName.type = 'text';
    documentName.value = '';
    documentName.placeholder = 'Enter document name...';
    documentName.setAttribute('aria-label', 'Document Name');

    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Summary:';
    summaryHeading.className = 'index-heading';

    let summary = document.createElement('div');
    summary.className = 'world-info-field-index world-info-field-index-summary';
    summary.contentEditable = true;
    summary.setAttribute('role', 'textbox');
    summary.setAttribute('aria-multiline', 'true');
    summary.setAttribute('index-contenteditable-placeholder', 'Enter document summary...');
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

    summaryControls.appendChild(newSummaryLocationButton);
    summaryControls.appendChild(newSummaryCharacterButton);

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

    const locationHeldHeading = document.createElement('h2');
    locationHeldHeading.textContent = 'Location / Held:';
    locationHeldHeading.className = 'index-heading';
    
    const locationHeld = document.createElement('div');
    locationHeld.className = 'world-info-field-index';
    locationHeld.setAttribute('data-field-type', 'location-held');
    locationHeld.setAttribute('index-contenteditable-placeholder', 'Add location or character...');
    locationHeld.innerHTML = '';
    
    const locationHeldControls = document.createElement('div');
    locationHeldControls.className = 'index-entry-page-field-controls';
    
    const addLocationHeldLocationButton = document.createElement('button');
    addLocationHeldLocationButton.className = 'world-index-location-button';
    addLocationHeldLocationButton.textContent = '+ Location';
    addLocationHeldLocationButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(locationHeld);
        setNewFeatureSavedSelection({});
        locationHeld.focus();
        openLocationSelectionOverlay();
    });
    
    const addLocationHeldCharacterButton = document.createElement('button');
    addLocationHeldCharacterButton.className = 'world-index-character-button';
    addLocationHeldCharacterButton.textContent = '+ Character';
    addLocationHeldCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(locationHeld);
        setNewFeatureSavedSelection({});
        locationHeld.focus();
        openCharacterSelectionOverlay();
    });
    
    locationHeldControls.appendChild(addLocationHeldLocationButton);
    locationHeldControls.appendChild(addLocationHeldCharacterButton);

    const documentTextHeading = document.createElement('h2');
    documentTextHeading.textContent = 'Document:';
    documentTextHeading.className = 'index-heading';
    
    let documentText = document.createElement('div');
    documentText.className = 'world-info-field-index world-info-field-index-document-text';
    documentText.contentEditable = true;
    documentText.setAttribute('role', 'textbox');
    documentText.setAttribute('aria-multiline', 'true');
    documentText.setAttribute('index-contenteditable-placeholder', 'Enter document text...');
    documentText.innerHTML = '';
    
    const documentTextControls = document.createElement('div');
    documentTextControls.className = 'index-entry-page-field-controls';
    
    const newDocumentTextLocationButton = document.createElement('button');
    newDocumentTextLocationButton.className = 'world-index-location-button';
    newDocumentTextLocationButton.textContent = '+ Location';
    newDocumentTextLocationButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(documentText);
        documentText.focus();
        openLocationSelectionOverlay();
    });
    
    const newDocumentTextCharacterButton = document.createElement('button');
    newDocumentTextCharacterButton.className = 'world-index-character-button';
    newDocumentTextCharacterButton.textContent = '+ Character';
    newDocumentTextCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(documentText);
        documentText.focus();
        openCharacterSelectionOverlay();
    });
    
    const newDocumentTextObjectButton = document.createElement('button');
    newDocumentTextObjectButton.className = 'world-index-object-button';
    newDocumentTextObjectButton.textContent = '+ Object';
    newDocumentTextObjectButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(documentText);
        documentText.focus();
        openObjectSelectionOverlay();
    });
    
    documentTextControls.appendChild(newDocumentTextLocationButton);
    documentTextControls.appendChild(newDocumentTextCharacterButton);
    documentTextControls.appendChild(newDocumentTextObjectButton);

    addSelectionEventListeners(documentText);

    const saveButton = document.createElement('button');
    saveButton.className = 'world-index-save-button world-index-save-button-centered';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => {
        const name = documentName.value.trim();
        const summaryText = convertEditFieldHTMLToPlainText(summary);
        const instructionText = convertEditFieldHTMLToPlainText(instruction);
        const locationHeldText = convertEditFieldHTMLToPlainText(locationHeld);
        const documentTextContent = convertEditFieldHTMLToPlainText(documentText);
        saveNewDocument(documentTag, name, summaryText, instructionText, locationHeldText, documentTextContent);

        // Close the new feature overlay first
        newFeatureOverlay.remove();
        restoreFocus();
        
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
        
        // Add new document to the edit field of the open character, location, or world page
        if (name) {
            insertFeatureSpan(documentTag, name);
        }
    });

    newFeatureOverlay.appendChild(documentName);

    newFeatureOverlay.appendChild(summaryHeading);
    newFeatureOverlay.appendChild(summary);
    newFeatureOverlay.appendChild(summaryControls);

    newFeatureOverlay.appendChild(instructionHeading);
    newFeatureOverlay.appendChild(instruction);
    newFeatureOverlay.appendChild(instructionControls);

    newFeatureOverlay.appendChild(locationHeldHeading);
    newFeatureOverlay.appendChild(locationHeld);
    newFeatureOverlay.appendChild(locationHeldControls);

    newFeatureOverlay.appendChild(documentTextHeading);
    newFeatureOverlay.appendChild(documentText);
    newFeatureOverlay.appendChild(documentTextControls);

    newFeatureOverlay.appendChild(saveButton);

    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);
    attachFeatureSpanEventListeners(documentText);

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

    setCurrentPage(documentTag);
}

export async function openDocumentPage(documentTag) {
    const worldIndex = document.querySelector('.world-index');
    const pageData = await getDocumentPage(documentTag);

    const viewPermission = pageData.view_permission;
    const editpermission = pageData.edit_permission;

    if (!viewPermission) {
        console.log('No view permission for document, ', documentTag);
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

    // Create flex container for document name and edit icon
    const documentNameContainer = document.createElement('div');
    documentNameContainer.className = 'character-name-container';
    documentNameContainer.id = 'document-page-title';

    const documentName = document.createElement('h1');
    documentName.className = 'world-index-title-name';
    documentName.id = 'document-page-title';
    documentName.textContent = pageData.name;

    const editButton = document.createElement('button');
    editButton.innerHTML = '✎';
    editButton.className = 'character-edit-button';
    editButton.setAttribute('aria-label', 'Edit document name');
    editButton.addEventListener('click', () => {
        startEditingCharacterName(documentName, editButton, documentTag, pageData.name);
    });

    documentNameContainer.appendChild(documentName);
    documentNameContainer.appendChild(editButton);

    // Create delete button (positioned absolutely like back arrow)
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '🗑';
    deleteButton.className = 'feature-delete-button';
    deleteButton.setAttribute('aria-label', 'Delete document');
    deleteButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this document?')) {
            try {
                await deleteFeature(documentTag);
                setCurrentPage("main");
                await openMainIndexPage();
            } catch (error) {
                console.error("Failed to delete document.", error);
            }
        }
    });

    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Summary:';
    summaryHeading.className = 'index-heading';

    let summary = document.createElement('div');
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

        addEditFieldEventListeners(summary, summaryControls, documentTag, saveSummary);

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

        addEditFieldEventListeners(instruction, instructionControls, documentTag, saveInstruction);

    } else {
        // Convert plain text with bracket syntax to HTML with clickable spans
        const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
        instruction.innerHTML = instructionHtmlContent;
    }

    const locationHeldHeading = document.createElement('h2');
    locationHeldHeading.textContent = 'Location / Held:';
    locationHeldHeading.className = 'index-heading';

    const locationHeld = document.createElement('div');
    locationHeld.className = 'world-info-field-index';
    locationHeld.setAttribute('data-field-type', 'location-held');
    
    if (!pageData.location_held || pageData.location_held.trim() === "") {
        if (editpermission) {
            locationHeld.setAttribute('index-contenteditable-placeholder', 'Add location or character...');
        }
        locationHeld.innerHTML = '';
    } else {
        locationHeld.innerHTML = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.location_held);
    }

    const locationHeldControls = document.createElement('div');
    locationHeldControls.className = 'index-entry-page-field-controls';

    if (editpermission) {
        const addLocationHeldLocationButton = document.createElement('button');
        addLocationHeldLocationButton.className = 'world-index-location-button';
        addLocationHeldLocationButton.textContent = '+ Location';

        addLocationHeldLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(locationHeld);
            setSavedSelection({});
            locationHeld.focus();
            openLocationSelectionOverlay();
        });

        const addLocationHeldCharacterButton = document.createElement('button');
        addLocationHeldCharacterButton.className = 'world-index-character-button';
        addLocationHeldCharacterButton.textContent = '+ Character';

        addLocationHeldCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(locationHeld);
            setSavedSelection({});
            locationHeld.focus();
            openCharacterSelectionOverlay();
        });

        locationHeldControls.appendChild(addLocationHeldLocationButton);
        locationHeldControls.appendChild(addLocationHeldCharacterButton);
    }

    const documentTextHeading = document.createElement('h2');
    documentTextHeading.textContent = 'Document:';
    documentTextHeading.className = 'index-heading';

    let documentText = document.createElement('div');
    documentText.className = 'world-info-field-index world-info-field-index-document-text';

    const documentTextControls = document.createElement('div');
    documentTextControls.className = 'index-entry-page-field-controls';

    if (editpermission) {
        documentText.contentEditable = true;
        documentText.setAttribute('role', 'textbox');
        documentText.setAttribute('aria-multiline', 'true');
        // Set placeholder text if document text is empty
        if (!pageData.document_text || pageData.document_text.trim() === "") {
            documentText.setAttribute('index-contenteditable-placeholder', 'Enter document text...');
            documentText.innerHTML = "";
        } else {
            // Convert plain text with bracket syntax to HTML with clickable spans
            const documentTextHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.document_text);
            documentText.innerHTML = documentTextHtmlContent;
        }
        
        const newDocumentTextLocationButton = document.createElement('button');
        newDocumentTextLocationButton.className = 'world-index-location-button';
        newDocumentTextLocationButton.textContent = '+ Location';

        newDocumentTextLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(documentText);
            documentText.focus();
            openLocationSelectionOverlay();
        });

        const newDocumentTextCharacterButton = document.createElement('button');
        newDocumentTextCharacterButton.className = 'world-index-character-button';
        newDocumentTextCharacterButton.textContent = '+ Character';

        newDocumentTextCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(documentText);
            documentText.focus();
            openCharacterSelectionOverlay();
        });

        const newDocumentTextObjectButton = document.createElement('button');
        newDocumentTextObjectButton.className = 'world-index-object-button';
        newDocumentTextObjectButton.textContent = '+ Object';

        newDocumentTextObjectButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(documentText);
            documentText.focus();
            openObjectSelectionOverlay();
        });

        documentTextControls.appendChild(newDocumentTextLocationButton);
        documentTextControls.appendChild(newDocumentTextCharacterButton);
        documentTextControls.appendChild(newDocumentTextObjectButton);

        addEditFieldEventListeners(documentText, documentTextControls, documentTag, saveDocumentText);

    } else {
        // Convert plain text with bracket syntax to HTML with clickable spans
        const documentTextHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.document_text);
        documentText.innerHTML = documentTextHtmlContent;
    }

    worldIndex.appendChild(documentNameContainer);
    worldIndex.appendChild(deleteButton);

    worldIndex.appendChild(summaryHeading);
    worldIndex.appendChild(summary);
    worldIndex.appendChild(summaryControls);

    worldIndex.appendChild(instructionHeading);
    worldIndex.appendChild(instruction);
    worldIndex.appendChild(instructionControls);

    worldIndex.appendChild(locationHeldHeading);
    worldIndex.appendChild(locationHeld);
    worldIndex.appendChild(locationHeldControls);

    worldIndex.appendChild(documentTextHeading);
    worldIndex.appendChild(documentText);
    worldIndex.appendChild(documentTextControls);

    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);
    attachFeatureSpanEventListeners(documentText);

    // Update ARIA labeling for document page
    worldIndex.setAttribute('aria-labelledby', 'document-page-title');
    
    // Set focus to the document name for screen readers
    setTimeout(() => {
        documentName.setAttribute('tabindex', '-1');
        documentName.focus();
        // Announce the page change to screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `Document page for ${pageData.name} loaded`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
    }, 100);

    setCurrentPage(documentTag);
}
