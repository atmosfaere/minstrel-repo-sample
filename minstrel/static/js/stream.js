let responseStreamElement;
let processStreamElement;

let currentTextNode;
let receivingId = false;

let streamingFeatureName = ""
let streamingFeatureId = ""

let streamReceivedOpeningBracket = false;
let streamReceivedClosingBracket = false;
let streamReceivedOpeningAtSymbol = false;
let streamReceivedOpeningAtDelimiter = false;
let streamReceivedClosingAtSymbol = false;
let streamReceivedClosingAtDelimiter = false;

function streamResponse(chunk) {
    clearTimeout(timeout); // Clear the previous timeout
    chunk = sanitizeHTML(chunk);

    let closingBracketInChunk = false;

    // Stop "processing..." animation on first stream message
    if (!hasReceivedFirstStreamMessage) {
        hasReceivedFirstStreamMessage = true;
        // Clear "processing..."
        responseStreamElement.innerHTML = "";
        currentTextNode.textContent = "";
    }

    if (chunk.includes('[')) {
        streamReceivedOpeningBracket = true;
        
        /*
        // Add only text before the bracket to currentTextNode
        const bracketIndex = chunk.indexOf('[');
        const textBeforeBracket = chunk.substring(0, bracketIndex);
        if (textBeforeBracket) {
            currentTextNode.textContent += textBeforeBracket;
            textAdded = true;
        }*/
        chunk = chunk.replace(/[\[\]]/g, '');
    }
    
    // Only check for closing bracket if opening bracket was found
    if (streamReceivedOpeningBracket && chunk.includes(']')) {
        streamReceivedOpeningBracket = false;
        streamReceivedClosingBracket = true;
        closingBracketInChunk = true;
        
        // Extract the feature name from between brackets
        const content = processStreamElement.innerHTML || processStreamElement.textContent || '';
        const bracketMatch = content.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
            streamingFeatureName = bracketMatch[1];
        }
        
        /*
        // Add text after the closing bracket to currentTextNode
        const closingBracketIndex = chunk.indexOf(']');
        const textAfterClosingBracket = chunk.substring(closingBracketIndex + 1);
        if (textAfterClosingBracket) {
            currentTextNode.textContent += textAfterClosingBracket;
            
        }
        
        textAdded = true;*/
        chunk = chunk.replace(/[\[\]]/g, '');
    }

    if (!closingBracketInChunk && streamReceivedClosingBracket && (!chunk === " " || !chunk.includes('@') || (!chunk.includes('[') && !chunk.includes('@')))) {
        // Not an id, replace original text
        currentTextNode.textContent = responseStreamElement.textContent;
        currentTextNode.textContent += chunk;
        processStreamElement.innerHTML += chunk;
        return;
    }

    if (streamReceivedClosingBracket && chunk.includes('@')) {
        streamReceivedClosingBracket = false;
        streamReceivedOpeningAtSymbol = true;
        if (chunk.includes('@@')) {
            streamReceivedOpeningAtSymbol = false;
            streamReceivedOpeningAtDelimiter = true;
            receivingId = true;
        }
        
        
    }
    
    // Check for @@ pattern (opening at symbol + delimiter)
    if (streamReceivedOpeningAtSymbol) {
        if (chunk.includes('@')) {
            streamReceivedOpeningAtSymbol = false;
            streamReceivedOpeningAtDelimiter = true;
            receivingId = true;
        }
    }

    if (receivingId) {
        streamingFeatureId += chunk;
    }

    if (streamReceivedOpeningAtDelimiter && chunk.includes('@')) {
        streamReceivedOpeningAtDelimiter = false;
        streamReceivedClosingAtSymbol = true;

        if (chunk.includes('@@')) {
            streamReceivedClosingAtSymbol = false;
            streamReceivedClosingAtDelimiter = true;
        }
    }

    if (streamReceivedClosingAtSymbol && chunk.includes('@')) {
        streamReceivedClosingAtSymbol = false;
        streamReceivedOpeningAtDelimiter = true;
    }

    if (streamReceivedClosingAtDelimiter) {
        const content = processStreamElement.innerHTML || processStreamElement.textContent || '';
        const idMatch = content.match(/@@([^@]+)@@/);
        if (idMatch) {
            const id = idMatch[1];
            currentTextNode.textContent += id;
            processStreamElement.innerHTML += chunk;
            addObjectIdMenuSpan(delimitedId);
            delimitedId = '';

            currentTextNode = document.createTextNode("");
            responseStreamElement.appendChild(currentTextNode);
        }
        else {
            //couldn't extract id, replace original text
            currentTextNode.textContent = processStreamElement.textContent;
            currentTextNode.textContent += chunk;
            processStreamElement.innerHTML += chunk;
        }

        receivingId = false;
        return;
    }

    if (chunk === "END_OF_STREAM") {
        isStreaming = false;

        console.log("received: end of stream")

        // Force a reflow to ensure the DOM is updated
        void responseStreamElement.offsetHeight;
        // Force a repaint
        requestAnimationFrame(() => {});

        queueAnnouncement(processStreamElement.textContent);

        if (responseStreamElement.innerHTML == "") {
            console.log('empty response');
            responseStreamElement.closest('.button-container').remove();
        }
        return
    }

    if (!receivingId) {
        currentTextNode.textContent += chunk;
    }
    processStreamElement.innerHTML += chunk;

    if (currentTextNode && currentTextNode.parentElement) {
        const textElement = currentTextNode.parentElement;
        const rect = textElement.getBoundingClientRect();
        const containerRect = messageScrollContainer.getBoundingClientRect();
        
        // If the top of the text element is visible (not above the container), scroll to bottom
        if (rect.top >= containerRect.top && !scrollingMessages) {
            messageScrollContainer.scrollTo({ top: messageScrollContainer.scrollHeight, behavior: 'smooth' });
        }
    }

    timeout = setTimeout(() => {
        console.log("Stream timeout reached. Stopping read.");
        isStreaming = false; // Reset the streaming flag
        queueAnnouncement(processStreamElement.textContent);
        //streamContainer = false;
    }, STREAM_TIMEOUT);
}

function streamResponse(chunk) {
    clearTimeout(timeout); // Clear the previous timeout
    word = sanitizeHTML(word);

    let closingBracketInChunk = false;

    // Stop "processing..." animation on first stream message
    if (!hasReceivedFirstStreamMessage) {
        hasReceivedFirstStreamMessage = true;
        // Clear "processing..."
        currentTextNode.textContent = "";
    }

    if (chunk.includes('[')) {
        streamReceivedOpeningBracket = true;
        
        /*
        // Add only text before the bracket to currentTextNode
        const bracketIndex = chunk.indexOf('[');
        const textBeforeBracket = chunk.substring(0, bracketIndex);
        if (textBeforeBracket) {
            currentTextNode.textContent += textBeforeBracket;
            textAdded = true;
        }*/
        chunk = chunk.replace(/[\[\]]/g, '');
    }
    
    // Only check for closing bracket if opening bracket was found
    if (streamReceivedOpeningBracket && chunk.includes(']')) {
        streamReceivedOpeningBracket = false;
        streamReceivedClosingBracket = true;
        closingBracketInChunk = true;
        
        // Extract the feature name from between brackets
        const content = processStreamElement.innerHTML || processStreamElement.textContent || '';
        const bracketMatch = content.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
            streamingFeatureName = bracketMatch[1];
        }
        
        /*
        // Add text after the closing bracket to currentTextNode
        const closingBracketIndex = chunk.indexOf(']');
        const textAfterClosingBracket = chunk.substring(closingBracketIndex + 1);
        if (textAfterClosingBracket) {
            currentTextNode.textContent += textAfterClosingBracket;
            
        }
        
        textAdded = true;*/
        chunk = chunk.replace(/[\[\]]/g, '');
    }

    if (!closingBracketInChunk && streamReceivedClosingBracket && (!chunk === " " || !chunk.includes('@') || (!chunk.includes('[') && !chunk.includes('@')))) {
        // Not an id, replace original text
        currentTextNode.textContent = responseStreamElement.textContent;
        currentTextNode.textContent += chunk;
        processStreamElement.innerHTML += chunk;
        return;
    }

    if (streamReceivedClosingBracket && chunk.includes('@')) {
        streamReceivedClosingBracket = false;
        streamReceivedOpeningAtSymbol = true;
        if (chunk.includes('@@')) {
            streamReceivedOpeningAtSymbol = false;
            streamReceivedOpeningAtDelimiter = true;
            receivingId = true;
        }
        
        
    }
    
    // Check for @@ pattern (opening at symbol + delimiter)
    if (streamReceivedOpeningAtSymbol) {
        if (chunk.includes('@')) {
            streamReceivedOpeningAtSymbol = false;
            streamReceivedOpeningAtDelimiter = true;
            receivingId = true;
        }
    }

    if (receivingId) {
        streamingFeatureId += chunk;
    }

    if (streamReceivedOpeningAtDelimiter && chunk.includes('@')) {
        streamReceivedOpeningAtDelimiter = false;
        streamReceivedClosingAtSymbol = true;

        if (chunk.includes('@@')) {
            streamReceivedClosingAtSymbol = false;
            streamReceivedClosingAtDelimiter = true;
        }
    }

    if (streamReceivedClosingAtSymbol && chunk.includes('@')) {
        streamReceivedClosingAtSymbol = false;
        streamReceivedOpeningAtDelimiter = true;
    }

    if (streamReceivedClosingAtDelimiter) {
        const content = processStreamElement.innerHTML || processStreamElement.textContent || '';
        const idMatch = content.match(/@@([^@]+)@@/);
        if (idMatch) {
            const id = idMatch[1];
            currentTextNode.textContent += id;
            processStreamElement.innerHTML += chunk;
            addObjectIdMenuSpan(delimitedId);
            delimitedId = '';

            currentTextNode = document.createTextNode("");
            responseStreamElement.appendChild(currentTextNode);
        }
        else {
            //couldn't extract id, replace original text
            currentTextNode.textContent = processStreamElement.textContent;
            currentTextNode.textContent += chunk;
            processStreamElement.innerHTML += chunk;
        }

        receivingId = false;
        return;
    }

    if (word === "END_OF_STREAM") {
        isStreaming = false;

        console.log("received: end of stream")

        // Force a reflow to ensure the DOM is updated
        void responseStreamElement.offsetHeight;
        // Force a repaint
        requestAnimationFrame(() => {});

        queueAnnouncement(processStreamElement.textContent);

        if (responseStreamElement.innerHTML == "") {
            console.log('empty response');
            responseStreamElement.closest('.button-container').remove();
        }
        return
    }

    if (!receivingId) {
        currentTextNode.textContent += chunk;
    }
    processStreamElement.innerHTML += chunk;
}

