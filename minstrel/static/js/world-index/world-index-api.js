import { baseUrl } from '../app.js';
import { world } from '../app.js';
import { characterId } from '../adventure/adventure.js';

export async function getDocumentList() {
    const url = `${baseUrl}/get-document-list/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching document list.');
        }

        const data = await response.json();
        console.log(data);
        return data;

    } catch (error) {
        console.error('Error fetching document list.', error);
        return [];
    }
}

export async function getContainerList() {
    const url = `${baseUrl}/get-container-list/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching container list.');
        }

        const data = await response.json();
        console.log(data);
        return data;

    } catch (error) {
        console.error('Error fetching container list.', error);
        return [];
    }
}

export async function getObjectList() {
    const url = `${baseUrl}/get-object-list/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching object list.');
        }

        const data = await response.json();
        console.log(data);
        return data;

    } catch (error) {
        console.error('Error fetching object list.', error);
        return [];
    }
}

export async function getNewContainer() {
    const url = `${baseUrl}/get-new-container/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching new container id.');
        }

        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching new container id.', error);
    }
}

export async function getLocationPage(locationTag) {
    const url = `${baseUrl}/location-index/?world_id=${encodeURIComponent(world)}&loc_id=${encodeURIComponent(locationTag)}&character_id=${encodeURIComponent(characterId)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching location index page.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching location index page.', error);
    }
}

export async function getCharacterPage(characterTag) {
    const url = `${baseUrl}/character-index/?world_id=${encodeURIComponent(world)}&char_id=${encodeURIComponent(characterTag)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching character index page.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching character index page.', error);
    }
}

export async function getDocumentPage(documentTag) {
    const url = `${baseUrl}/document-index/?world_id=${encodeURIComponent(world)}&doc_id=${encodeURIComponent(documentTag)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching document index page.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching document index page.', error);
    }
}

export async function getObjectPage(objectTag) {
    const url = `${baseUrl}/object-index/?world_id=${encodeURIComponent(world)}&object_id=${encodeURIComponent(objectTag)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching object index page.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching object index page.', error);
    }
}

export async function getMainPage() {
    const url = `${baseUrl}/main-index/?world_id=${encodeURIComponent(world)}&character_id=${encodeURIComponent(characterId)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching main world index page.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching main world index page.', error);
    }
}

export async function getWorldPage() {
    const url = `${baseUrl}/world-index/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching world index world page.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching world index world page.', error);
    }
}

export async function getNewCharacter() {
    const url = `${baseUrl}/get-new-character/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching new character id.');
        }

        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching new character id.', error);
    }
}

export async function getNewLocation() {
    const url = `${baseUrl}/get-new-location/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching new location id.');
        }

        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching new location id.', error);
    }
}

export async function getNewDocument() {
    const url = `${baseUrl}/get-new-document/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching new document id.');
        }

        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching new document id.', error);
    }
}

export async function getNewObject() {
    const url = `${baseUrl}/get-new-object/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching new object id.');
        }

        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching new object id.', error);
    }
}

export async function getNewPortal(incomingOrOutgoing, locationTag, portalType = 'location', objectId = null) {
    const url = `${baseUrl}/create-new-portal`;

    try {
        const requestBody = {
            world_id: world,
            portal_direction: incomingOrOutgoing,
            location_tag: portalType === 'object' ? null : locationTag,
            portal_type: portalType
        };
        
        if (objectId) {
            requestBody.object_id = objectId;
        }
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Network response was not ok creating new portal.');
        }

        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error creating new portal.', error);
    }
}

export async function getLocationList() {
    const url = `${baseUrl}/get-location-list/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching location list.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching location list.', error);
        return [];
    }
}

export async function getCharacterList() {
    const url = `${baseUrl}/get-character-list/?world_id=${encodeURIComponent(world)}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching character list.');
        }

        const data = await response.json();
        console.log(data);

        return data;

    } catch (error) {
        console.error('Error fetching character list.', error);
        return [];
    }
}

export async function saveDocumentText(tagOrId, documentText) {
    const url = `${baseUrl}/save-document-text`;
    try {
        if (typeof tagOrId !== 'string' || typeof documentText !== 'string') {
            throw new TypeError('Document tag and text must be strings.');
        }

        const data = {
            world: world,
            tag: tagOrId,
            document_text: documentText
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error("Failed to save document text.");
        }
        console.log("Document text saved successfully!");
    } catch (error) {
        console.error(error);
        alert("Error saving document text.");
    }
}

export async function saveNewCharacter(id, name, summary, instruction, location) {
    try {
        await saveName(id, name);
        await saveSummary(id, summary);
        await saveInstruction(id, instruction);
        await saveLocation(id, location);
        console.log('New character saved successfully!');
        // Optionally, you can navigate away or show a success message here
    } catch (error) {
        console.error('Error saving new character:', error);
        alert('Error saving new character.');
    }
}

export async function saveNewLocation(id, name, summary, instruction, location) {
    try {
        await saveName(id, name);
        await saveSummary(id, summary);
        await saveInstruction(id, instruction);
        await saveParentLocation(id, location);
        console.log('New location saved successfully!');
        // Optionally, you can navigate away or show a success message here
    } catch (error) {
        console.error('Error saving new location:', error);
        alert('Error saving new location.');
    }
}

export async function saveSummary(tagOrId, summary) {
    const url = `${baseUrl}/save-summary`;
    let data = {
        world: world,
        tag: tagOrId,
        summary: summary
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
            throw new Error("Failed to save summary.");
        }

        console.log("Summary saved successfully!");
    } catch (error) {
        console.error(error);
        alert("Error saving summary.");
    }
}

export async function saveInstruction(tagOrId, instruction) {
const url = `${baseUrl}/save-instruction`;
let data = {
    world: world,
    tag: tagOrId,
    instruction: instruction
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
        throw new Error("Failed to save instruction.");
    }

    console.log("Instruction saved successfully!");
} catch (error) {
    console.error(error);
    alert("Error saving instruction.");
}
}

export async function saveWorldSetting(worldId, worldSetting) {
const url = `${baseUrl}/save-world-setting`;
let data = {
    world: worldId,
    world_setting: worldSetting
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
        throw new Error("Failed to save world setting.");
    }
    console.log("World setting saved successfully!");
} catch (error) {
    console.error(error);
    alert("Error saving world setting.");
}
}

export async function saveName(tagOrId, name) {
const url = `${baseUrl}/save-name`;
let data = {
    world: world,
    tag: tagOrId,
    name: name,
    character_id: characterId
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
        throw new Error("Failed to save name.");
    }
    console.log("Name saved successfully!");
} catch (error) {
    console.error(error);
    alert("Error saving name.");
}
}

export async function saveLocation(id, location) {
const url = `${baseUrl}/save-location`;
let data = {
    world: world,
    id: id,
    location: location
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
        throw new Error("Failed to save location.");
    }
    console.log("Location saved successfully!");
} catch (error) {
    console.error(error);
    alert("Error saving location.");
}
}

export async function saveParentLocation(tagOrId, parentLocation) {
const url = `${baseUrl}/save-parent-location`;
let data = {
    world: world,
    tag: tagOrId,
    parent_location: parentLocation
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
        throw new Error("Failed to save parent location.");
    }
    console.log("Parent location saved successfully!");
} catch (error) {
    console.error(error);
    alert("Error saving parent location.");
}
}

export async function saveObjectLocation(tagOrId, objectLocation) {
    const url = `${baseUrl}/save-object-location`;
    let data = {
        world: world,
        tag: tagOrId,
        location_held: objectLocation
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
            throw new Error("Failed to save location held.");
        }
        console.log("Location held saved successfully!");
    } catch (error) {
        console.error(error);
        alert("Error saving location held.");
    }
}

export async function saveNewDocument(id, name, summary, instruction, locationHeld, documentText) {
    try {
        await saveName(id, name);
        await saveSummary(id, summary);
        await saveInstruction(id, instruction);
        await saveObjectLocation(id, locationHeld);
        await saveDocumentText(id, documentText);
        console.log('New document saved successfully!');
        // Optionally, you can navigate away or show a success message here
    } catch (error) {
        console.error('Error saving new document:', error);
        alert('Error saving new document.');
    }
}

export async function saveNewContainer(id, name, summary, instruction, location) {
    try {
        await saveName(id, name);
        await saveSummary(id, summary);
        await saveInstruction(id, instruction);
        await saveLocation(id, location);
        console.log('New container saved successfully!');
    } catch (error) {
        console.error('Error saving new container:', error);
        alert('Error saving new container.');
    }
}

export async function saveNewObject(id, name, summary, instruction, locationHeld) {
    try {
        await saveName(id, name);
        await saveSummary(id, summary);
        await saveInstruction(id, instruction);
        await saveObjectLocation(id, locationHeld);
        console.log('New object saved successfully!');
    } catch (error) {
        console.error('Error saving new object:', error);
        alert('Error saving new object.');
    }
}

export async function deleteFeature(featureId) {
    const url = `${baseUrl}/delete-feature`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                world: world,
                tag: featureId
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok deleting feature.');
        }

        const data = await response.json();
        console.log('Feature deleted successfully:', data);
        
        return data;

    } catch (error) {
        console.error('Error deleting feature:', error);
        alert('Error deleting feature. Please try again.');
        throw error;
    }
}