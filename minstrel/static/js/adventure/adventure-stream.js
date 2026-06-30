import { processMessageText } from './adventure.js';

const STREAM_RENDER_INTERVAL = 180;
const STREAM_LINE_MIN_CHARS = 28;
const STREAM_LINE_MAX_CHARS = 80;
const STREAM_AVERAGE_CHAR_WIDTH = 8.5;
const STREAM_HEIGHT_TRANSITION_MS = 160;
const STREAM_SCROLL_TRANSITION_MS = 650;

let originalMessageStreamElement = null;
let streamRenderQueue = [];
let streamRenderTimer = null;
let visibleStreamBuffer = "";
let lastRenderedStreamHTML = "";
let streamLineTargetLength = null;
let pendingStreamScrollFrame = null;
let activeStreamScrollFrame = null;
let pendingHeightTransitionFrame = null;
let heightTransitionVersion = 0;
let scrollAnimationVersion = 0;

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
        clearStreamHeightStyles(responseStreamElement);
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
    if (pendingStreamScrollFrame) {
        cancelAnimationFrame(pendingStreamScrollFrame);
    }
    if (activeStreamScrollFrame) {
        cancelAnimationFrame(activeStreamScrollFrame);
    }
    if (pendingHeightTransitionFrame) {
        cancelAnimationFrame(pendingHeightTransitionFrame);
    }

    streamRenderQueue = [];
    streamRenderTimer = null;
    pendingStreamScrollFrame = null;
    activeStreamScrollFrame = null;
    pendingHeightTransitionFrame = null;
    heightTransitionVersion++;
    scrollAnimationVersion++;
    visibleStreamBuffer = "";
    lastRenderedStreamHTML = "";
    streamLineTargetLength = null;
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

    streamRenderTimer = setTimeout(() => renderNextStreamLine(context), STREAM_RENDER_INTERVAL);
}

function renderNextStreamLine(context) {
    streamRenderTimer = null;

    const nextLine = dequeueNextStreamLine(context);
    if (!nextLine) {
        return;
    }

    visibleStreamBuffer += nextLine;
    originalMessageStreamElement.textContent = visibleStreamBuffer;
    renderStreamBuffer(context, nextLine);
    scrollStreamToBottomIfVisible(context);
    scheduleStreamRender(context);
}

function dequeueNextStreamLine(context) {
    if (streamRenderQueue.length === 0) {
        return "";
    }

    const targetLength = getStreamLineTargetLength(context);
    let nextLine = "";

    while (streamRenderQueue.length > 0) {
        const token = streamRenderQueue.shift();
        nextLine += token;

        if (token.includes("\n")) {
            break;
        }

        if (nextLine.length >= targetLength && /\s$/.test(nextLine)) {
            break;
        }
    }

    return nextLine;
}

function getStreamLineTargetLength(context) {
    if (streamLineTargetLength !== null) {
        return streamLineTargetLength;
    }

    const width = context.responseStreamElement?.getBoundingClientRect().width || 0;
    const approximateLineLength = Math.floor(width / STREAM_AVERAGE_CHAR_WIDTH);
    streamLineTargetLength = Math.min(
        STREAM_LINE_MAX_CHARS,
        Math.max(STREAM_LINE_MIN_CHARS, approximateLineLength)
    );
    return streamLineTargetLength;
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

function renderStreamBuffer(context, animatedText = "") {
    if (!context.responseStreamElement || !originalMessageStreamElement) {
        return;
    }

    const processedMessage = processMessageText(originalMessageStreamElement.textContent);
    const renderedMessage = hideUnprocessedStreamMarkers(processedMessage);
    if (renderedMessage === lastRenderedStreamHTML) {
        return;
    }

    replaceStreamHTMLWithHeightTransition(
        context.responseStreamElement,
        addStreamLineAnimation(renderedMessage, animatedText)
    );
    lastRenderedStreamHTML = renderedMessage;
}

function replaceStreamHTMLWithHeightTransition(element, html) {
    const previousHeight = element.offsetHeight;
    const version = ++heightTransitionVersion;

    if (pendingHeightTransitionFrame) {
        cancelAnimationFrame(pendingHeightTransitionFrame);
        pendingHeightTransitionFrame = null;
    }

    element.style.transition = 'none';
    element.style.overflow = 'hidden';
    element.style.height = `${previousHeight}px`;
    element.innerHTML = html;

    const nextHeight = element.scrollHeight;
    if (Math.abs(nextHeight - previousHeight) < 1) {
        clearStreamHeightTransition(element, version);
        return;
    }

    // Commit the fixed start height before transitioning to the new measured height.
    void element.offsetHeight;

    pendingHeightTransitionFrame = requestAnimationFrame(() => {
        if (version !== heightTransitionVersion) {
            return;
        }

        pendingHeightTransitionFrame = null;
        element.style.transition = `height ${STREAM_HEIGHT_TRANSITION_MS}ms ease-out`;
        element.style.height = `${nextHeight}px`;
    });

    element.addEventListener('transitionend', (event) => {
        if (event.target === element && event.propertyName === 'height') {
            clearStreamHeightTransition(element, version);
        }
    }, { once: true });
}

function clearStreamHeightTransition(element, version) {
    if (version !== heightTransitionVersion) {
        return;
    }

    clearStreamHeightStyles(element);
}

function clearStreamHeightStyles(element) {
    element.style.height = '';
    element.style.overflow = '';
    element.style.transition = '';
}

function addStreamLineAnimation(message, animatedText) {
    const animationText = getAnimationText(animatedText);
    if (!animationText.trim()) {
        return message;
    }

    const template = document.createElement('template');
    template.innerHTML = message;

    let remainingLength = animationText.length;
    const textNodes = collectVisibleTextNodes(template.content).reverse();

    for (const textNode of textNodes) {
        if (remainingLength <= 0) {
            break;
        }

        const text = textNode.textContent;
        if (!text) {
            continue;
        }

        const animatedLength = Math.min(text.length, remainingLength);
        const prefix = text.slice(0, -animatedLength);
        const animatedSegment = text.slice(-animatedLength);
        const segmentSpan = document.createElement('span');
        segmentSpan.classList.add('stream-line-fade');
        segmentSpan.textContent = animatedSegment;

        textNode.textContent = prefix;
        textNode.parentNode.insertBefore(segmentSpan, textNode.nextSibling);
        remainingLength -= animatedLength;
    }

    return template.innerHTML;
}

function getAnimationText(text) {
    return hideUnprocessedStreamMarkers(text);
}

function collectVisibleTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let currentNode = walker.nextNode();

    while (currentNode) {
        if (currentNode.textContent.trim()) {
            textNodes.push(currentNode);
        }
        currentNode = walker.nextNode();
    }

    return textNodes;
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
    if (pendingStreamScrollFrame) {
        return;
    }

    pendingStreamScrollFrame = requestAnimationFrame(() => {
        pendingStreamScrollFrame = null;

        const { responseStreamElement, messageScrollContainer, isScrollingMessages } = context;

        if (!responseStreamElement || isScrollingMessages()) {
            return;
        }

        const targetScrollTop = getStreamScrollTarget(responseStreamElement, messageScrollContainer);
        if (targetScrollTop > messageScrollContainer.scrollTop) {
            animateStreamScroll(messageScrollContainer, targetScrollTop);
        }
    });
}

function getStreamScrollTarget(responseStreamElement, messageScrollContainer) {
    const rect = responseStreamElement.getBoundingClientRect();
    const containerRect = messageScrollContainer.getBoundingClientRect();
    const distanceUntilStreamTopPins = Math.max(0, rect.top - containerRect.top);

    if (distanceUntilStreamTopPins === 0) {
        return messageScrollContainer.scrollTop;
    }

    const maxScrollTop = messageScrollContainer.scrollHeight - messageScrollContainer.clientHeight;
    const topPinnedScrollTop = messageScrollContainer.scrollTop + distanceUntilStreamTopPins;
    return Math.min(maxScrollTop, topPinnedScrollTop);
}

function animateStreamScroll(messageScrollContainer, targetScrollTop) {
    const startScrollTop = messageScrollContainer.scrollTop;
    const scrollDistance = targetScrollTop - startScrollTop;
    if (scrollDistance <= 0) {
        return;
    }

    const version = ++scrollAnimationVersion;
    const startTime = performance.now();

    if (activeStreamScrollFrame) {
        cancelAnimationFrame(activeStreamScrollFrame);
    }

    function step(now) {
        if (version !== scrollAnimationVersion) {
            return;
        }

        const progress = Math.min(1, (now - startTime) / STREAM_SCROLL_TRANSITION_MS);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        messageScrollContainer.scrollTop = startScrollTop + scrollDistance * easedProgress;

        if (progress < 1) {
            activeStreamScrollFrame = requestAnimationFrame(step);
        } else {
            activeStreamScrollFrame = null;
        }
    }

    activeStreamScrollFrame = requestAnimationFrame(step);
}
