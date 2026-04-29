import { getMainPage } from '../world-index-api.js';
import { navigateBackIndex } from '../../world-index.js';
import { openWorldPage } from './world-page.js';
import { openCharacterPage } from './character-page.js';
import { openLocationPage } from './location-page.js';

// TODO: always recalled characters and locations
export async function openMainIndexPage() {
    const worldIndex = document.querySelector('.world-index');

    const pageData = await getMainPage();
    const worldName = pageData?.world_name || '';
    const recentCharacters = pageData?.recent_characters || [];
    const recentLocations = pageData?.recent_locations || [];
    const topLevelLocations = pageData?.top_level_locations || [];

    worldIndex.innerHTML = "";

    const backArrow = document.createElement('button');
    backArrow.innerHTML = '←';
    backArrow.className = 'back-arrow world-index-back-arrow';
    backArrow.setAttribute('aria-label', 'Close world index');
    backArrow.addEventListener('click', () => navigateBackIndex());
    worldIndex.appendChild(backArrow);

    const worldNameHeading = document.createElement('button');
    worldNameHeading.textContent = worldName || '';
    worldNameHeading.className = 'world-index-title-heading';
    worldNameHeading.id = 'world-index-title';
    worldIndex.appendChild(worldNameHeading);

    // Add event listener to open world page on click
    worldNameHeading.style.cursor = 'pointer';
    worldNameHeading.title = 'Open world page';
    worldNameHeading.addEventListener('click', () => openWorldPage());

    // Add Recent Characters section
    const recentCharactersHeading = document.createElement('h2');
    recentCharactersHeading.textContent = 'Recent Characters:';
    recentCharactersHeading.className = 'index-heading';
    worldIndex.appendChild(recentCharactersHeading);

    const recentCharactersList = document.createElement('div');
    recentCharactersList.className = 'index-list';

    recentCharacters.forEach(character => {
        const charButton = document.createElement('button');
        charButton.textContent = character.name;
        charButton.className = 'index-entry';
        charButton.dataset.characterTag = character.tag;
        charButton.addEventListener('click', () => openCharacterPage(character.tag));
        recentCharactersList.appendChild(charButton);
    });

    worldIndex.appendChild(recentCharactersList);

    // Add Recent Locations section
    const recentLocationsHeading = document.createElement('h2');
    recentLocationsHeading.textContent = 'Recent Locations:';
    recentLocationsHeading.className = 'index-heading';
    worldIndex.appendChild(recentLocationsHeading);

    const recentLocationsList = document.createElement('div');
    recentLocationsList.className = 'index-list';

    recentLocations.forEach(loc => {
        const locButton = document.createElement('button');
        locButton.textContent = loc.name;
        locButton.className = 'index-entry';
        locButton.dataset.locationTag = loc.tag;
        locButton.addEventListener('click', () => openLocationPage(loc.tag));
        recentLocationsList.appendChild(locButton);
    });

    worldIndex.appendChild(recentLocationsList);

    // Add Locations section (top level locations)
    const locationsHeading = document.createElement('h2');
    locationsHeading.textContent = 'Locations:';
    locationsHeading.className = 'index-heading';
    worldIndex.appendChild(locationsHeading);

    const locationsList = document.createElement('div');
    locationsList.className = 'index-list';

    topLevelLocations.forEach(loc => {
        const locButton = document.createElement('button');
        locButton.textContent = loc.name;
        locButton.className = 'index-entry';
        locButton.dataset.locationTag = loc.tag;
        locButton.addEventListener('click', () => openLocationPage(loc.tag));
        locationsList.appendChild(locButton);
    });

    worldIndex.appendChild(locationsList);

    // Update ARIA labeling for main index page - keep dialog role from openWorldIndex
    worldIndex.setAttribute('aria-labelledby', 'world-index-title');
}