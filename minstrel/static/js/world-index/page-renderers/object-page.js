import { getNewObject, saveNewObject, getObjectPage, saveSummary, saveInstruction, saveObjectLocation, deleteFeature } from '../world-index-api.js';
import { navigateBackIndex, setCurrentPage } from '../../world-index.js';
import { openLocationSelectionOverlay } from './location-overlay.js';
import { openCharacterSelectionOverlay } from './character-overlay.js';
import { openObjectSelectionOverlay } from './object-overlay.js';
import { attachFeatureSpanEventListeners, newFeatureCurrentlyEditingTextarea, newFeatureSavedSelection, insertFeatureSpan, setNewFeatureSavedSelection, setNewFeatureCurrentlyEditingTextarea, addSelectionEventListeners, convertEditFieldHTMLToPlainText, addEditFieldEventListeners, startEditingCharacterName, renderPlainTextWithFeatureSyntaxToEditFieldHTML, setCurrentlyEditingDiv, setSavedSelection } from '../world-index-editing.js';
import { trapFocus, restoreFocus } from '../world-index-accessibility.js';
import { addPortalEntry } from '../portal-management.js';
import { openMainIndexPage } from './main-page.js';

export async function openNewObjectPage() {
    // Remove any existing new-feature-overlay
    const existingOverlay = document.querySelector('.new-feature-overlay');
    if (existingOverlay) existingOverlay.remove();

    const createPermission = true;

    // Return if user doesn't have permission to create objects
    if (!createPermission) {
        console.log('No permission to create objects');
        return;
    }

    // Get a new object id
    const data = await getNewObject(); // Should return {id}
    const objectTag = data.tag;

    history.pushState({ worldIndex: true}, '', '');

    const newFeatureOverlay = document.createElement('div');
    newFeatureOverlay.className = 'new-feature-overlay';
    newFeatureOverlay.setAttribute('role', 'dialog');
    newFeatureOverlay.setAttribute('aria-modal', 'true');
    newFeatureOverlay.setAttribute('aria-labelledby', 'new-feature-title');

    const objectName = document.createElement('input');
    objectName.className = 'world-index-title-name';
    objectName.type = 'text';
    objectName.value = '';
    objectName.placeholder = 'Enter object name...';
    objectName.setAttribute('aria-label', 'Object Name');

    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Summary:';
    summaryHeading.className = 'index-heading';

    let summary = document.createElement('div');
    summary.className = 'world-info-field-index world-info-field-index-summary';
    summary.contentEditable = true;
    summary.setAttribute('role', 'textbox');
    summary.setAttribute('aria-multiline', 'true');
    summary.setAttribute('index-contenteditable-placeholder', 'Enter object summary...');
    summary.innerHTML = '';
    
    const summaryControls = document.createElement('div');
    summaryControls.className = 'index-entry-page-field-controls';
    
    const newSummaryLocationButton = document.createElement('button');
    newSummaryLocationButton.className = 'world-index-location-button';
    newSummaryLocationButton.textContent = '+ Location';

    newSummaryLocationButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(summary);
        summary.focus();
        openLocationSelectionOverlay({ startWithExisting: true });
    }); 

    const newSummaryCharacterButton = document.createElement('button');
    newSummaryCharacterButton.className = 'world-index-character-button';
    newSummaryCharacterButton.textContent = '+ Character';

    newSummaryCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(summary);
        summary.focus();
        openCharacterSelectionOverlay({ startWithExisting: true });
    });

    const newSummaryObjectButton = document.createElement('button');
    newSummaryObjectButton.className = 'world-index-object-button';
    newSummaryObjectButton.textContent = '+ Object';

    newSummaryObjectButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(summary);
        summary.focus();
        openObjectSelectionOverlay({ startWithExisting: 'object' });
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
        openLocationSelectionOverlay({ startWithExisting: true });
    });

    const newInstructionCharacterButton = document.createElement('button');
    newInstructionCharacterButton.className = 'world-index-character-button';
    newInstructionCharacterButton.textContent = '+ Character';

    newInstructionCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(instruction);
        instruction.focus();
        openCharacterSelectionOverlay({ startWithExisting: true });
    });

    const newInstructionObjectButton = document.createElement('button');
    newInstructionObjectButton.className = 'world-index-object-button';
    newInstructionObjectButton.textContent = '+ Object';

    newInstructionObjectButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(instruction);
        instruction.focus();
        openObjectSelectionOverlay({ startWithExisting: 'object' });
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
    locationHeld.setAttribute('data-field-type', 'held');
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
        openLocationSelectionOverlay({ startWithExisting: true });
    });
    
    const addLocationHeldCharacterButton = document.createElement('button');
    addLocationHeldCharacterButton.className = 'world-index-character-button';
    addLocationHeldCharacterButton.textContent = '+ Character';
    addLocationHeldCharacterButton.addEventListener('click', () => {
        setNewFeatureCurrentlyEditingTextarea(locationHeld);
        setNewFeatureSavedSelection({});
        locationHeld.focus();
        openCharacterSelectionOverlay({ startWithExisting: true });
    });
    
    locationHeldControls.appendChild(addLocationHeldLocationButton);
    locationHeldControls.appendChild(addLocationHeldCharacterButton);

    const saveButton = document.createElement('button');
    saveButton.className = 'world-index-save-button world-index-save-button-centered';
    saveButton.textContent = 'Save';
    saveButton.addEventListener('click', () => {
        const name = objectName.value.trim();
        const summaryText = convertEditFieldHTMLToPlainText(summary);
        const instructionText = convertEditFieldHTMLToPlainText(instruction);
        const locationHeldText = convertEditFieldHTMLToPlainText(locationHeld);
        saveNewObject(objectTag, name, summaryText, instructionText, locationHeldText);

        // Close the new feature overlay first
        newFeatureOverlay.remove();
        restoreFocus();
        
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
        
        // Add new object to the edit field of the open character, location, or world page
        if (name) {
            insertFeatureSpan(objectTag, name);
        }
    });

    newFeatureOverlay.appendChild(objectName);

    newFeatureOverlay.appendChild(summaryHeading);
    newFeatureOverlay.appendChild(summary);
    newFeatureOverlay.appendChild(summaryControls);

    newFeatureOverlay.appendChild(instructionHeading);
    newFeatureOverlay.appendChild(instruction);
    newFeatureOverlay.appendChild(instructionControls);

    newFeatureOverlay.appendChild(locationHeldHeading);
    newFeatureOverlay.appendChild(locationHeld);
    newFeatureOverlay.appendChild(locationHeldControls);

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
            delete newFeatureOverlay._outsideClickHandler;
        }
    };
    
    newFeatureOverlay._outsideClickHandler = handleClickOutside;
    document.addEventListener('click', handleClickOutside, true);

    trapFocus(newFeatureOverlay);
    // Focus the first input for accessibility
    requestAnimationFrame(() => {
        const firstFocusable = newFeatureOverlay.querySelector('input, button, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
    });

    setCurrentPage(objectTag);
}

export async function openObjectPage(objectTag) {
    const worldIndex = document.querySelector('.world-index');
    const pageData = await getObjectPage(objectTag);

    const viewPermission = pageData.view_permission;
    const editpermission = pageData.edit_permission;

    if (!viewPermission) {
        console.log('No view permission for object, ', objectTag);
        return;
    }

    // Extract holding feature tag from location_held field (format: "[Name] @@tag@@")
    let holdingFeatureTag = null;
    if (pageData.location_held) {
        // Use the same regex pattern as in world-index-editing.js
        const match = pageData.location_held.match(/\[([^\]]+)\]\s*@@([^@]+)@@/);
        if (match) {
            holdingFeatureTag = match[2]; // match[1] is name, match[2] is tag
        }
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

    // Create flex container for object name and edit icon
    const objectNameContainer = document.createElement('div');
    objectNameContainer.className = 'character-name-container';
    objectNameContainer.id = 'object-page-title';

    const objectName = document.createElement('h1');
    objectName.className = 'world-index-title-name';
    objectName.id = 'object-page-title';
    objectName.textContent = pageData.name;

    const editButton = document.createElement('button');
    editButton.innerHTML = '✎';
    editButton.className = 'character-edit-button';
    editButton.setAttribute('aria-label', 'Edit object name');
    editButton.addEventListener('click', () => {
        startEditingCharacterName(objectName, editButton, objectTag, pageData.name);
    });

    objectNameContainer.appendChild(objectName);
    objectNameContainer.appendChild(editButton);

    // Create delete button (positioned absolutely like back arrow)
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '🗑';
    deleteButton.className = 'feature-delete-button';
    deleteButton.setAttribute('aria-label', 'Delete object');
    deleteButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this object?')) {
            try {
                await deleteFeature(objectTag);
                setCurrentPage("main");
                await openMainIndexPage();
            } catch (error) {
                console.error("Failed to delete object.", error);
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

        addEditFieldEventListeners(summary, summaryControls, objectTag, saveSummary);

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

        addEditFieldEventListeners(instruction, instructionControls, objectTag, saveInstruction);

    } else {
        // Convert plain text with bracket syntax to HTML with clickable spans
        const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
        instruction.innerHTML = instructionHtmlContent;
    }

    const holdingFeatureHeading = document.createElement('h2');
    holdingFeatureHeading.textContent = 'Held:';
    holdingFeatureHeading.className = 'index-heading';

    const holdingFeature = document.createElement('div');
    holdingFeature.className = 'world-info-field-index';
    holdingFeature.setAttribute('data-field-type', 'held');
    
    if (!pageData.location_held || pageData.location_held.trim() === "") {
        if (editpermission) {
            holdingFeature.setAttribute('index-contenteditable-placeholder', 'Add location or character...');
        }
        holdingFeature.innerHTML = '';
    } else {
        holdingFeature.innerHTML = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.location_held);
    }

    const locationHeldControls = document.createElement('div');
    locationHeldControls.className = 'index-entry-page-field-controls';

    if (editpermission) {
        const addLocationHeldLocationButton = document.createElement('button');
        addLocationHeldLocationButton.className = 'world-index-location-button';
        addLocationHeldLocationButton.textContent = '+ Location';

        addLocationHeldLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(holdingFeature);
            setSavedSelection({});
            holdingFeature.focus();
            openLocationSelectionOverlay();
        });

        const addLocationHeldCharacterButton = document.createElement('button');
        addLocationHeldCharacterButton.className = 'world-index-character-button';
        addLocationHeldCharacterButton.textContent = '+ Character';

        addLocationHeldCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(holdingFeature);
            setSavedSelection({});
            holdingFeature.focus();
            openCharacterSelectionOverlay();
        });

        locationHeldControls.appendChild(addLocationHeldLocationButton);
        locationHeldControls.appendChild(addLocationHeldCharacterButton);
    }

    worldIndex.appendChild(objectNameContainer);
    worldIndex.appendChild(deleteButton);

    worldIndex.appendChild(summaryHeading);
    worldIndex.appendChild(summary);
    worldIndex.appendChild(summaryControls);

    worldIndex.appendChild(instructionHeading);
    worldIndex.appendChild(instruction);
    worldIndex.appendChild(instructionControls);

    worldIndex.appendChild(holdingFeatureHeading);
    worldIndex.appendChild(holdingFeature);
    worldIndex.appendChild(locationHeldControls);

    // Add Advanced section
    const advancedButton = document.createElement('button');
    advancedButton.className = 'world-page-advanced-title advanced-header';
    advancedButton.innerHTML = 'Advanced <span class="dropdown-arrow rotated">▼</span>';
    worldIndex.appendChild(advancedButton);

    const advancedSection = document.createElement('div');
    advancedSection.className = 'advanced-content';
    advancedSection.hidden = true; // Initially hidden
    worldIndex.appendChild(advancedSection);

    advancedButton.addEventListener('click', () => {
        advancedSection.hidden = !advancedSection.hidden;
        const arrow = advancedButton.querySelector('.dropdown-arrow');
        arrow.classList.toggle('rotated', advancedSection.hidden);
    });

    // Portals section inside Advanced section
    const portalsHeading = document.createElement('h2');
    portalsHeading.textContent = 'Portals:';
    portalsHeading.className = 'index-heading';
    advancedSection.appendChild(portalsHeading);

    // Parse existing portals data
    let portalsData = { incoming: [], outgoing: [] };
    
    // Log what we received from backend
    console.log('Object page - received pageData.outgoing_portals:', pageData.outgoing_portals);
    console.log('Object page - received pageData.incoming_portals:', pageData.incoming_portals);
    
    // Convert outgoing portals from dict to array format
    if (pageData.outgoing_portals) {
        for (const [portalId, portalData] of Object.entries(pageData.outgoing_portals)) {
            const portal = {
                portalId: portalId,
                description: portalData.description || '',
                destinations: []
            };
            
            // Convert destinations dict to array with connection status
            if (portalData.destinations) {
                for (const [destId, destData] of Object.entries(portalData.destinations)) {
                    portal.destinations.push({
                        portal_id: destId,
                        connected: destData.connected || false
                    });
                }
            }
            
            portalsData.outgoing.push(portal);
        }
    }
    
    // Convert incoming portals from dict to array format
    if (pageData.incoming_portals) {
        for (const [portalId, portalData] of Object.entries(pageData.incoming_portals)) {
            const portal = {
                portalId: portalId,
                description: portalData.description || '',
                connected_portals: []
            };
            
            if (portalData.whitelisted_portals) {
                for (const [connId, connData] of Object.entries(portalData.whitelisted_portals)) {
                    portal.connected_portals.push({
                        portal_id: connId,
                        connected: connData.connected || false
                    });
                }
            }
            
            portalsData.incoming.push(portal);
        }
    }

    // Create portals container
    const portalsContainer = document.createElement('div');
    portalsContainer.className = 'portals-container';
    
    // Incoming portals section
    const incomingSection = document.createElement('div');
    incomingSection.className = 'portal-section incoming-section';
    
    const incomingHeading = document.createElement('h3');
    incomingHeading.textContent = 'Incoming:';
    incomingHeading.className = 'portal-subsection-heading';
    incomingSection.appendChild(incomingHeading);
    
    const incomingPortalsContainer = document.createElement('div');
    incomingPortalsContainer.className = 'portals-list incoming-portals-list';
    incomingSection.appendChild(incomingPortalsContainer);
    
    if (editpermission) {
        const addIncomingPortalButton = document.createElement('button');
        addIncomingPortalButton.className = 'add-portal-button';
        addIncomingPortalButton.textContent = 'Add Portal';
        addIncomingPortalButton.addEventListener('click', async () => {
            await addPortalEntry(incomingPortalsContainer, 'incoming', objectTag, null, 'object', holdingFeatureTag);
        });
        incomingSection.appendChild(addIncomingPortalButton);
    }
    
    // Outgoing portals section
    const outgoingSection = document.createElement('div');
    outgoingSection.className = 'portal-section outgoing-section';
    
    const outgoingHeading = document.createElement('h3');
    outgoingHeading.textContent = 'Outgoing:';
    outgoingHeading.className = 'portal-subsection-heading';
    outgoingSection.appendChild(outgoingHeading);
    
    const outgoingPortalsContainer = document.createElement('div');
    outgoingPortalsContainer.className = 'portals-list outgoing-portals-list';
    outgoingSection.appendChild(outgoingPortalsContainer);
    
    if (editpermission) {
        const addOutgoingPortalButton = document.createElement('button');
        addOutgoingPortalButton.className = 'add-portal-button';
        addOutgoingPortalButton.textContent = 'Add Portal';
        addOutgoingPortalButton.addEventListener('click', async () => {
            await addPortalEntry(outgoingPortalsContainer, 'outgoing', objectTag, null, 'object', holdingFeatureTag);
        });
        outgoingSection.appendChild(addOutgoingPortalButton);
    }
    
    portalsContainer.appendChild(incomingSection);
    portalsContainer.appendChild(outgoingSection);
    advancedSection.appendChild(portalsContainer);
    
    // Load existing portals
    if (portalsData.incoming) {
        for (const portal of portalsData.incoming) {
            await addPortalEntry(incomingPortalsContainer, 'incoming', objectTag, portal, 'object', holdingFeatureTag);
        }
    }
    if (portalsData.outgoing) {
        for (const portal of portalsData.outgoing) {
            await addPortalEntry(outgoingPortalsContainer, 'outgoing', objectTag, portal, 'object', holdingFeatureTag);
        }
    }

    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);
    attachFeatureSpanEventListeners(holdingFeature);

    // Update ARIA labeling for object page
    worldIndex.setAttribute('aria-labelledby', 'object-page-title');
    
    // Set focus to the object name for screen readers
    setTimeout(() => {
        objectName.setAttribute('tabindex', '-1');
        objectName.focus();
        // Announce the page change to screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `Object page for ${pageData.name} loaded`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
    }, 100);

    setCurrentPage(objectTag);
}

