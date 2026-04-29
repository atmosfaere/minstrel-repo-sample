//import { ReconnectingWebSocket } from './ReconnectingWebSocket.js';
export const base_url = 'http://127.0.0.1:5004/';

let isStreaming = false;
const STREAM_TIMEOUT = 15000;

let nameSet = false;
let timeout;
//const textarea = document.querySelector('.input-field'); not loaded before autoResize

let socket
let world = null;
let chat = null;

let messageStartIndex = 0;
let scrollingMessages = false;


function sanitizeHTML(text) {
  const tempDiv = document.createElement('div');
  tempDiv.textContent = text;
  return tempDiv.innerHTML;
}

function autoResize() {
    const textarea = document.querySelector('.input-field'); // Selecting the textarea element

    // Reset height to 'auto' to allow shrinkage if the content is removed
    textarea.style.height = 'auto';

    // Set height based on the maximum of scrollHeight and a minimum value, ensuring it doesn't shrink below 5px
    textarea.style.height = `${Math.max(textarea.scrollHeight, 5)}px`;

    // Limit the maximum height to 300px
    if (textarea.scrollHeight > 300) {
        textarea.style.height = '300px';
    }

    // Store the initial scroll height for future reference if not already stored
    if (!textarea.dataset.initialScrollHeight) {
        textarea.dataset.initialScrollHeight = textarea.scrollHeight;
        console.log('Initial scrollHeight stored:', textarea.dataset.initialScrollHeight);
    }
    if (textarea.scrollHeight == textarea.dataset.initialScrollHeight) {
        //57px prevents scrollbar
        textarea.style.height = '57px';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const chatContainer = document.querySelector(".chat-container");
    const messageScrollContainer = document.querySelector(".message-scroll-container");


    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host; // 'host' includes hostname and port if port is specified
    //switch to /wss once using https
    const wsPath = '/ws';
    const wsUrl = `${wsProtocol}//${wsHost}${wsPath}`;
    //move to function that makes request to join-world, if socket heart-beat dead, make new socket there, if heart-beat dead call join-world or join-chat from reconnectingWebSocket class.
    socket = new WebSocket(wsUrl);


    var rightAlignedP;
    var streamContainer;

    //const messageInput = document.querySelector('input-field');
    //use socket on connect to reject unwanted connections

    const promptArea = document.querySelector('.input-field');
    if (promptArea) {
        promptArea.addEventListener('input', autoResize, false);
    }
    autoResize();

    world = sessionStorage.getItem("world")
    chat = sessionStorage.getItem("chat")

    if (world) {
        //join-world(world)
    }
    else if (chat) {
        //join-chat(chat)
    }
    //also called when websocket loses connection
    /*func join-world(world) {
        if (socket):
            socket.close;#code
        #always make new 
        socket = new WebSocket('ws://127.0.0.1:5000/ws');}*/


    function createLeftContainer(message, user = "user", id = null, prepend = false,) {
        message = sanitizeHTML(message);
        const newFlexContainer = document.createElement("div");
        newFlexContainer.classList.add("response-container");
        const iconVisibility = id ? 'block' : 'none';

        newFlexContainer.innerHTML = `
    <div class="response-container">
        <p class="user-name">${user}</p>
        <div class="message-container left-align">
            <button class="character-icon" id="${id}" style="display: ${iconVisibility};">
                <img src="piano.png" alt="Icon" style="display: ${iconVisibility};">
            </button>
            <div class="user-chat-bubble round">
                <div class="talk-text">
                    <p>${message}</p>
                </div>
            </div>
        </div>
    </div>
`;

        if (prepend) {
            const scrollTop = messageScrollContainer.scrollTop; // Get current scroll position of the container
            const scrollHeightBefore = messageScrollContainer.scrollHeight; // Get the scroll height before adding content

            chatContainer.prepend(newFlexContainer); // Prepend the new content

            const scrollHeightAfter = messageScrollContainer.scrollHeight; // Get the new scroll height after adding content
            const addedHeight = scrollHeightAfter - scrollHeightBefore; // Calculate the height of the added content

            messageScrollContainer.scrollTo(0, scrollTop + addedHeight); // Adjust scroll position to maintain the view
        } else {
            //document.body.appendChild(newFlexContainer);
            chatContainer.appendChild(newFlexContainer);
        }

        //return newFlexContainer.querySelector('.left-align .talktext p');
        return newFlexContainer.querySelector('.talk-text p');
    }
    function createRightContainer(message, character = "", id = "", prepend = false) {
        message = sanitizeHTML(message);
        const newFlexContainer = document.createElement("div");
        newFlexContainer.classList.add("response-container");
        const iconVisibility = id ? 'block' : 'none';

        newFlexContainer.innerHTML = `
    <div class="response-container">
        <p class="character-name">${character}</p>
        <div class="message-container right-align">
          <div class="chat-bubble round">
            <div class="talk-text">
              <p>${message}</p>
            </div>
          </div>
          <button class="character-icon" id="${id}" style="display: ${iconVisibility};">
            <img src="piano.png" alt="Icon" style="display: ${iconVisibility};">
          </button>
        </div>
    </div>
    `;

        if (prepend) {
            console.log("prending");
            const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
            const scrollHeightBefore = document.body.scrollHeight;
            chatContainer.prepend(newFlexContainer);
            const scrollHeightAfter = document.body.scrollHeight;
            const addedHeight = scrollHeightAfter - scrollHeightBefore;
            window.scrollTo(0, scrollTop + addedHeight);
        } else {
            chatContainer.appendChild(newFlexContainer);
        }

        return newFlexContainer.querySelector('.talk-text p');
    }

    const sendButton = document.querySelector('.submit-button');
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }

    if (promptArea) {
        promptArea.addEventListener('keydown', function (event) {
            // Check if the key pressed is 'Enter' and if the event did not happen while holding down the 'Shift' key
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent the default action to avoid form submission or line breaks
                sendMessage();
            }
        });
    }

    function joinRoom() {
        //socket.emit('join', { mode: "fhe" });
        socket.emit('join', { mode: "none" });
    }

    function retrieveEarlierMessages() {
        socket.emit('retrieve_earlier_messages', { room: room, index: messageStartIndex});
    }

    async function streamResponse(rightAlignedP, word) {
        clearTimeout(timeout); // Clear the previous timeout

        autoResize();

        text = sanitizeHTML(word);
        if (word === "END_OF_STREAM") {
            isStreaming = false;
            streamContainer = false;
            console.log("received: end of stream")

            if (rightAlignedP.innerHTML == "") {
                console.log('empty response');
                rightAlignedP.closest('.button-container').remove();
            }
            return
        }

        rightAlignedP.innerHTML += word;
        //window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); // Scroll the entire window to the bottom

        timeout = setTimeout(() => {
            console.log("Stream timeout reached. Stopping read.");
            isStreaming = false; // Reset the streaming flag
            streamContainer = false;
        }, STREAM_TIMEOUT);

        //requestAnimationFrame(read);
    }

    function sendMessage() {
        let mode = null
        if (isStreaming) {
            console.log("Stream already active");
            return;
        }
        let userMessage = document.querySelector('.input-field').value;

        if (userMessage === "") {
            console.log("empty message")
            return;
        }
        if (nameSet === false) {
            //mode = 'bom_name';
            mode = "none";
        } else {
            mode = 'fhe'; // This will be set if nameSet is anything other than "false"
        }

        console.log("sending userMessage")
        console.log(mode)
        socket.emit('ai_stream', {
            mode: mode,
            message: userMessage,
            room: room,
            //api: "home_server",
            //model: "llama3-8b-8192"
            api: "openai",
            model: "gpt-4-1106-preview"
            //api: "groq",
            //model: "llama3-70b-8192"
            //model: "llama-3.1-70b-versatile"
            //model: "llama3-8b-8192"
            //model: "gemma2-9b-it"
            //api: "mistral",
            //model: "open-mixtral-8x7b"
            //api: "monolyth",
            //model: "llama-3-8b-instruct"
            //api: "deepinfra",
            //model: "google/gemma-2-27b-it" problems with output, apparently likely with all 27b at this time
            //model: "google/gemma-2-9b-it"
        });
    }

    socket.onopen = function (event) {
        console.log('Connection opened');
        //delete all messages on connect to prevent receiving duplicate messages on when page idles
        let chatContainer = document.querySelector('.chat-container');
        while (chatContainer.firstChild) {
            chatContainer.removeChild(chatContainer.firstChild);
        }
        joinRoom(); //use room variable
    };


    socket.on('room', function (data) {
        room = data
        //sessionStorage.setItem('room', room);
        console.log("room set: ", room)
    });

    socket.on('message', function (data) {
        console.log(data)
    });
    socket.on('server message', function (data) {
        //error messages and server communication, prescripted messages
        console.log("server message: " + data.text)
        let rightAlignedP = createRightContainer();
        rightAlignedP.innerHTML = data.text;
    });

    //add user message from any user in room to chat bubble
    socket.on('user message', function (data) {
        console.log("got user message from server");
        //let leftAlignedP = createLeftContainer(data.text, data.user, data.id);
        leftContainer = createLeftContainer(data.text, data.user, data.id);
        if (!scrollingMessages) {
            //need to change to scroll to new container or bottom of scrollMessageContainer
            //will scroll to ai response, may be less hectic with only one scroll!!
            //window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
            leftContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    socket.on('received message', function (data) {
        //if streaming = false on server for room, meaning an ai stream will begin for the prompt, then message is sent here, send only to client that sent prompt
        promptArea.value = "";
        //shrink textarea
        autoResize.call(promptArea);
        //make button normal again
        console.log("message received, processing will begin")
    });
    socket.on('response stream', function (data) {
        //console.log('ai stream');
        if (!streamContainer) {
            rightAlignedP = createRightContainer(data.word, data.user, data.id);
            streamContainer = true;
            if (!scrollingMessages) {
                //window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
                //chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'auto' });
                rightAlignedP.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
        streamResponse(rightAlignedP, data.word);
    });

    async function notifyRoomMessage() {
        //stop users from sending messages to save server resources while a message is being processed
        isStreaming = true;

        timeout = setTimeout(() => {
            console.log("Stream timeout reached. Stopping stream.");
            isStreaming = false; // Reset the streaming flag
        }, STREAM_TIMEOUT);

        //make button normal again
        console.log("received message from a user, streaming will begin")
    };

    async function notifyBusy() {
        //if streaming = true on server for room, then message is sent here, send only to client that sent prompt
        //important, user may send messages in same interval, or in case one user doesn't receive "notifyRoomMessage" that sets isStreaming to true due to connection issue
        //
        //make button normal again
        console.log("server busy processing another room message")
    };

    async function getConversation(data) {
        console.log('received recent conversation')
        const textContainers = document.querySelectorAll('.flex-container');

        textContainers.forEach(container => {
            container.parentNode.removeChild(container);
        });

        if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach(item => {
                if (item.sender && item.message) {
                    console.log(item.sender)
                    if (item.sender === "user") {
                        createLeftContainer(item.message, item.name)
                    }
                    if (item.sender === "assistant") {
                        createRightContainer(item.message, item.name)
                    }
                }
            });
        }
        if (data.current_message) {
            const messageContainers = document.querySelectorAll('.flex-container');
            if (messageContainers.length > 0) {
                const mostRecentContainer = messageContainers[messageContainers.length - 1];
                const paragraph = mostRecentContainer.querySelector('p');
                if (paragraph) {
                    paragraph.innerHTML = data.current_message + paragraph.innerHTML;
                }
            }
        } else {
            console.log("No current message received");
        }

        if ('startIndex' in data) {
            messageStartIndex = data.startIndex;
            console.log("start index" + messageStartIndex);
        } else {
            console.log("no startIndex received for messages");
        }
        //window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
        messageScrollContainer.scrollTo({ top: messageScrollContainer.scrollHeight, behavior: 'auto' });
    };

    socket.on('earlier messages', function (data) {
        console.log('adding earlier messages');
        console.log('Received data:', JSON.stringify(data));
        if (data.messages && Array.isArray(data.messages)) {
            for (let i = data.messages.length - 1; i >= 0; i--) {
                let item = data.messages[i];
                if (item.sender && item.message) {
                    console.log(item.sender);
                    if (item.sender === "user") {
                        createLeftContainer(item.message, item.name, undefined, true);
                    }
                    if (item.sender === "assistant") {
                        createRightContainer(item.message, item.name, undefined, true);
                    }
                }
            }
        } else {
            console.log("No messages array or not an array.");
        }

        if ('startIndex' in data) {
            messageStartIndex = data.startIndex;
            console.log("start index" + messageStartIndex);
        } else {
            console.log("no startIndex received for messages");
        }
    });
    /*
    const messageHandlers = {
        'server message': handleServerMessage,
        'user message': processUserMessage,
        'ai stream': processAiStream,
        'received message busy': handleReceivedMessageBusy,
        // Add other handlers as needed
    };

    const socket = new ReconnectingWebSocket(
        'ws://example.com/socket',
        1000,
        30000,
        messageHandlers,
        chat ? joinChat : null,
        world ? joinWorld : null
    );*/
    

    if (room) {
        console.log("room found", room);
        //joinRoom();
    } else {
        console.log("No room found");
        //joinRoom();
    }
    /*
    window.addEventListener('scroll', function () {
        if (window.scrollY <= 30) {
            retrieveEarlierMessages();
        }
    });*/

    // Adding scroll event listener to chatContainer instead of window
    messageScrollContainer.addEventListener('scroll', function () {
        var scrollHeight = messageScrollContainer.scrollHeight;
        var clientHeight = messageScrollContainer.clientHeight;
        var scrollTop = messageScrollContainer.scrollTop;

        var scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
        // Check if the scroll is at the top of the chat container
        if (messageScrollContainer.scrollTop <= 30) {
            retrieveEarlierMessages();
            scrollingMessages = true;
            //console.log('scrolling')
        }
        else if (scrollPercent <= 60) {
            scrollingMessages = true;
            //console.log('scrolling')
        }
        else {
            scrollingMessages = false;
            //console.log('not scrolling')
        }
    });

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            //socket.close();  // Close the socket when the page is not visible
            console.log("hidden");
        } else {
            //socket = io();  // Re-establish the connection when the page becomes visible
            //setTimeout(function () {
                //console.log("This message is shown after 1 second.");
            //}, 5000);
            //joinRoom();    // Rejoin the room if applicable
            console.log("visible");
        }
    });
});


