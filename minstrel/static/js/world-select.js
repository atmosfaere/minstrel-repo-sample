import { baseUrl, navigatePage, setWorld } from './app.js';

const PORTAL_LIST_MODE_KEY = 'portalListMode';

export let userWorlds = null;

export async function getUserWorlds(adventureSelectDiv, openMenu, cleanupPage) {
    const url = `${baseUrl}/user-worlds/`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok fetching user worlds.');
        }

        const data = await response.json();

        adventureSelectDiv.innerHTML = '';
        userWorlds = [];

        if (data.length === 0) {
            /* empty */
        } else {
            data.forEach(worldInfo => {
                userWorlds.push(worldInfo.world_id);
                adventureSelectDiv.appendChild(createWorldEntry(worldInfo, openMenu, cleanupPage));
            });
        }

        if (data.length === 0) {
            const notice = document.createElement('p');
            notice.className = 'no-adventure-notice';
            notice.textContent = "Create a world, let's get started!";
            adventureSelectDiv.appendChild(notice);
        }

        adventureSelectDiv.style.display = 'block';
    } catch (error) {
        console.error('Error fetching user worlds.', error);
    } finally {
        const scrollEl = document.querySelector('.adventure-select-scroll');
        if (scrollEl) {
            scrollEl.style.minHeight = '';
        }
    }
}

export function createWorldEntry(worldInfo, openMenu, cleanupPage) {
    const worldEntryDiv = document.createElement('div');
    worldEntryDiv.className = 'world-entry';
    const worldId = worldInfo.world_id;
    worldEntryDiv.dataset.worldId = worldId;

    const worldName = document.createElement('span');
    worldName.className = 'world-name';
    worldName.setAttribute('aria-label', worldInfo.name);
    worldName.textContent = worldInfo.name;

    const worldDetailsP = document.createElement('p');
    worldDetailsP.textContent = `visitors: ${worldInfo.visitors}, last visited: ${worldInfo['last_visited']}, last active: ${worldInfo['last_active']}, creator: ${worldInfo.creator}`;

    const settingsButton = document.createElement('button');
    settingsButton.className = 'adventure-settings-button';
    settingsButton.setAttribute('aria-label', 'World Settings');
    settingsButton.innerHTML = '<span>☰</span>';
    settingsButton.setAttribute('aria-expanded', 'false');
    settingsButton.setAttribute('aria-controls', 'menu');

    settingsButton.addEventListener('click', function (event) {
        event.stopPropagation();
        openMenu(settingsButton, worldId);
    });

    worldEntryDiv.addEventListener('click', (event) => {
        event.stopPropagation();
        openCreateCharacterForWorld(worldId, cleanupPage);
    });

    worldEntryDiv.setAttribute('role', 'button');
    worldEntryDiv.setAttribute('tabindex', '0');
    worldEntryDiv.setAttribute(
        'aria-label',
        `${worldInfo.name}. visitors: ${worldInfo.visitors}, creator: ${worldInfo.creator}`
    );

    worldEntryDiv.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            openCreateCharacterForWorld(worldId, cleanupPage);
        }
    });

    worldEntryDiv.appendChild(worldName);
    worldEntryDiv.appendChild(worldDetailsP);
    worldEntryDiv.appendChild(settingsButton);

    return worldEntryDiv;
}

export function openCreateCharacterForWorld(worldId, cleanupPage) {
    setWorld(worldId);
    sessionStorage.setItem(PORTAL_LIST_MODE_KEY, 'worlds');
    cleanupPage();
    navigatePage('create-character');
}
