import { baseUrl, world } from '../app.js';
import { parseIntervalToMinutes, getResponseErrorMessage } from './adventure-utility.js';

const simTrigger = ['Always', 'Playing', 'Not playing', 'Nearby', 'Not in party', 'Not Nearby'];
let currentTypeIndex = 0;

function getCharacterMenu() {
    return document.querySelector('.character-settings-menu');
}

export async function fetchCharacterSimulationStatus(characterId) {
    try {
        const response = await fetch(`${baseUrl}/character-simulation-status?world_id=${world}&char_id=${characterId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch character simulation status');
        }
        const data = await response.json();
        updateSimulationControls(data);
    } catch (error) {
        console.error("Error fetching character simulation status:", error);
    }
}

export function updateSimulationControls(simulationData) {
    const simulationToggle = document.getElementById('simulation-toggle');
    const simTypeElement = document.getElementById('simulation-type');
    const frequencyElement = document.getElementById('simulation-frequency');

    if (simulationData) {
        if (!simulationToggle.classList.contains('active')) {
            simulationToggle.classList.add('active');
        }
        simulationToggle.setAttribute('aria-checked', 'true');

        const simType = simulationData.sim_type || 'Always';
        simTypeElement.textContent = simType;
        currentTypeIndex = simTrigger.indexOf(simType);
        if (currentTypeIndex === -1) currentTypeIndex = 0;

        const interval = simulationData.interval || '5 min';
        frequencyElement.value = interval;
    } else {
        if (simulationToggle.classList.contains('active')) {
            simulationToggle.classList.remove('active');
        }
        simulationToggle.setAttribute('aria-checked', 'false');

        simTypeElement.textContent = 'Always';
        currentTypeIndex = 0;
        frequencyElement.value = '5 min';
    }
}

export function openSimulationAccordion(event) {
    const button = event.currentTarget;
    const content = document.getElementById('simulation-content');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', !expanded);
    content.hidden = expanded;
    document.getElementById('simulation-toggle').focus();
}

export function closeSimulationAccordion() {
    const button = document.getElementById('simulation-button');
    const content = document.getElementById('simulation-content');

    button.setAttribute('aria-expanded', 'false');
    content.hidden = true;
}

export async function toggleSimulationSlider(el) {
    const isChecked = el.classList.toggle('active');
    el.setAttribute('aria-checked', isChecked);

    const characterId = getCharacterMenu().getAttribute('data-character-id');
    if (!characterId) {
        console.error("Could not find character ID for simulation toggle.");
        el.classList.toggle('active');
        el.setAttribute('aria-checked', !isChecked);
        return;
    }

    if (isChecked) {
        const simType = document.getElementById('simulation-type').textContent.trim();
        const intervalElement = document.getElementById('simulation-frequency');
        const intervalValue = intervalElement.value;
        const interval = parseIntervalToMinutes(intervalValue);

        if (interval === undefined) {
            console.error("Interval could not be parsed from: ", intervalValue);
            el.classList.remove('active');
            el.setAttribute('aria-checked', false);
            return;
        }

        const visibility = true;

        try {
            const response = await fetch(`${baseUrl}/set-character-simulation-on`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    world: world,
                    character_id: characterId,
                    type: simType,
                    interval: interval,
                    visibility: visibility
                })
            });
            if (!response.ok) {
                const errorMessage = await getResponseErrorMessage(response);
                throw new Error(errorMessage || 'Failed to turn on character simulation.');
            }
            console.log('Character simulation turned on.');
        } catch (error) {
            console.error(error);
            alert(`Error: ${error.message}`);
            el.classList.remove('active');
            el.setAttribute('aria-checked', false);
        }
    } else {
        try {
            const response = await fetch(`${baseUrl}/set-character-simulation-off`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    world: world,
                    character_id: characterId
                })
            });
            if (!response.ok) {
                const errorMessage = await getResponseErrorMessage(response);
                throw new Error(errorMessage || 'Failed to turn off character simulation.');
            }
            console.log('Character simulation turned off.');
        } catch (error) {
            console.error(error);
            alert(`Error: ${error.message}`);
            el.classList.add('active');
            el.setAttribute('aria-checked', true);
        }
    }
}

export function handleToggleSimulationKey(e, el) {
    if (e.key === "Enter" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggleSimulationSlider(el);
    }
}

export async function persistSimulationSettings() {
    const toggleEl = document.getElementById('simulation-toggle');
    if (!toggleEl || !toggleEl.classList.contains('active')) return;

    const characterId = getCharacterMenu().getAttribute('data-character-id');
    if (!characterId) {
        console.error('No character ID available to persist simulation settings.');
        return;
    }

    const simType = document.getElementById('simulation-type').textContent.trim();
    const intervalElement = document.getElementById('simulation-frequency');
    const intervalValue = intervalElement.value;
    const interval = parseIntervalToMinutes(intervalValue);
    if (interval === undefined) {
        console.error('Could not parse interval from value:', intervalValue);
        return;
    }

    const visibility = true;

    try {
        const response = await fetch(`${baseUrl}/set-character-simulation-on`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                world: world,
                character_id: characterId,
                type: simType,
                interval: interval,
                visibility: visibility
            })
        });
        if (!response.ok) {
            const errorMessage = await getResponseErrorMessage(response);
            throw new Error(errorMessage || 'Failed to persist simulation settings.');
        }
        console.log('Simulation settings updated.');
    } catch (error) {
        console.error('Error updating simulation settings:', error);
        alert(`Error: ${error.message}`);
    }
}

export function onSimulationFrequencyChanged() {
    const toggleEl = document.getElementById('simulation-toggle');
    if (toggleEl && toggleEl.classList.contains('active')) {
        persistSimulationSettings();
    }
}

export function changeSimulationType(direction) {
    currentTypeIndex += direction;
    if (currentTypeIndex < 0) currentTypeIndex = simTrigger.length - 1;
    if (currentTypeIndex >= simTrigger.length) currentTypeIndex = 0;
    const simType = document.getElementById('simulation-type');
    simType.textContent = simTrigger[currentTypeIndex];
    const toggleEl = document.getElementById('simulation-toggle');
    if (toggleEl && toggleEl.classList.contains('active')) {
        persistSimulationSettings();
    }
}
