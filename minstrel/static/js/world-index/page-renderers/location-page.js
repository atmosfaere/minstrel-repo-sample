import { navigateBackIndex, currentPage, setCurrentPage } from '../../world-index.js';
import { openCharacterPage } from './character-page.js';
//import { openObjectPage } from './object-page.js';
import { openLocationSelectionOverlay } from './location-overlay.js';
import { openCharacterSelectionOverlay } from './character-overlay.js';
import { openObjectSelectionOverlay } from './object-overlay.js';
import { addEditFieldEventListeners, setCurrentlyEditingDiv, startEditingLocationName, savedSelection, setSavedSelection, renderPlainTextWithFeatureSyntaxToEditFieldHTML, attachFeatureSpanEventListeners } from '../world-index-editing.js';
import { saveSummary, saveInstruction, saveParentLocation, deleteFeature, getLocationPage } from '../world-index-api.js';
import { addPortalEntry } from '../portal-management.js';
import { baseUrl } from '../../app.js';
import { openMainIndexPage } from './main-page.js';

export async function openLocationPage(locationTag) {
    const worldIndex = document.querySelector('.world-index');
    const pageData = await getLocationPage(locationTag);

    const viewPermission = pageData.view_permission;
    const editpermission = pageData.edit_permission;

    if (!viewPermission) {
        console.log('No view permission for location, ', locationTag);
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

    const locationImage = document.createElement('img');
    locationImage.style.display = 'none'; // Hide initially
    locationImage.className = 'index-character-image';
    
    const imageUrl = `${baseUrl}/static/images/${locationTag}.png`;
    locationImage.src = imageUrl;
    
    // Show Location image only if loaded successfully
    locationImage.onload = () => {
        locationImage.style.display = 'block';
    };
    
    locationImage.onerror = () => {
        locationImage.style.display = 'none';
        console.log(`Location image not found for ${locationTag}`);
    };

    // Create flex container for location name and edit icon
    const locationNameContainer = document.createElement('div');
    locationNameContainer.className = 'character-name-container';
    locationNameContainer.id = 'location-page-title'; // Add ID for aria-labelledby

    const locationName = document.createElement('h1');
    locationName.className = 'world-index-title-name';
    locationName.id = 'location-page-title'; // Add ID for aria-labelledby
    locationName.textContent = pageData.name;

    const editButton = document.createElement('button');
    editButton.innerHTML = '✎';
    editButton.className = 'character-edit-button';
    editButton.setAttribute('aria-label', 'Edit location name');
    editButton.addEventListener('click', () => {
        startEditingLocationName(locationName, editButton, locationTag, pageData.name);
    });

    locationNameContainer.appendChild(locationName);
    locationNameContainer.appendChild(editButton);

    // Create delete button (positioned absolutely like back arrow)
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '🗑'; // This forces text style
    deleteButton.className = 'feature-delete-button';
    deleteButton.setAttribute('aria-label', 'Delete location');
    deleteButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this location?')) {
            try {
                await deleteFeature(locationTag);
                setCurrentPage("main");
                await openMainIndexPage();
            } catch (error) {
                console.error("Failed to delete location.", error);
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

        addEditFieldEventListeners(summary, summaryControls, locationTag, saveSummary);

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

        addEditFieldEventListeners(instruction, instructionControls, locationTag, saveInstruction);

    }  else {
        // Convert plain text with bracket syntax to HTML with clickable spans
        const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
        instruction.innerHTML = instructionHtmlContent;
    }

    const parentLocationHeading = document.createElement('h2');
    parentLocationHeading.textContent = 'Parent Location:';
    parentLocationHeading.className = 'index-heading';

    const parentLocation = document.createElement('div');
    parentLocation.className = 'world-info-field-index';
    parentLocation.setAttribute('data-field-type', 'parent-location'); // Add this line
    
    if (!pageData.parent_location || pageData.parent_location.trim() === "") {
        if (editpermission) {
            parentLocation.setAttribute('index-contenteditable-placeholder', 'Add location...');
        }
        parentLocation.innerHTML = '';
    } else {
        parentLocation.innerHTML = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.parent_location);
    }

    const locationControls = document.createElement('div');
    locationControls.className = 'index-entry-page-field-controls';

    const addParentLocationButton = document.createElement('button');
    addParentLocationButton.className = 'world-index-location-button';
    addParentLocationButton.textContent = '+ Location';

    addParentLocationButton.addEventListener('click', () => {
        setCurrentlyEditingDiv(parentLocation);
        setSavedSelection({});
        parentLocation.focus();
        openLocationSelectionOverlay();
    });

    locationControls.appendChild(addParentLocationButton);

    worldIndex.appendChild(locationImage);
    worldIndex.appendChild(locationNameContainer);
    worldIndex.appendChild(deleteButton);

    worldIndex.appendChild(summaryHeading);
    worldIndex.appendChild(summary);
    worldIndex.appendChild(summaryControls);

    worldIndex.appendChild(instructionHeading);
    worldIndex.appendChild(instruction);
    worldIndex.appendChild(instructionControls);

    worldIndex.appendChild(parentLocationHeading);
    worldIndex.appendChild(parentLocation);
    worldIndex.appendChild(locationControls);

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
    
    console.log('Location page - received pageData.outgoing_portals:', pageData.outgoing_portals);
    console.log('Location page - received pageData.incoming_portals:', pageData.incoming_portals);
    
    // Convert outgoing portals from dict to array format
    if (pageData.outgoing_portals) {
        for (const [portalId, portalData] of Object.entries(pageData.outgoing_portals)) {
            const portal = {
                portalId: portalId,  // Changed from 'id' to 'portalId'
                description: portalData.description || '',
                destinations: []
            };
            
            // Convert destinations dict to array with connection status
            if (portalData.destinations) {
                console.log(`Portal ${portalId} destinations:`, portalData.destinations);
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
                portalId: portalId,  // Changed from 'id' to 'portalId'
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
            await addPortalEntry(incomingPortalsContainer, 'incoming', locationTag);
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
            await addPortalEntry(outgoingPortalsContainer, 'outgoing', locationTag);
        });
        outgoingSection.appendChild(addOutgoingPortalButton);
    }
    
    portalsContainer.appendChild(incomingSection);
    portalsContainer.appendChild(outgoingSection);
    advancedSection.appendChild(portalsContainer);
    
    // Load existing portals
    if (portalsData.incoming) {
        for (const portal of portalsData.incoming) {
            await addPortalEntry(incomingPortalsContainer, 'incoming', locationTag, portal);
        }
    }
    if (portalsData.outgoing) {
        for (const portal of portalsData.outgoing) {
            await addPortalEntry(outgoingPortalsContainer, 'outgoing', locationTag, portal);
        }
    }

    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);
    attachFeatureSpanEventListeners(parentLocation);

    // Update ARIA labeling for location page
    worldIndex.setAttribute('aria-labelledby', 'location-page-title');
    
    // Set focus to the location name for screen readers
    setTimeout(() => {
        locationName.setAttribute('tabindex', '-1');
        locationName.focus();
        // Announce the page change to screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `Location page for ${pageData.name} loaded`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
    }, 100);

    setCurrentPage(locationTag);
}