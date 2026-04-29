import { sanitizeHTML } from '../utility.js';

import { saveLocation, saveParentLocation, saveObjectLocation, saveName } from './world-index-api.js';
import { openPage, currentPage } from '../world-index.js';
import { restoreFocus, trapFocus } from './world-index-accessibility.js';

export let currentlyEditingDiv = null;
export let savedSelection = {};
export let newFeatureSavedSelection = {};
export let newFeatureCurrentlyEditingTextarea = null;

export function setNewFeatureSavedSelection(selection) {
    newFeatureSavedSelection = selection;
}

export function setNewFeatureCurrentlyEditingTextarea(textarea) {
    newFeatureCurrentlyEditingTextarea = textarea;
}

export function setCurrentlyEditingDiv(div) {
    currentlyEditingDiv = div;
}

export function setSavedSelection(selection) {
    savedSelection = selection;
}

export function addEditFieldEventListeners(element, controlsContainer, featureId, saveFunction) {
    addSelectionEventListeners(element);
    
    // Add event listener to show save button when element is edited
    element.addEventListener('input', function() {
        if (!controlsContainer.querySelector('.world-index-save-button')) {
            const saveButton = document.createElement('button');
            saveButton.className = 'world-index-save-button';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', function() {
                const plainTextContent = convertEditFieldHTMLToPlainText(element);
                saveFunction(featureId, plainTextContent);
                console.log('Saving content:', plainTextContent);
                // Remove save button after saving
                saveButton.remove();
                // Keep focus trapped within the world index modal
                element.focus();
                currentlyEditingDiv = element;

                // Re-establish focus trap on the main world index container in case
                // any intermediate overlays or focus resets cleared it, but only
                // when we're editing inside the world index itself (not inside a
                // stacked new-feature overlay).
                const isInNewFeatureOverlay = !!element.closest('.new-feature-overlay');
                if (!isInNewFeatureOverlay) {
                    const worldIndex = document.querySelector('.world-index');
                    if (worldIndex) {
                        trapFocus(worldIndex);
                    }
                }
            });
            controlsContainer.appendChild(saveButton);
        }
    });
}

export function addSelectionEventListeners(element) {
    // Set currentlyEditingTextarea when the element is selected
    element.addEventListener('focus', function() {
        if (element.contentEditable === 'true') {
            const newFeatureOverlay = document.querySelector('.new-feature-overlay');
            if (newFeatureOverlay && newFeatureOverlay.contains(element)) {
                newFeatureCurrentlyEditingTextarea = element;
            } else {
                currentlyEditingDiv = element;
            }
        }
    });
    
    element.addEventListener('selectionchange', function() {
        const newFeatureOverlay = document.querySelector('.new-feature-overlay');
        if (newFeatureOverlay && newFeatureOverlay.contains(element)) {
            if (newFeatureCurrentlyEditingTextarea === element) {
                saveSelection(newFeatureSavedSelection, newFeatureCurrentlyEditingTextarea);
            }
        } else if (currentlyEditingDiv === element) {
            saveSelection(savedSelection, currentlyEditingDiv);
        }
    });
    
    element.addEventListener('keyup', function() {
        const newFeatureOverlay = document.querySelector('.new-feature-overlay');
        if (newFeatureOverlay && newFeatureOverlay.contains(element)) {
            if (newFeatureCurrentlyEditingTextarea === element) {
                saveSelection(newFeatureSavedSelection, newFeatureCurrentlyEditingTextarea);
            }
        } else if (currentlyEditingDiv === element) {
            saveSelection(savedSelection, currentlyEditingDiv);
        }
    });
    
    element.addEventListener('mouseup', function() {
        const newFeatureOverlay = document.querySelector('.new-feature-overlay');
        if (newFeatureOverlay && newFeatureOverlay.contains(element)) {
            if (newFeatureCurrentlyEditingTextarea === element) {
                saveSelection(newFeatureSavedSelection, newFeatureCurrentlyEditingTextarea);
            }
        } else if (currentlyEditingDiv === element) {
            saveSelection(savedSelection, currentlyEditingDiv);
        }
    });
    
    element.addEventListener('blur', function() {
        const newFeatureOverlay = document.querySelector('.new-feature-overlay');
        if (newFeatureOverlay && newFeatureOverlay.contains(element)) {
            if (newFeatureCurrentlyEditingTextarea === element) {
                saveSelection(newFeatureSavedSelection, newFeatureCurrentlyEditingTextarea);
            }
        } else if (currentlyEditingDiv === element) {
            saveSelection(savedSelection, currentlyEditingDiv);
        }
    });
}

function startEditingName(nameElement, editButton, featureTag, currentName, featureType) {
    // Create input field similar to the one in openNewCharacterPage
    const nameInput = document.createElement('input');
    nameInput.className = 'world-index-title-name character-name-input';
    nameInput.type = 'text';
    nameInput.value = currentName;
    nameInput.setAttribute('aria-label', `${featureType} Name`);
    
    // Create save (check mark) button
    const saveButton = document.createElement('button');
    saveButton.innerHTML = '✔';
    saveButton.className = 'character-edit-button character-save-button';
    saveButton.setAttribute('aria-label', `Save ${featureType.toLowerCase()} name`);
    
    // Hide the delete button and back arrow during editing
    const worldIndex = document.querySelector('.world-index');
    const deleteButton = worldIndex.querySelector('.feature-delete-button');
    if (deleteButton) {
        deleteButton.style.display = 'none';
    }
    const backArrow = worldIndex.querySelector('.world-index-back-arrow');
    if (backArrow) {
        backArrow.style.display = 'none';
    }
    
    // Replace the h1 with input and pencil with check mark
    const container = nameElement.parentNode;
    container.replaceChild(nameInput, nameElement);
    container.replaceChild(saveButton, editButton);
    
    // Focus the input and select all text
    nameInput.focus();
    nameInput.select();
    
    const finishEditing = async (save = false) => {
        const newName = nameInput.value.trim();
        
        if (save && newName && newName !== currentName) {
            try {
                await saveName(featureTag, newName);
                // Update the displayed name
                nameElement.textContent = newName;
            } catch (error) {
                console.error('Error saving name:', error);
                alert(`Error saving ${featureType.toLowerCase()} name. Please try again.`);
                // Restore original name on error
                nameElement.textContent = currentName;
            }
        } else {
            // Restore original name if not saving or if empty
            nameElement.textContent = currentName;
        }
        
        // Show the delete button and back arrow again
        const worldIndex = document.querySelector('.world-index');
        const deleteButton = worldIndex.querySelector('.feature-delete-button');
        if (deleteButton) {
            deleteButton.style.display = 'block';
        }
        const backArrow = worldIndex.querySelector('.world-index-back-arrow');
        if (backArrow) {
            backArrow.style.display = 'block';
        }
        
        // Replace input with h1 and check mark with pencil
        container.replaceChild(nameElement, nameInput);
        container.replaceChild(editButton, saveButton);
    };
    
    // Save on enter key
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishEditing(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishEditing(false);
        }
    });
    
    // Save when clicking save button
    saveButton.addEventListener('click', () => {
        finishEditing(true);
    });
    
    // Cancel editing if clicking outside (but not on save button)
    const handleClickOutside = (e) => {
        if (!nameInput.contains(e.target) && !saveButton.contains(e.target)) {
            finishEditing(false);
            document.removeEventListener('click', handleClickOutside, true);
        }
    };
    
    // Add click outside listener after a brief delay to avoid immediate trigger
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
    }, 100);
}

export function startEditingCharacterName(characterNameElement, editButton, characterTag, currentName) {
    startEditingName(characterNameElement, editButton, characterTag, currentName, 'Character');
}

export function startEditingLocationName(locationNameElement, editButton, locationTag, currentName) {
    startEditingName(locationNameElement, editButton, locationTag, currentName, 'Location');
}

// Converts HTML with feature spans to plain text with delimited ids
export function convertEditFieldHTMLToPlainText(contentEditableElement) {
    // Clone the element to avoid modifying the original
    const clone = contentEditableElement.cloneNode(true);
    
    // Find all index-text-feature-link spans and replace them with the bracket syntax
    const featureSpans = clone.querySelectorAll('.index-text-feature-link');
    featureSpans.forEach(span => {
        const featureTag = span.getAttribute('data-feature-tag');
        const featureName = span.textContent;
        const replacementText = `[${featureName}] @@${featureTag}@@`;
        
        // Create a text node with the replacement text
        const textNode = document.createTextNode(replacementText);
        span.parentNode.replaceChild(textNode, span);
    });
    
    // Return the plain text
    return clone.textContent || clone.innerText || '';
}

// Processes plain text with delimited feature ids creating clickable HTML spans
export function renderPlainTextWithFeatureSyntaxToEditFieldHTML(plainText) {
    // Regular expression to match [name] @@id@@ pattern
    const featurePattern = /\[([^\]]+)\]\s*@@([^@]+)@@/g;
    // Replace the pattern with HTML spans, sanitizing featureName and featureTag
    const htmlContent = plainText.replace(featurePattern, (match, featureName, featureTag) => {
        return `<span class="index-text-feature-link" data-feature-tag="${sanitizeHTML(featureTag)}" contenteditable="false">${sanitizeHTML(featureName)}</span>`;
    });
    
    return htmlContent;
}

export function attachFeatureSpanEventListeners(contentEditableElement) {
    const featureSpans = contentEditableElement.querySelectorAll('.index-text-feature-link');
    
    featureSpans.forEach(span => {
        const featureTag = span.getAttribute('data-feature-tag');
        
        span.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openPage(featureTag);
        });
    });
}

function saveSelection(selectionObject, editingTextarea) {
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && editingTextarea) {
        const range = selection.getRangeAt(0);
        // Only save if the selection is within the contenteditable element
        if (editingTextarea.contains(range.commonAncestorContainer) || 
            editingTextarea === range.commonAncestorContainer) {
            // Update the selection object by reference
            selectionObject.element = editingTextarea;
            selectionObject.range = range.cloneRange();
            console.log('Selection saved for element:', editingTextarea, 'Selection object:', selectionObject);
        }
    }
}

function restoreSelection(selectionObject) {
    if (selectionObject && selectionObject.element && selectionObject.range) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(selectionObject.range);
        selectionObject.element.focus();
        return true;
    }
    return false;
}

export function insertFeatureSpan(featureTag, featureName) {
    const newFeatureOverlay = document.querySelector('.new-feature-overlay');
    let editingTextarea = null;
    let selectionObject = null;
    let selectionRestored = false;

    if (newFeatureOverlay) {
        selectionRestored = restoreSelection(newFeatureSavedSelection);
        editingTextarea = newFeatureCurrentlyEditingTextarea;
        selectionObject = newFeatureSavedSelection;
    } else {
        selectionRestored = restoreSelection(savedSelection);
        editingTextarea = currentlyEditingDiv;
        selectionObject = savedSelection;
    }

    // Better way to check field type using data attribute
    const fieldType = editingTextarea?.getAttribute('data-field-type');
    const isLocationField = fieldType === 'location';
    const isParentLocationField = fieldType === 'parent-location';
    const isHeldField = fieldType === 'held';
    
    // Could check if (currentlyEditingDiv && currentlyEditingDiv.contentEditable === 'true') else = location, parent-location etc.
    
    if (!selectionRestored && !editingTextarea) {
        console.warn('No contenteditable element is currently being edited and no saved selection');
        return;
    }
    
    const targetElement = (selectionObject && selectionObject.element) ? selectionObject.element : editingTextarea;
    
    if (!targetElement || (!(isLocationField || isParentLocationField || isHeldField) && (!targetElement.contentEditable || targetElement.contentEditable === 'false'))) {
        console.warn('Target element is not a contenteditable (or location field)');
        return;
    }

    // If inserting into a location field, clear it first
    if (isLocationField || isParentLocationField || isHeldField) {
        targetElement.innerHTML = '';
    }
    
    const featureSpan = document.createElement('span');
    featureSpan.className = 'index-text-feature-link';
    featureSpan.setAttribute('data-feature-tag', featureTag);
    featureSpan.textContent = featureName;
    featureSpan.setAttribute('contenteditable', 'false'); // Prevent editing of the span itself
    
    featureSpan.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Feature span clicked:', featureTag, featureName);
        openPage(featureTag);
    });
    
    // Insert the span at the saved cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Ensure the range is within the target element
        if (targetElement.contains(range.commonAncestorContainer) || 
            targetElement === range.commonAncestorContainer) {
            range.deleteContents();
            range.insertNode(featureSpan);
            
            // Move cursor after the inserted span
            range.setStartAfter(featureSpan);
            range.setEndAfter(featureSpan);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            // If cursor is not in the right place, append to the end of the target element
            targetElement.appendChild(featureSpan);
        }
    } else {
        // No selection, append to the end
        targetElement.appendChild(featureSpan);
    }
    
    // automatically update new location instead of having user click save button
    if (isLocationField) {
        const plainText = convertEditFieldHTMLToPlainText(targetElement);
        saveLocation(currentPage, plainText);
    } else if (isParentLocationField) {
        const plainText = convertEditFieldHTMLToPlainText(targetElement);
        saveParentLocation(currentPage, plainText);
    } else if (isHeldField) {
        const plainText = convertEditFieldHTMLToPlainText(targetElement);
        saveObjectLocation(currentPage, plainText);
    }
    
    // Go back to the world index page and remove the location/feature selection overlay
    const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
    if (featureSelectionOverlay) {
        // If the overlay registered a global click handler, remove it so we don't
        // accidentally call restoreFocus() later on unrelated clicks.
        if (featureSelectionOverlay._outsideClickHandler) {
            document.removeEventListener('click', featureSelectionOverlay._outsideClickHandler, true);
            delete featureSelectionOverlay._outsideClickHandler;
        }

        featureSelectionOverlay.remove();
        restoreFocus();
        
        // Return to new feature overlay or world index
        if (newFeatureOverlay) {
            trapFocus(newFeatureOverlay);
        } else {
            const worldIndex = document.querySelector('.world-index');
            trapFocus(worldIndex);
        }
    }
    
    // Focus back on the target element and trigger input event
    if (targetElement) {
        targetElement.focus();
        targetElement.dispatchEvent(new Event('input'));
        
        currentlyEditingDiv = targetElement;
    }
}
