import { openNewDocumentPage } from './document-page.js';
import { openNewContainerPage } from './container-page.js';
import { openNewObjectPage } from './object-page.js';
import { getDocumentList, getContainerList, getObjectList } from '../world-index-api.js';
import { insertFeatureSpan } from '../world-index-editing.js';
import { restoreFocus, trapFocus } from '../world-index-accessibility.js';

export async function openObjectSelectionOverlay() {
    const featureSelectionOverlay = document.createElement('div');
    featureSelectionOverlay.className = 'feature-selection-overlay';
    
    featureSelectionOverlay.setAttribute('role', 'dialog');
    featureSelectionOverlay.setAttribute('aria-modal', 'true');
    featureSelectionOverlay.setAttribute('aria-labelledby', 'world-index-title-name');
    
    const title = document.createElement('h2');
    title.id = 'world-index-title-name';
    title.textContent = 'New or Existing Object';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const objectButtonsContainer = document.createElement('div');
    objectButtonsContainer.className = 'feature-selection-container';
    
    const newObjectButton = document.createElement('button');
    newObjectButton.className = 'feature-selection-button new-object-button';
    newObjectButton.textContent = 'New Object';
    newObjectButton.addEventListener('click', () => openNewObjectPage());
    objectButtonsContainer.appendChild(newObjectButton);
    
    const existingObjectButton = document.createElement('button');
    existingObjectButton.className = 'feature-selection-button existing-object-button';
    existingObjectButton.textContent = 'Existing Object';
    existingObjectButton.addEventListener('click', () => displayExistingObjects());
    objectButtonsContainer.appendChild(existingObjectButton);
    
    const newDocumentButton = document.createElement('button');
    newDocumentButton.className = 'feature-selection-button new-document-button';
    newDocumentButton.textContent = 'New Document';
    newDocumentButton.addEventListener('click', () => openNewDocumentPage());
    objectButtonsContainer.appendChild(newDocumentButton);
    
    const existingDocumentButton = document.createElement('button');
    existingDocumentButton.className = 'feature-selection-button existing-document-button';
    existingDocumentButton.textContent = 'Existing Document';
    existingDocumentButton.addEventListener('click', () => displayExistingDocuments());
    objectButtonsContainer.appendChild(existingDocumentButton);
    
    const newContainerButton = document.createElement('button');
    newContainerButton.className = 'feature-selection-button new-container-button';
    newContainerButton.textContent = 'New Container';
    newContainerButton.addEventListener('click', () => openNewContainerPage());
    objectButtonsContainer.appendChild(newContainerButton);
    
    const existingContainerButton = document.createElement('button');
    existingContainerButton.className = 'feature-selection-button existing-container-button';
    existingContainerButton.textContent = 'Existing Container';
    existingContainerButton.addEventListener('click', () => displayExistingContainers());
    objectButtonsContainer.appendChild(existingContainerButton);
    
    featureSelectionOverlay.appendChild(objectButtonsContainer);
    
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

    const startWithExisting = options.startWithExisting;

    if (startWithExisting === 'object') {
        // Jump directly to existing objects list
        await displayExistingObjects();
    } else if (startWithExisting === 'document') {
        await displayExistingDocuments();
    } else if (startWithExisting === 'container') {
        await displayExistingContainers();
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

async function displayExistingDocuments() {
    const allDocuments = await getDocumentList();
    
    const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
    if (!featureSelectionOverlay) return;
    
    featureSelectionOverlay.innerHTML = "";
    
    const title = document.createElement('h2');
    title.id = 'existing-documents-title';
    title.textContent = 'Select Existing Document';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'feature-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search documents...';
    searchInput.className = 'feature-search-input';
    searchInput.setAttribute('aria-label', 'Search documents');
    searchContainer.appendChild(searchInput);
    
    featureSelectionOverlay.appendChild(searchContainer);
    
    const documentListContainer = document.createElement('div');
    documentListContainer.className = 'document-list-container';
    documentListContainer.setAttribute('role', 'list');
    documentListContainer.setAttribute('aria-label', 'Documents');
    
    function renderDocuments(documents) {
        documentListContainer.innerHTML = '';
        
        if (documents.length === 0) {
            const noResults = document.createElement('p');
            noResults.textContent = 'No documents found.';
            noResults.className = 'no-results';
            noResults.setAttribute('role', 'status');
            noResults.setAttribute('aria-live', 'polite');
            documentListContainer.appendChild(noResults);
            return;
        }
        
        documents.forEach(doc => {
            const featureButton = document.createElement('button');
            featureButton.className = 'feature-list-item';
            featureButton.textContent = doc.name;
            featureButton.dataset.documentTag = doc.tag;
            featureButton.setAttribute('role', 'listitem');
            featureButton.setAttribute('aria-label', `${doc.name}`);
            
            featureButton.addEventListener('click', () => {
                console.log('Selected document:', doc.tag, doc.name);
                insertFeatureSpan(doc.tag, doc.name);
            });
            
            documentListContainer.appendChild(featureButton);
        });
    }
    
    renderDocuments(allDocuments);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredDocuments = allDocuments.filter(document => 
            document.name.toLowerCase().includes(searchTerm)
        );
        renderDocuments(filteredDocuments);
    });
    
    featureSelectionOverlay.appendChild(documentListContainer);

    trapFocus(featureSelectionOverlay);
    searchInput.focus();
}

async function displayExistingContainers() {
    const allContainers = await getContainerList();
    
    const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
    if (!featureSelectionOverlay) return;
    
    featureSelectionOverlay.innerHTML = "";
    
    const title = document.createElement('h2');
    title.id = 'existing-containers-title';
    title.textContent = 'Select Existing Container';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'feature-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search containers...';
    searchInput.className = 'feature-search-input';
    searchInput.setAttribute('aria-label', 'Search containers');
    searchContainer.appendChild(searchInput);
    
    featureSelectionOverlay.appendChild(searchContainer);
    
    const containerListContainer = document.createElement('div');
    containerListContainer.className = 'container-list-container';
    containerListContainer.setAttribute('role', 'list');
    containerListContainer.setAttribute('aria-label', 'Containers');
    
    function renderContainers(containers) {
        containerListContainer.innerHTML = '';
        
        if (containers.length === 0) {
            const noResults = document.createElement('p');
            noResults.textContent = 'No containers found.';
            noResults.className = 'no-results';
            noResults.setAttribute('role', 'status');
            noResults.setAttribute('aria-live', 'polite');
            containerListContainer.appendChild(noResults);
            return;
        }
        
        containers.forEach(container => {
            const featureButton = document.createElement('button');
            featureButton.className = 'feature-list-item';
            featureButton.textContent = container.name;
            featureButton.dataset.containerTag = container.tag;
            featureButton.setAttribute('role', 'listitem');
            featureButton.setAttribute('aria-label', `${container.name}`);
            
            featureButton.addEventListener('click', () => {
                console.log('Selected container:', container.tag, container.name);
                insertFeatureSpan(container.tag, container.name);
            });
            
            containerListContainer.appendChild(featureButton);
        });
    }
    
    renderContainers(allContainers);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredContainers = allContainers.filter(container => 
            container.name.toLowerCase().includes(searchTerm)
        );
        renderContainers(filteredContainers);
    });
    
    featureSelectionOverlay.appendChild(containerListContainer);

    trapFocus(featureSelectionOverlay);
    searchInput.focus();
}

async function displayExistingObjects() {
    const allObjects = await getObjectList();
    
    const featureSelectionOverlay = document.querySelector('.feature-selection-overlay');
    if (!featureSelectionOverlay) return;
    
    featureSelectionOverlay.innerHTML = "";
    
    const title = document.createElement('h2');
    title.id = 'existing-objects-title';
    title.textContent = 'Select Existing Object';
    title.className = 'world-index-title-name';
    featureSelectionOverlay.appendChild(title);
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'feature-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search objects...';
    searchInput.className = 'feature-search-input';
    searchInput.setAttribute('aria-label', 'Search objects');
    searchContainer.appendChild(searchInput);
    
    featureSelectionOverlay.appendChild(searchContainer);
    
    const objectListContainer = document.createElement('div');
    objectListContainer.className = 'object-list-container';
    objectListContainer.setAttribute('role', 'list');
    objectListContainer.setAttribute('aria-label', 'Objects');
    
    function renderObjects(objects) {
        objectListContainer.innerHTML = '';
        
        if (objects.length === 0) {
            const noResults = document.createElement('p');
            noResults.textContent = 'No objects found.';
            noResults.className = 'no-results';
            noResults.setAttribute('role', 'status');
            noResults.setAttribute('aria-live', 'polite');
            objectListContainer.appendChild(noResults);
            return;
        }
        
        objects.forEach(obj => {
            const featureButton = document.createElement('button');
            featureButton.className = 'feature-list-item';
            featureButton.textContent = obj.name;
            featureButton.dataset.objectTag = obj.tag;
            featureButton.setAttribute('role', 'listitem');
            featureButton.setAttribute('aria-label', `${obj.name}`);
            
            featureButton.addEventListener('click', () => {
                console.log('Selected object:', obj.tag, obj.name);
                insertFeatureSpan(obj.tag, obj.name);
            });
            
            objectListContainer.appendChild(featureButton);
        });
    }
    
    renderObjects(allObjects);
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredObjects = allObjects.filter(object => 
            object.name.toLowerCase().includes(searchTerm)
        );
        renderObjects(filteredObjects);
    });
    
    featureSelectionOverlay.appendChild(objectListContainer);

    trapFocus(featureSelectionOverlay);
    searchInput.focus();
}

