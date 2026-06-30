import { processMessageText } from './adventure.js';

const STREAM_RENDER_INTERVAL = 25;

let originalMessageStreamElement = null;
let streamRenderQueue = [];
let streamRenderTimer = null;
let visibleStreamBuffer = "";

export function processAdventureStream(chunk, context) {
    const {
        responseStreamElement,
        processStreamElement,
        streamTimeout,
        setStreamTimeout,
        setStreaming,
        hasReceivedFirstStreamMessage,
        markFirstStreamMessageReceived,
        queueAnnouncement,
    } = context;

    // Stop and clear "processing..." animation on first stream message
    if (!hasReceivedFirstStreamMessage()) {
        markFirstStreamMessageReceived();
        responseStreamElement.innerHTML = "";
        originalMessageStreamElement = document.createElement('p');
        resetStreamRenderState();
    }

    if (chunk === "END_OF_STREAM") {
        setStreaming(false);

        console.log("received: end of stream")

        // Force a reflow to ensure the DOM is updated
        void responseStreamElement.offsetHeight;
        // Force a repaint
        requestAnimationFrame(() => { });

        queueAnnouncement(processStreamElement.textContent);

        if (processStreamElement.textContent == "") {
            console.log('empty response');
            responseStreamElement.closest('.button-container')?.remove();
        }
        console.log("processing final text");
        scheduleStreamRender(context);
        return;
    }

    processStreamElement.textContent += chunk;
    enqueueStreamChunk(chunk, context);

    setStreamTimeout(setTimeout(() => {
        console.log("Stream timeout reached. Stopping read.");
        setStreaming(false); // Reset the streaming flag
        queueAnnouncement(processStreamElement.textContent);
        //streamContainer = false;
        console.log("processing final text");
        console.log("originalMessageStreamElement.textContent: ", originalMessageStreamElement.textContent);
        finishStreamRendering(context);
    }, streamTimeout));
}

function resetStreamRenderState() {
    if (streamRenderTimer) {
        clearTimeout(streamRenderTimer);
    }

    streamRenderQueue = [];
    streamRenderTimer = null;
    visibleStreamBuffer = "";
    originalMessageStreamElement.textContent = "";
}

function enqueueStreamChunk(chunk, context) {
    const tokens = chunk.match(/\s+|\S+\s*/g) || [];
    streamRenderQueue.push(...tokens);
    scheduleStreamRender(context);
}

function scheduleStreamRender(context) {
    if (streamRenderTimer || streamRenderQueue.length === 0) {
        return;
    }

    streamRenderTimer = setTimeout(() => renderNextStreamToken(context), STREAM_RENDER_INTERVAL);
}

function renderNextStreamToken(context) {
    streamRenderTimer = null;

    const nextToken = streamRenderQueue.shift();
    if (!nextToken) {
        return;
    }

    visibleStreamBuffer += nextToken;
    originalMessageStreamElement.textContent = visibleStreamBuffer;
    renderStreamBuffer(context);
    scrollStreamToBottomIfVisible(context);
    scheduleStreamRender(context);
}

function finishStreamRendering(context) {
    if (streamRenderTimer) {
        clearTimeout(streamRenderTimer);
        streamRenderTimer = null;
    }

    streamRenderQueue = [];
    visibleStreamBuffer = context.processStreamElement.textContent;
    originalMessageStreamElement.textContent = visibleStreamBuffer;
    renderStreamBuffer(context);
    scrollStreamToBottomIfVisible(context);
}

function renderStreamBuffer(context) {
    if (!context.responseStreamElement || !originalMessageStreamElement) {
        return;
    }

    const processedMessage = processMessageText(originalMessageStreamElement.textContent);
    context.responseStreamElement.innerHTML = hideUnprocessedStreamMarkers(processedMessage);
}

function hideUnprocessedStreamMarkers(message) {
    return message
        .replace(/\[([^\]]*)\]/g, '$1')
        .replace(/\[([^\]]*)$/g, '$1')
        .replace(/\]/g, '')
        .replace(/\s*@@[^@]*@@/g, '')
        .replace(/\s*@{1,2}[^@]*$/g, '');
}

function scrollStreamToBottomIfVisible(context) {
    const { responseStreamElement, messageScrollContainer, isScrollingMessages } = context;

    if (!responseStreamElement) {
        return;
    }

    const rect = responseStreamElement.getBoundingClientRect();
    const containerRect = messageScrollContainer.getBoundingClientRect();

    // If the top of the text element is visible (not above the container), scroll to bottom
    if (rect.top >= containerRect.top && !isScrollingMessages()) {
        messageScrollContainer.scrollTo({ top: messageScrollContainer.scrollHeight, behavior: 'smooth' });
    }
}
