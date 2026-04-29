let streamingAriaLiveElement = null;
let secondaryAriaLiveElement = null;
let ariaUpdateBuffer = '';
let ariaUpdateTimeout = null;
let isFirstAnnouncement = true;
let announcementQueue = [];
let isAnnouncing = false;
let currentLiveElement = null;
const ARIA_UPDATE_DELAY = 1500; // Increased delay to allow for reading
const MIN_ANNOUNCEMENT_LENGTH = 15; // Increased minimum for more substantial chunks
const ANNOUNCEMENT_PAUSE = 1880; // Time to wait between announcements

export function createAriaLiveRegion() {
    if (!streamingAriaLiveElement) {
        // Primary live region
        streamingAriaLiveElement = document.createElement('div');
        streamingAriaLiveElement.setAttribute('aria-live', 'polite');
        streamingAriaLiveElement.setAttribute('aria-atomic', 'true');
        streamingAriaLiveElement.className = 'sr-only';
        document.body.appendChild(streamingAriaLiveElement);
        
        // Secondary live region for alternating announcements
        secondaryAriaLiveElement = document.createElement('div');
        secondaryAriaLiveElement.setAttribute('aria-live', 'polite');
        secondaryAriaLiveElement.setAttribute('aria-atomic', 'true');
        secondaryAriaLiveElement.className = 'sr-only';
        document.body.appendChild(secondaryAriaLiveElement);
        
        currentLiveElement = streamingAriaLiveElement;
    }
    return streamingAriaLiveElement;
}

export function queueAnnouncement(text) {
    const prefix = isFirstAnnouncement ? "New message: " : "";
    announcementQueue.push(prefix + text.trim());
    isFirstAnnouncement = false;
    
    if (!isAnnouncing) {
        processAnnouncementQueue();
    }
}

function processAnnouncementQueue() {
    if (announcementQueue.length === 0) {
        isAnnouncing = false;
        return;
    }
    
    isAnnouncing = true;
    const announcement = announcementQueue.shift();
    
    // Clear the other live region first
    const otherElement = currentLiveElement === streamingAriaLiveElement ? 
        secondaryAriaLiveElement : streamingAriaLiveElement;
    otherElement.textContent = '';
    
    // Set announcement on current live region
    currentLiveElement.textContent = announcement;
    
    // Switch to the other live region for next announcement
    currentLiveElement = otherElement;
    
    // Wait before processing next announcement
    setTimeout(() => {
        processAnnouncementQueue();
    }, ANNOUNCEMENT_PAUSE);
}

export function announceStreamingText(text) {
    if (!streamingAriaLiveElement) {
        createAriaLiveRegion();
    }
    
    ariaUpdateBuffer += text;
    
    // Clear existing timeout
    if (ariaUpdateTimeout) {
        clearTimeout(ariaUpdateTimeout);
    }
    
    // Check if we should announce immediately based on various criteria
    const shouldAnnounceNow = 
        ariaUpdateBuffer.trim().length >= MIN_ANNOUNCEMENT_LENGTH || // Enough text accumulated
        /[.!?]\s*$/.test(ariaUpdateBuffer) || // Ends with sentence punctuation
        /[,;:]\s*$/.test(ariaUpdateBuffer); // Ends with clause punctuation
    
    if (shouldAnnounceNow && ariaUpdateBuffer.trim().length > 0) {
        queueAnnouncement(ariaUpdateBuffer.trim());
        ariaUpdateBuffer = '';
        return;
    }
    
    // Set new timeout to announce buffered text after delay
    ariaUpdateTimeout = setTimeout(() => {
        if (ariaUpdateBuffer.trim().length > 0) {
            queueAnnouncement(ariaUpdateBuffer.trim());
            ariaUpdateBuffer = '';
        }
    }, ARIA_UPDATE_DELAY);
}

export function finalizeStreamingAnnouncement() {
    // Clear any pending timeout
    if (ariaUpdateTimeout) {
        clearTimeout(ariaUpdateTimeout);
        ariaUpdateTimeout = null;
    }
    
    // Queue any remaining buffered text immediately
    if (ariaUpdateBuffer.trim()) {
        queueAnnouncement(ariaUpdateBuffer.trim());
        ariaUpdateBuffer = '';
    }
}

export function resetAriaAnnouncements() {
    ariaUpdateBuffer = '';
    isFirstAnnouncement = true;
    announcementQueue = [];
    isAnnouncing = false;
    if (ariaUpdateTimeout) {
        clearTimeout(ariaUpdateTimeout);
        ariaUpdateTimeout = null;
    }
} 