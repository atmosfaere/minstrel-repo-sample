import { getWorldPage, saveSummary, saveInstruction, saveWorldSetting } from '../world-index-api.js';
import { navigateBackIndex, currentPage, setCurrentPage } from '../../world-index.js';
import { openLocationSelectionOverlay } from './location-overlay.js';
import { openCharacterSelectionOverlay } from './character-overlay.js';
import { openObjectSelectionOverlay } from './object-overlay.js';
import { addEditFieldEventListeners, renderPlainTextWithFeatureSyntaxToEditFieldHTML, attachFeatureSpanEventListeners, currentlyEditingDiv, setCurrentlyEditingDiv } from '../world-index-editing.js';
import { world } from '../../app.js';

export async function openWorldPage() {
    const worldIndex = document.querySelector('.world-index');
    const pageData = await getWorldPage();
    const viewPermission = pageData.view_permission;
    const editPermission = pageData.edit_permission;

    if (!viewPermission) {
        console.log("User doesn't have view permission for world.");
        return;
    }

    history.pushState({ worldIndex: true}, '', '');

    worldIndex.innerHTML = "";

    const backArrow = document.createElement('button');
    backArrow.innerHTML = '←';
    backArrow.className = 'back-arrow world-index-back-arrow';
    backArrow.setAttribute('aria-label', 'Back to main index page');
    backArrow.addEventListener('click', () => navigateBackIndex());
    worldIndex.appendChild(backArrow);

    const worldName = document.createElement('h1');
    worldName.className = 'world-index-title-name';
    worldName.id = 'world-page-title'; // Add ID for aria-labelledby
    worldName.textContent = pageData.world_name || '';
    worldName.style.cursor = 'pointer';
    worldName.title = 'Open world page';
    worldName.addEventListener('click', () => openWorldPage());
    worldIndex.appendChild(worldName);

    const summaryHeading = document.createElement('h2');
    summaryHeading.textContent = 'Summary:';
    summaryHeading.className = 'index-heading';

    let summary;
    const summaryControls = document.createElement('div');
    summaryControls.className = 'index-entry-page-field-controls';
    if (editPermission) {
        summary = document.createElement('div');
        summary.contentEditable = true;
        summary.setAttribute('role', 'textbox');
        summary.setAttribute('aria-multiline', 'true');
        if (
            !pageData.summary ||
            pageData.summary === "No Summary Yet" ||
            pageData.summary === "Not provided" ||
            pageData.summary.trim() === ""
        ) {
            summary.setAttribute('index-contenteditable-placeholder', 'Create world summary...');
            summary.innerHTML = "";
        } else {
            const htmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.summary);
            summary.innerHTML = htmlContent;
        }
        addEditFieldEventListeners(summary, summaryControls, world, saveSummary);

        const newSummaryLocationButton = document.createElement('button');
        newSummaryLocationButton.className = 'world-index-location-button';
        newSummaryLocationButton.textContent = '+ Location';
        newSummaryLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(summary);
            summary.focus();
            openLocationSelectionOverlay();
        });
        summaryControls.appendChild(newSummaryLocationButton);

        const newSummaryCharacterButton = document.createElement('button');
        newSummaryCharacterButton.className = 'world-index-character-button';
        newSummaryCharacterButton.textContent = '+ Character';
        newSummaryCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(summary);
            summary.focus();
            openCharacterSelectionOverlay();
        });
        summaryControls.appendChild(newSummaryCharacterButton);

        const newSummaryObjectButton = document.createElement('button');
        newSummaryObjectButton.className = 'world-index-object-button';
        newSummaryObjectButton.textContent = '+ Object';
        newSummaryObjectButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(summary);
            summary.focus();
            openObjectSelectionOverlay();
        });
        summaryControls.appendChild(newSummaryObjectButton);
    } else {
        summary = document.createElement('div');
        const htmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.summary);
        summary.innerHTML = htmlContent;
    }
    summary.className = 'world-info-field-index world-info-field-index-summary';

    const instructionHeading = document.createElement('h2');
    instructionHeading.textContent = 'Instruction:';
    instructionHeading.className = 'index-heading';
    worldIndex.appendChild(instructionHeading);

    let instruction;
    const instructionControls = document.createElement('div');
    instructionControls.className = 'index-entry-page-field-controls';
    if (editPermission) {
        instruction = document.createElement('div');
        instruction.contentEditable = true;
        instruction.setAttribute('role', 'textbox');
        instruction.setAttribute('aria-multiline', 'true');
        if (!pageData.instruction || pageData.instruction === "No Instruction Yet") {
            instruction.setAttribute('index-contenteditable-placeholder', 'Enter Global AI instruction...');
            instruction.innerHTML = "";
        } else {
            const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
            instruction.innerHTML = instructionHtmlContent;
        }
        addEditFieldEventListeners(instruction, instructionControls, world, saveInstruction);

        const newInstructionLocationButton = document.createElement('button');
        newInstructionLocationButton.className = 'world-index-location-button';
        newInstructionLocationButton.textContent = '+ Location';
        newInstructionLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(instruction);
            instruction.focus();
            openLocationSelectionOverlay();
        });
        instructionControls.appendChild(newInstructionLocationButton);
        
        const newInstructionCharacterButton = document.createElement('button');
        newInstructionCharacterButton.className = 'world-index-character-button';
        newInstructionCharacterButton.textContent = '+ Character';
        newInstructionCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(instruction);
            instruction.focus();
            openCharacterSelectionOverlay();
        });
        instructionControls.appendChild(newInstructionCharacterButton);

        const newInstructionObjectButton = document.createElement('button');
        newInstructionObjectButton.className = 'world-index-object-button';
        newInstructionObjectButton.textContent = '+ Object';
        newInstructionObjectButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(instruction);
            instruction.focus();
            openObjectSelectionOverlay();
        });
        instructionControls.appendChild(newInstructionObjectButton);
    } else {
        instruction = document.createElement('div');
        const instructionHtmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.instruction);
        instruction.innerHTML = instructionHtmlContent;
    }
    instruction.className = 'world-info-field-index world-info-field-index-instruction';

    const settingHeading = document.createElement('h2');
    settingHeading.textContent = 'Setting:';
    settingHeading.className = 'index-heading';
    worldIndex.appendChild(settingHeading);

    let worldSetting;
    const worldSettingControls = document.createElement('div');
    worldSettingControls.className = 'index-entry-page-field-controls';
    if (editPermission) {
        worldSetting = document.createElement('div');
        worldSetting.contentEditable = true;
        worldSetting.setAttribute('role', 'textbox');
        worldSetting.setAttribute('aria-multiline', 'true');
        if (!pageData.world_setting || pageData.world_setting === "No Setting Yet") {
            worldSetting.setAttribute('index-contenteditable-placeholder', 'Create world setting...');
            worldSetting.innerHTML = "";
        } else {
            worldSetting.innerHTML = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.world_setting);
        }
        addEditFieldEventListeners(worldSetting, worldSettingControls, world, saveWorldSetting);

        const newSettingLocationButton = document.createElement('button');
        newSettingLocationButton.className = 'world-index-location-button';
        newSettingLocationButton.textContent = '+ Location';
        newSettingLocationButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(worldSetting);
            worldSetting.focus();
            openLocationSelectionOverlay();
        });
        worldSettingControls.appendChild(newSettingLocationButton);
        // +Character button
        const newSettingCharacterButton = document.createElement('button');
        newSettingCharacterButton.className = 'world-index-character-button';
        newSettingCharacterButton.textContent = '+ Character';
        newSettingCharacterButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(worldSetting);
            worldSetting.focus();
            openCharacterSelectionOverlay();
        });
        worldSettingControls.appendChild(newSettingCharacterButton);

        const newSettingObjectButton = document.createElement('button');
        newSettingObjectButton.className = 'world-index-object-button';
        newSettingObjectButton.textContent = '+ Object';
        newSettingObjectButton.addEventListener('click', () => {
            setCurrentlyEditingDiv(worldSetting);
            worldSetting.focus();
            openObjectSelectionOverlay();
        });
        worldSettingControls.appendChild(newSettingObjectButton);
    } else {
        worldSetting = document.createElement('div');
        worldSetting.innerHTML = renderPlainTextWithFeatureSyntaxToEditFieldHTML(pageData.world_setting);
    }
    worldSetting.className = 'world-info-field-index world-info-field-index-instruction';

    worldIndex.appendChild(summaryHeading);
    worldIndex.appendChild(summary);
    worldIndex.appendChild(summaryControls);

    worldIndex.appendChild(instructionHeading);
    worldIndex.appendChild(instruction);
    worldIndex.appendChild(instructionControls);

    worldIndex.appendChild(settingHeading);
    worldIndex.appendChild(worldSetting);
    worldIndex.appendChild(worldSettingControls);

    attachFeatureSpanEventListeners(summary);
    attachFeatureSpanEventListeners(instruction);
    attachFeatureSpanEventListeners(worldSetting);

    // Update ARIA labeling for world page
    worldIndex.setAttribute('aria-labelledby', 'world-page-title');
    
    // Set focus to the world name for screen readers
    setTimeout(() => {
        worldName.setAttribute('tabindex', '-1');
        worldName.focus();
        // Announce the page change to screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('aria-live', 'assertive');
        announcement.setAttribute('aria-atomic', 'true');
        announcement.className = 'sr-only';
        announcement.textContent = `World page for ${pageData.world_name || 'this world'} loaded`;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
    }, 100);

    setCurrentPage("world");
}