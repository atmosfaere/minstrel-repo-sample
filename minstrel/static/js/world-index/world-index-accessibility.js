
export function trapFocus(element) {
    // Set aria-hidden on top-level containers
    const topLevelContainers = Array.from(document.body.children).filter(child => 
        child !== element && child.nodeType === Node.ELEMENT_NODE
    );
    
    topLevelContainers.forEach(container => {
        container.setAttribute('aria-hidden', 'true');
        container.classList.add('focus-disabled');
    });
    
    // Set tabindex="-1" on all focusable elements outside the trapped element
    const allFocusableElements = document.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [contenteditable="true"], [tabindex]'
    );
    
    // Disable everything outside the trapped element; ensure inside elements are enabled
    allFocusableElements.forEach(focusableElement => {
        if (!element.contains(focusableElement)) {
            // Outside trapped container – make unfocusable via Tab
            focusableElement.setAttribute('tabindex', '-1');
            focusableElement.classList.add('focus-disabled');
        } else {
            // Inside trapped container – ensure it's tabbable
            focusableElement.classList.remove('focus-disabled');
            if (focusableElement.getAttribute('tabindex') === '-1') {
                // Remove the -1 we may have added in a previous trap
                focusableElement.removeAttribute('tabindex');
            }
        }
    });

    const handleKeyNavigation = (e) => {
        if (e.key === 'Tab') {
            const nodeList = element.querySelectorAll(
                'button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [contenteditable="true"]:not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])'
            );
            
            if (nodeList.length === 0) return;

            // Only cycle through actually visible elements
            const focusableElements = Array.from(nodeList).filter(el => {
                // offsetParent is null for display:none or inside a hidden ancestor
                return el.offsetParent !== null;
            });

            if (focusableElements.length === 0) return;
            let currentIndex = focusableElements.indexOf(document.activeElement);

            // If focus somehow isn't on a managed element, start from the beginning
            if (currentIndex === -1) {
                currentIndex = 0;
            }

            e.preventDefault();

            let nextIndex;
            if (e.shiftKey) {
                nextIndex = currentIndex === 0
                    ? focusableElements.length - 1
                    : currentIndex - 1;
            } else {
                nextIndex = currentIndex === focusableElements.length - 1
                    ? 0
                    : currentIndex + 1;
            }

            const nextElement = focusableElements[nextIndex];
            if (nextElement && typeof nextElement.focus === 'function') {
                nextElement.focus();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();

            console.log('Escape key pressed focus trap');
            
            const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
            const newFeatureOverlay = document.querySelector('.new-feature-overlay');
            
            if (featureSelectionOverlay || newFeatureOverlay) {
                // Remove any overlays that exist
                if (featureSelectionOverlay) {
                    // Clean up any global click handler that may have been attached
                    if (featureSelectionOverlay._outsideClickHandler) {
                        document.removeEventListener('click', featureSelectionOverlay._outsideClickHandler, true);
                        delete featureSelectionOverlay._outsideClickHandler;
                    }

                    if (typeof featureSelectionOverlay.closeOverlay === 'function') {
                        featureSelectionOverlay.closeOverlay({ skipFocusManagement: true });
                    } else {
                        featureSelectionOverlay.remove();
                    }
                }
                if (newFeatureOverlay) {
                    // Clean up any global click handler that may have been attached
                    if (newFeatureOverlay._outsideClickHandler) {
                        document.removeEventListener('click', newFeatureOverlay._outsideClickHandler, true);
                        delete newFeatureOverlay._outsideClickHandler;
                    }

                    newFeatureOverlay.remove();
                }
                
                restoreFocus();
                const worldIndex = document.querySelector('.world-index');
                if (worldIndex) {
                    trapFocus(worldIndex);
                    const firstFocusable = worldIndex.querySelector('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
                    if (firstFocusable) {
                        firstFocusable.focus();
                    }
                }
            } else {
                closeWorldIndex();
            }
        }
    };
    
    // Only add event listener if not already attached from previous call to trapFocus
    if (!element.hasAttribute('data-focus-trap-active')) {
        element.addEventListener('keydown', handleKeyNavigation);
        element.setAttribute('data-focus-trap-active', 'true');
        // Store the handler function on the element so it can be removed later
        element._focusTrapHandler = handleKeyNavigation;
    }
    //element.focus();
}

// Remove focus trap
export function restoreFocus() {
    // Remove aria-hidden and restore default tabindex for all focus-disabled elements
    const disabledElements = document.querySelectorAll('.focus-disabled');
    disabledElements.forEach(element => {
        element.removeAttribute('aria-hidden');
        if (element.getAttribute('tabindex') === '-1') {
            // Drop the -1 we introduced so the browser's default tab behavior applies again
            element.removeAttribute('tabindex');
        }
        element.classList.remove('focus-disabled');
    });
    
    // Remove navigation event listeners from focus trapped container
    const activeTraps = document.querySelectorAll('[data-focus-trap-active]');
    activeTraps.forEach(element => {
        if (element._focusTrapHandler) {
            element.removeEventListener('keydown', element._focusTrapHandler);
            delete element._focusTrapHandler;
        }
        element.removeAttribute('data-focus-trap-active');
    });
}