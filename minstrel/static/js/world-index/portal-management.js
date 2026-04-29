import { openLocationSelectionOverlay } from './page-renderers/location-overlay.js';
import { openCharacterSelectionOverlay } from './page-renderers/character-overlay.js';
import { attachFeatureSpanEventListeners, renderPlainTextWithFeatureSyntaxToEditFieldHTML, setCurrentlyEditingDiv, addEditFieldEventListeners, convertEditFieldHTMLToPlainText } from './world-index-editing.js';
import { baseUrl, world } from '../app.js';
import { debounce } from '../utility.js';
import { trapFocus, restoreFocus } from './world-index-accessibility.js';
import { getNewPortal } from './world-index-api.js';

let currentPortalEntry = null; // For portal management

// World search functionality for portals
async function openWorldSelectionForPortal(portalEntry = null) {
    currentPortalEntry = portalEntry; // Store for later use
    const overlay = createWorldSearchOverlay();
    const searchInput = overlay.querySelector('.feature-search-input');
    const resultsContainer = overlay.querySelector('.world-search-results');
    
    // Real-time search with debouncing
    searchInput.addEventListener('input', debounce(async (e) => {
        const results = await searchWorlds(e.target.value);
        renderWorldSearchResults(results, resultsContainer, e.target.value);
    }, 300));
    
    // Load initial results
    const initialResults = await searchWorlds('');
    renderWorldSearchResults(initialResults, resultsContainer, '');
    
    document.body.appendChild(overlay);
    trapFocus(overlay);
    searchInput.focus();
}

function createWorldSearchOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'feature-selection-overlay';
    
    const title = document.createElement('h2');
    title.textContent = 'Allow World Connection';
    title.className = 'world-index-title-name';
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'world-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search worlds...';
    searchInput.className = 'feature-search-input';
    
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'world-search-results';
    
    // World ID input section
    const worldIdSection = document.createElement('div');
    worldIdSection.className = 'world-id-section';
    
    const worldIdLabel = document.createElement('label');
    worldIdLabel.textContent = 'Enter World ID:';
    worldIdLabel.className = 'world-id-label';
    
    const worldIdContainer = document.createElement('div');
    worldIdContainer.className = 'world-id-container';
    
    const worldIdInput = document.createElement('input');
    worldIdInput.type = 'text';
    worldIdInput.placeholder = 'Enter private or public ID...';
    worldIdInput.className = 'world-id-input';
    
    const addWorldButton = document.createElement('button');
    addWorldButton.textContent = 'Add World';
    addWorldButton.className = 'world-id-add-button';
    addWorldButton.addEventListener('click', async () => {
        const worldId = worldIdInput.value.trim();
        if (worldId) {
            await selectWorldById(worldId);
        }
    });
    
    // Allow Enter key to trigger add
    worldIdInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const worldId = worldIdInput.value.trim();
            if (worldId) {
                await selectWorldById(worldId);
            }
        }
    });
    
    worldIdContainer.appendChild(worldIdInput);
    worldIdContainer.appendChild(addWorldButton);
    worldIdSection.appendChild(worldIdLabel);
    worldIdSection.appendChild(worldIdContainer);
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.className = 'overlay-close-button';
    closeButton.addEventListener('click', () => {
        overlay.remove();
        restoreFocus();
        
        // Re-establish focus trap on world index after closing overlay
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
    });
    
    searchContainer.appendChild(searchInput);
    
    overlay.appendChild(closeButton);
    overlay.appendChild(title);
    overlay.appendChild(searchContainer);
    overlay.appendChild(resultsContainer);
    overlay.appendChild(worldIdSection);
    
    // Handle click outside to close
    const handleClickOutside = (e) => {
        if (!overlay.contains(e.target)) {
            overlay.remove();
            restoreFocus();
            document.removeEventListener('click', handleClickOutside, true);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
    }, 100);
    
    return overlay;
}

async function searchWorlds(query) {
    try {
        const response = await fetch(`${baseUrl}/worlds/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('World search failed:', error);
        return { results: [], total: 0, user_worlds_count: 0 };
    }
}

function renderWorldSearchResults(data, container, query) {
    container.innerHTML = '';
    
    if (data.results.length === 0) {
        const noResults = document.createElement('p');
        noResults.textContent = query ? 'No worlds found matching your search.' : 'No worlds available.';
        noResults.className = 'no-results';
        container.appendChild(noResults);
        return;
    }
    
    // Separate user's worlds from public worlds
    const userWorlds = data.results.filter(world => world.is_owned);
    const publicWorlds = data.results.filter(world => !world.is_owned);
    
    // Add user's worlds section first
    if (userWorlds.length > 0) {
        addWorldSection(container, `My Worlds (${userWorlds.length})`, userWorlds);
    }
    
    // Add public worlds section
    if (publicWorlds.length > 0) {
        addWorldSection(container, `Public Worlds (${publicWorlds.length})`, publicWorlds);
    }
}

function addWorldSection(container, title, worlds) {
    const header = document.createElement('h3');
    header.textContent = title;
    header.className = 'world-search-section-header';
    container.appendChild(header);
    
    // Create table
    const table = document.createElement('table');
    table.className = 'world-search-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Name</th>
            <th>Creator</th>
            <th>Active Users</th>
            <th>Total Visits</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    worlds.forEach(world => {
        const row = document.createElement('tr');
        row.className = `world-search-row ${world.is_owned ? 'owned' : 'public'}`;
        
        row.innerHTML = `
            <td class="world-name-cell">${world.name}</td>
            <td class="world-creator-cell">${world.creator_name}</td>
            <td class="world-active-cell">${world.active_users || 0}</td>
            <td class="world-visits-cell">${world.total_visits || 0}</td>
        `;
        
        row.addEventListener('click', () => {
            selectWorldForPortal(world.world_id, world.name, world.server_url);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
}

function selectWorldForPortal(worldId, worldName, serverUrl) {
    console.log('Selected world for portal:', { worldId, worldName, serverUrl });
    
    // Check if we're working with the new portal structure
    if (currentPortalEntry && currentPortalEntry.worldsList) {
        // Add world to the list for incoming portal
        addWorldToList(currentPortalEntry.worldsList, worldId, worldName, currentPortalEntry.featureTag, currentPortalEntry);
        saveIncomingPortal(currentPortalEntry, currentPortalEntry.featureTag, currentPortalEntry.portalType);
        currentPortalEntry = null; // Clear reference
    }
    
    // Close overlay
    const overlay = document.querySelector('.world-search-overlay');
    if (overlay) {
        overlay.remove();
        restoreFocus();
        
        // Re-establish focus trap on world index after closing overlay
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
    }
}

async function selectWorldById(worldId) {
    try {
        // Fetch world name from S3
        const response = await fetch(`${baseUrl}/get-world-name`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                world_id: worldId
            })
        });
        
        if (response.ok) {
            const worldInfo = await response.json();
            if (worldInfo.exists) {
                selectWorldForPortal(worldId, worldInfo.name, 'External World');
                console.log('Added world by ID with name from S3:', worldInfo);
            } else {
                alert('World not found. Please check the World ID.');
                console.log('World does not exist:', worldId);
            }
        } else {
            alert('Error checking world. Please try again.');
            console.log('Failed to check world existence:', response.status);
        }
    } catch (error) {
        alert('Error checking world. Please try again.');
        console.log('Error fetching world info:', error);
    }
}

// Portal search functionality
async function openPortalSelectionForConnection(portalEntry = null, portalType = null) {
    currentPortalEntry = portalEntry; // Store for later use
    const overlay = createPortalSearchOverlay();
    const searchInput = overlay.querySelector('.feature-search-input');
    const resultsContainer = overlay.querySelector('.world-search-results');
    
    // Real-time search with debouncing
    searchInput.addEventListener('input', debounce(async (e) => {
        const results = await searchPortals(e.target.value, portalType);
        renderPortalSearchResults(results, resultsContainer, e.target.value);
    }, 300));
    
    // Load initial results
    const initialResults = await searchPortals('', portalType);
    renderPortalSearchResults(initialResults, resultsContainer, '');
    
    document.body.appendChild(overlay);
    trapFocus(overlay);
    searchInput.focus();
}

function createPortalSearchOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'feature-selection-overlay';
    
    const title = document.createElement('h2');
    title.textContent = 'Connect to Portal';
    title.className = 'world-index-title-name';
    
    const searchContainer = document.createElement('div');
    searchContainer.className = 'world-search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search portals...';
    searchInput.className = 'feature-search-input';
    
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'world-search-results';
    
    // Portal ID input section
    const portalIdSection = document.createElement('div');
    portalIdSection.className = 'portal-id-section';
    
    const portalIdLabel = document.createElement('label');
    portalIdLabel.textContent = 'Enter Portal ID:';
    portalIdLabel.className = 'portal-id-label';
    
    const portalIdContainer = document.createElement('div');
    portalIdContainer.className = 'portal-id-container';
    
    const portalIdInput = document.createElement('input');
    portalIdInput.type = 'text';
    portalIdInput.placeholder = 'Enter private or public ID...';
    portalIdInput.className = 'portal-id-input';
    
    const addPortalButton = document.createElement('button');
    addPortalButton.textContent = 'Add Portal';
    addPortalButton.className = 'portal-id-add-button';
    addPortalButton.addEventListener('click', async () => {
        const portalId = portalIdInput.value.trim();
        if (portalId) {
            await selectPortalById(portalId);
        }
    });
    
    // Allow Enter key to trigger add
    portalIdInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            const portalId = portalIdInput.value.trim();
            if (portalId) {
                await selectPortalById(portalId);
            }
        }
    });
    
    portalIdContainer.appendChild(portalIdInput);
    portalIdContainer.appendChild(addPortalButton);
    portalIdSection.appendChild(portalIdLabel);
    portalIdSection.appendChild(portalIdContainer);
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.className = 'overlay-close-button';
    closeButton.addEventListener('click', () => {
        overlay.remove();
        restoreFocus();
        
        // Re-establish focus trap on world index after closing overlay
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
    });
    
    searchContainer.appendChild(searchInput);
    
    overlay.appendChild(closeButton);
    overlay.appendChild(title);
    overlay.appendChild(searchContainer);
    overlay.appendChild(resultsContainer);
    overlay.appendChild(portalIdSection);
    
    // Handle click outside to close
    const handleClickOutside = (e) => {
        if (!overlay.contains(e.target)) {
            overlay.remove();
            restoreFocus();
            document.removeEventListener('click', handleClickOutside, true);
        }
    };
    
    // Delay adding the event listener to prevent immediate closure
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true);
    }, 100);
    
    return overlay;
}

async function searchPortals(query, portalDirection = null) {
    try {
        const requestBody = {
            query: query,
            limit: 50
        };
        
        // Add portal_direction filter if specified
        if (portalDirection) {
            requestBody.portal_direction = portalDirection;
        }
        
        const response = await fetch(`${baseUrl}/portals/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
            return await response.json();
        } else {
            console.error('Portal search failed:', response.status);
            return { results: [], total: 0 };
        }
    } catch (error) {
        console.error('Error searching portals:', error);
        return { results: [], total: 0 };
    }
}

function renderPortalSearchResults(data, container, query) {
    container.innerHTML = '';
    
    if (data.results.length === 0) {
        const noResults = document.createElement('p');
        noResults.textContent = query ? 'No portals found matching your search.' : 'No portals available.';
        noResults.className = 'no-results';
        container.appendChild(noResults);
        return;
    }
    
    // Show all results
    addPortalSection(container, `Portals (${data.results.length})`, data.results);
}

function addPortalSection(container, title, portals) {
    const header = document.createElement('h3');
    header.textContent = title;
    header.className = 'world-search-section-header';
    container.appendChild(header);
    
    // Create table
    const table = document.createElement('table');
    table.className = 'world-search-table';
    
    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Portal ID</th>
            <th>Portal Creator</th>
            <th>Location ID</th>
            <th>World Name</th>
            <th>World Creator</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Table body
    const tbody = document.createElement('tbody');
    
    portals.forEach(portal => {
        const row = document.createElement('tr');
        row.className = 'world-search-row';
        
        row.innerHTML = `
            <td class="world-name-cell">${portal.portal_id}</td>
            <td class="world-creator-cell">${portal.creator_name}</td>
            <td>${portal.location_id || 'N/A'}</td>
            <td>${portal.world_name}</td>
            <td>${portal.world_creator_name}</td>
        `;
        
        row.addEventListener('click', () => {
            selectPortalForConnection(portal.portal_id, portal.portal_id, portal.world_id);
        });
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    container.appendChild(table);
}

function selectPortalForConnection(portalId, portalName, worldId) {
    console.log('Selected portal for connection:', { portalId, portalName, worldId });
    
    // Check if we're working with the new portal structure
    if (currentPortalEntry) {
        if (currentPortalEntry.destinationsList) {
            // Outgoing portal: Add to destinations list
            const destinationsList = currentPortalEntry.destinationsList;
            
            // Check if portal already exists in the list
            const existingDestinations = destinationsList.querySelectorAll('.portal-destination-item');
            let alreadyExists = false;
            existingDestinations.forEach(item => {
                if (item.getAttribute('data-portal-id') === portalId) {
                    alreadyExists = true;
                }
            });
            
            if (!alreadyExists) {
                addDestinationToList(destinationsList, portalId, portalName, currentPortalEntry.featureTag, false, currentPortalEntry);
                // Save this outgoing portal individually
                saveOutgoingPortal(currentPortalEntry, currentPortalEntry.featureTag, currentPortalEntry.portalType);
            }
        } else if (currentPortalEntry.connectedPortalsList) {
            // Incoming portal: Add to connected portals list
            const connectedPortalsList = currentPortalEntry.connectedPortalsList;
            
            // Check if portal already exists in the list
            const existingPortals = connectedPortalsList.querySelectorAll('.portal-destination-item');
            let alreadyExists = false;
            existingPortals.forEach(item => {
                if (item.getAttribute('data-portal-id') === portalId) {
                    alreadyExists = true;
                }
            });
            
            if (!alreadyExists) {
                addConnectedPortalToList(connectedPortalsList, portalId, portalName, currentPortalEntry.featureTag, false, currentPortalEntry);
                saveIncomingPortal(currentPortalEntry, currentPortalEntry.featureTag, currentPortalEntry.portalType);
            }
        }
        
        currentPortalEntry = null; // Clear reference
    } 
    
    // Close overlay
    const overlay = document.querySelector('.portal-search-overlay');
    if (overlay) {
        overlay.remove();
        restoreFocus();
        
        // Re-establish focus trap on world index after closing overlay
        const worldIndex = document.querySelector('.world-index');
        trapFocus(worldIndex);
    }
}

async function selectPortalById(portalId) {
    try {
        // TODO: Implement portal info endpoint
        const response = await fetch(`${baseUrl}/get-portal-details`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                portal_id: portalId
            })
        });
        
        if (response.ok) {
            const portalInfo = await response.json();
            if (portalInfo.exists) {
                selectPortalForConnection(portalId, portalInfo.name, portalInfo.world_id);
                console.log('Added portal by ID:', portalInfo);
            } else {
                alert('Portal not found. Please check the Portal ID.');
                console.log('Portal does not exist:', portalId);
            }
        } else {
            alert('Error checking portal. Please try again.');
            console.log('Failed to check portal existence:', response.status);
        }
    } catch (error) {
        alert('Error checking portal. Please try again.');
        console.log('Error fetching portal info:', error);
    }
}

// Portal management functions
export async function addPortalEntry(container, type, featureTag, portalData = null, portalType = 'location', holdingFeatureTag = null) {
    const portalEntry = document.createElement('div');
    portalEntry.className = 'portal-entry';
    
    // Store portalType and holdingFeatureTag on the element for later use
    portalEntry.portalType = portalType;
    portalEntry.holdingFeatureTag = holdingFeatureTag;
    
    // Get or use existing portal ID
    let portalId = portalData?.portalId || '';
    
    // Fetch new portal ID if this is a new portal
    if (!portalId) {
        if (portalType === 'object') {
            const data = await getNewPortal(type, featureTag, 'object', featureTag);
            portalId = data.id;
        } else {
            const data = await getNewPortal(type, featureTag);
            portalId = data.id;
        }
    }
    
    // Portal ID field (non-editable display)
    const portalIdLabel = document.createElement('label');
    portalIdLabel.textContent = 'Portal ID:';
    portalIdLabel.className = 'portal-field-label';
    
    const portalIdDisplay = document.createElement('div');
    portalIdDisplay.className = 'portal-id-display';
    portalIdDisplay.textContent = portalId;
    portalIdDisplay.setAttribute('data-portal-id', portalId);
    
    const portalIdContainer = document.createElement('div');
    portalIdContainer.className = 'portal-field-container';
    portalIdContainer.appendChild(portalIdLabel);
    portalIdContainer.appendChild(portalIdDisplay);
    
    // Description field
    const descriptionLabel = document.createElement('label');
    descriptionLabel.textContent = 'Description:';
    descriptionLabel.className = 'portal-field-label';
    
    const descriptionDiv = document.createElement('div');
    descriptionDiv.className = 'portal-description-field';
    descriptionDiv.contentEditable = true;
    descriptionDiv.setAttribute('role', 'textbox');
    descriptionDiv.setAttribute('aria-multiline', 'true');
    const descriptionPlaceholder =
        type === 'incoming'
            ? '(Optional) Describe any details of portal travel and arrival...'
            : 'Describe the portal and the actions that activate it...';
    descriptionDiv.setAttribute('index-contenteditable-placeholder', descriptionPlaceholder);
    
    if (portalData?.description) {
        const htmlContent = renderPlainTextWithFeatureSyntaxToEditFieldHTML(portalData.description);
        descriptionDiv.innerHTML = htmlContent;
    } else {
        descriptionDiv.innerHTML = '';
    }
    
    const descriptionControls = document.createElement('div');
    descriptionControls.className = 'portal-field-controls';
    
    // Add save button functionality using the same pattern as summary/instruction
    const saveDescriptionFunction = (id, content) => {
        if (type === 'outgoing') {
            saveOutgoingPortal(portalEntry, featureTag, portalType);
        } else if (type === 'incoming') {
            saveIncomingPortal(portalEntry, featureTag, portalType);
        } else {
            console.error('Invalid portal type:', type);
        }
    };
    addEditFieldEventListeners(descriptionDiv, descriptionControls, featureTag, saveDescriptionFunction);
    
    const addLocationButton = document.createElement('button');
    addLocationButton.className = 'world-index-location-button';
    addLocationButton.textContent = '+ Location';
    addLocationButton.addEventListener('click', () => {
        setCurrentlyEditingDiv(descriptionDiv);
        openLocationSelectionOverlay();
    });
    
    const addCharacterButton = document.createElement('button');
    addCharacterButton.className = 'world-index-character-button';
    addCharacterButton.textContent = '+ Character';
    addCharacterButton.addEventListener('click', () => {
        setCurrentlyEditingDiv(descriptionDiv);
        openCharacterSelectionOverlay();
    });
    
    descriptionControls.appendChild(addLocationButton);
    descriptionControls.appendChild(addCharacterButton);
    
    const descriptionContainer = document.createElement('div');
    descriptionContainer.className = 'portal-field-container';
    descriptionContainer.appendChild(descriptionLabel);
    descriptionContainer.appendChild(descriptionDiv);
    descriptionContainer.appendChild(descriptionControls);
    
    // Destination or Connected Portals section based on type
    if (type === 'outgoing') {
        // Destinations field for outgoing portals (list of portals)
        const destinationsLabel = document.createElement('label');
        destinationsLabel.textContent = 'Destinations:';
        destinationsLabel.className = 'portal-field-label';
        
        const destinationsList = document.createElement('div');
        destinationsList.className = 'portal-destinations-list';
        
        // Load existing destinations
        if (portalData?.destinations && Array.isArray(portalData.destinations)) {
            portalData.destinations.forEach(portal => {
                addDestinationToList(destinationsList, portal.portal_id, portal.portal_id, featureTag, portal.connected, portalEntry);
            });
        }
        
        const destinationsControls = document.createElement('div');
        destinationsControls.className = 'portal-field-controls';
        
        const addDestinationButton = document.createElement('button');
        addDestinationButton.className = 'world-index-portal-button';
        addDestinationButton.textContent = '+ Destination';
        addDestinationButton.addEventListener('click', () => {
            // Store reference to the destinations list for updating
            portalEntry.destinationsList = destinationsList;
            portalEntry.featureTag = featureTag;
            portalEntry.portalType = portalType;
            openPortalSelectionForConnection(portalEntry, 'incoming');
        });
        
        destinationsControls.appendChild(addDestinationButton);
        
        const destinationsContainer = document.createElement('div');
        destinationsContainer.className = 'portal-field-container';
        destinationsContainer.appendChild(destinationsLabel);
        destinationsContainer.appendChild(destinationsList);
        destinationsContainer.appendChild(destinationsControls);
        
        portalEntry.appendChild(portalIdContainer);
        portalEntry.appendChild(descriptionContainer);
        portalEntry.appendChild(destinationsContainer);
        
        attachFeatureSpanEventListeners(descriptionDiv);
    } else {
        // Connected Portals section for incoming portals (list of portals)
        const connectedPortalsLabel = document.createElement('label');
        connectedPortalsLabel.textContent = 'Connected Portals:';
        connectedPortalsLabel.className = 'portal-field-label';
        
        const connectedPortalsList = document.createElement('div');
        connectedPortalsList.className = 'portal-connected-portals-list';
        
        // Load existing connected portals
        if (portalData?.connected_portals && Array.isArray(portalData.connected_portals)) {
            portalData.connected_portals.forEach(portal => {
                addConnectedPortalToList(connectedPortalsList, portal.portal_id, portal.portal_id, featureTag, portal.connected, portalEntry);
            });
        }
        
        const connectedPortalsControls = document.createElement('div');
        connectedPortalsControls.className = 'portal-field-controls';
        
        const addPortalButton = document.createElement('button');
        addPortalButton.className = 'world-index-portal-button';
        addPortalButton.textContent = '+ Portal';
        addPortalButton.addEventListener('click', () => {
            // Store reference to the connected portals list for updating
            portalEntry.connectedPortalsList = connectedPortalsList;
            portalEntry.featureTag = featureTag;
            portalEntry.portalType = portalType;
            openPortalSelectionForConnection(portalEntry, 'outgoing');
        });
        
        connectedPortalsControls.appendChild(addPortalButton);
        
        const connectedPortalsContainer = document.createElement('div');
        connectedPortalsContainer.className = 'portal-field-container';
        connectedPortalsContainer.appendChild(connectedPortalsLabel);
        connectedPortalsContainer.appendChild(connectedPortalsList);
        connectedPortalsContainer.appendChild(connectedPortalsControls);
        
        portalEntry.appendChild(portalIdContainer);
        portalEntry.appendChild(descriptionContainer);
        portalEntry.appendChild(connectedPortalsContainer);
        
        attachFeatureSpanEventListeners(descriptionDiv);
    }
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-portal-button';
    deleteButton.textContent = '✕ Delete Portal';
    deleteButton.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete portal ${portalId}?`)) {
            try {
                const deleteEndpoint = portalType === 'object' ? 'delete-object-portal' : 'delete-location-portal';
                const tagKey = portalType === 'object' ? 'object_tag' : 'location_tag';
                
                const response = await fetch(`${baseUrl}/${deleteEndpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        world: world,
                        id: portalId,
                        [tagKey]: featureTag,
                        portal_direction: type
                    })
                });
                
                if (response.ok) {
                    portalEntry.remove();
                    console.log(`Portal ${portalId} deleted successfully`);
                } else {
                    throw new Error('Failed to delete portal');
                }
            } catch (error) {
                console.error('Error deleting portal:', error);
                alert('Failed to delete portal. Please try again.');
            }
        }
    });
    
    portalEntry.appendChild(deleteButton);
    container.appendChild(portalEntry);
}

function addWorldToList(worldsList, worldId, worldName, featureTag, portalEntry = null) {
    const worldItem = document.createElement('div');
    worldItem.className = 'portal-world-item';
    worldItem.setAttribute('data-world-id', worldId);
    worldItem.setAttribute('data-world-name', worldName);
    
    const worldNameSpan = document.createElement('span');
    worldNameSpan.className = 'world-item-name';
    worldNameSpan.textContent = worldName || worldId;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'remove-world-button';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
        worldItem.remove();
        // Save individually if we have the portal entry reference
        if (portalEntry) {
            saveIncomingPortal(portalEntry, featureTag, portalEntry.portalType);
        }
    });
    
    worldItem.appendChild(worldNameSpan);
    worldItem.appendChild(deleteBtn);
    worldsList.appendChild(worldItem);
}

function addConnectedPortalToList(connectedPortalsList, portalId, portalName, featureTag, connected = false, portalEntry = null) {
    const portalItem = document.createElement('div');
    portalItem.className = 'portal-destination-item';
    portalItem.setAttribute('data-portal-id', portalId);
    portalItem.setAttribute('data-portal-name', portalName);
    portalItem.setAttribute('data-connected', connected);
    
    const portalNameSpan = document.createElement('span');
    portalNameSpan.className = 'portal-item-name';
    portalNameSpan.textContent = portalName || portalId;
    
    // Add connection status indicator with badge
    const statusContainer = document.createElement('span');
    statusContainer.className = 'portal-connection-status';
    
    const badge = document.createElement('span');
    badge.className = `connection-badge ${connected ? 'connected' : 'unconnected'}`;
    badge.textContent = connected ? '✓ Connected' : '○ Pending';
    statusContainer.appendChild(badge);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'remove-destination-button';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
        portalItem.remove();
        // Save individually if we have the portal entry reference
        if (portalEntry) {
            saveIncomingPortal(portalEntry, featureTag, portalEntry.portalType);
        }
    });
    
    portalItem.appendChild(portalNameSpan);
    portalItem.appendChild(statusContainer);
    portalItem.appendChild(deleteBtn);
    connectedPortalsList.appendChild(portalItem);
}

function addDestinationToList(destinationsList, portalId, portalName, featureTag, connected = false, portalEntry = null) {
    const portalItem = document.createElement('div');
    portalItem.className = 'portal-destination-item';
    portalItem.setAttribute('data-portal-id', portalId);
    portalItem.setAttribute('data-portal-name', portalName);
    portalItem.setAttribute('data-connected', connected);
    
    const portalNameSpan = document.createElement('span');
    portalNameSpan.className = 'portal-item-name';
    portalNameSpan.textContent = portalName || portalId;
    
    // Add connection status indicator with badge
    const statusContainer = document.createElement('span');
    statusContainer.className = 'portal-connection-status';
    
    const badge = document.createElement('span');
    badge.className = `connection-badge ${connected ? 'connected' : 'unconnected'}`;
    badge.textContent = connected ? '✓ Connected' : '○ Pending';
    statusContainer.appendChild(badge);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'remove-destination-button';
    deleteBtn.textContent = '✕';
    deleteBtn.addEventListener('click', () => {
        portalItem.remove();
        // Save individually if we have the portal entry reference
        if (portalEntry) {
            saveOutgoingPortal(portalEntry, featureTag, portalEntry.portalType);
        }
    });
    
    portalItem.appendChild(portalNameSpan);
    portalItem.appendChild(statusContainer);
    portalItem.appendChild(deleteBtn);
    destinationsList.appendChild(portalItem);
}

async function saveOutgoingPortal(portalEntry, featureTag, portalType = 'location') {
    // Extract portal data from the portal entry element
    const portalIdDisplay = portalEntry.querySelector('.portal-id-display');
    const portalId = portalIdDisplay?.getAttribute('data-portal-id');
    
    if (!portalId) {
        console.error('No portal ID found');
        return;
    }
    
    const descriptionDiv = portalEntry.querySelector('.portal-description-field');
    const destinationsList = portalEntry.querySelector('.portal-destinations-list');
    
    const description = descriptionDiv ? convertEditFieldHTMLToPlainText(descriptionDiv) : '';
    const descriptionTrimmed = (description || '').trim();

    // Outgoing portals require a non-empty description
    if (!descriptionTrimmed) {
        alert("Outgoing portals require a description.");
        if (descriptionDiv) {
            descriptionDiv.focus();
        }
        return;
    }
    
    // Collect destination portal IDs
    const destinations = [];
    if (destinationsList) {
        const destinationItems = destinationsList.querySelectorAll('.portal-destination-item');
        destinationItems.forEach(item => {
            destinations.push(item.getAttribute('data-portal-id'));
        });
    }
    
    // Determine endpoint and parameter based on portal type
    const endpoint = portalType === 'object' ? 'save-outgoing-object-portal' : 'save-outgoing-location-portal';
    const tagKey = portalType === 'object' ? 'object_tag' : 'location_tag';
    
    const url = `${baseUrl}/${endpoint}`;
    const data = {
        world: world,
        id: portalId,
        description: descriptionTrimmed,
        destinations: destinations,
        [tagKey]: featureTag
    };
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error("Failed to save outgoing portal.");
        }
        console.log(`Outgoing portal ${portalId} saved successfully!`);
        
        // Update connection status indicators if they exist
        const result = await response.json();
        if (result.connections) {
            updateConnectionIndicators(portalEntry, result.connections);
        }
    } catch (error) {
        console.error(error);
        alert("Error saving outgoing portal.");
    }
}

function updateConnectionIndicators(portalEntry, connections) {
    // Update the connection status badges for each destination
    const destinationsList = portalEntry.querySelector('.portal-destinations-list');
    if (destinationsList) {
        const destinationItems = destinationsList.querySelectorAll('.portal-destination-item');
        destinationItems.forEach(item => {
            const destPortalId = item.getAttribute('data-portal-id');
            if (connections[destPortalId] !== undefined) {
                const badge = item.querySelector('.connection-badge');
                if (badge) {
                    const isConnected = connections[destPortalId];
                    badge.classList.toggle('connected', isConnected);
                    badge.classList.toggle('unconnected', !isConnected);
                    badge.textContent = isConnected ? '✓ Connected' : '○ Pending';
                    item.setAttribute('data-connected', isConnected);
                }
            }
        });
    }
}

async function saveIncomingPortal(portalEntry, featureTag, portalType = 'location') {
    // Extract portal data from the portal entry element
    const portalIdDisplay = portalEntry.querySelector('.portal-id-display');
    const portalId = portalIdDisplay?.getAttribute('data-portal-id');
    
    if (!portalId) {
        console.error('No portal ID found');
        return;
    }
    
    const descriptionDiv = portalEntry.querySelector('.portal-description-field');
    const connectedPortalsList = portalEntry.querySelector('.portal-connected-portals-list');
    
    const description = descriptionDiv ? convertEditFieldHTMLToPlainText(descriptionDiv) : '';

    // Get holding feature tag from the portal entry (stored when portal was created)
    const holding_feature_tag = portalEntry.holdingFeatureTag || null;
    
    // Collect connected portal IDs
    const connected_portals = [];
    if (connectedPortalsList) {
        const portalItems = connectedPortalsList.querySelectorAll('.portal-destination-item');
        portalItems.forEach(item => {
            connected_portals.push(item.getAttribute('data-portal-id'));
        });
    }
    
    // Determine endpoint and parameter based on portal type
    const endpoint = portalType === 'object' ? 'save-incoming-object-portal' : 'save-incoming-location-portal';
    const tagKey = portalType === 'object' ? 'object_tag' : 'location_tag';
    
    const url = `${baseUrl}/${endpoint}`;
    const data = {
        world: world,
        id: portalId,
        description: description,
        whitelisted_portals: connected_portals,
        [tagKey]: featureTag
    };

    if (portalType === 'object') {
        data.holding_feature_tag = holding_feature_tag;
    }
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error("Failed to save incoming portal.");
        }
        console.log(`Incoming portal ${portalId} saved successfully!`);
        
        // Update connection status indicators if they exist
        const result = await response.json();
        if (result.connections) {
            updateIncomingConnectionIndicators(portalEntry, result.connections);
        }
    } catch (error) {
        console.error(error);
        alert("Error saving incoming portal.");
    }
}

function updateIncomingConnectionIndicators(portalEntry, connections) {
    // Update the connection status badges for each connected portal
    const connectedPortalsList = portalEntry.querySelector('.portal-connected-portals-list');
    if (connectedPortalsList) {
        const portalItems = connectedPortalsList.querySelectorAll('.portal-destination-item');
        portalItems.forEach(item => {
            const connectedPortalId = item.getAttribute('data-portal-id');
            if (connections[connectedPortalId] !== undefined) {
                const badge = item.querySelector('.connection-badge');
                if (badge) {
                    const isConnected = connections[connectedPortalId];
                    badge.classList.toggle('connected', isConnected);
                    badge.classList.toggle('unconnected', !isConnected);
                    badge.textContent = isConnected ? '✓ Connected' : '○ Pending';
                    item.setAttribute('data-connected', isConnected);
                }
            }
        });
    }
}