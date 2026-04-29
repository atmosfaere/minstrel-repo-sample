document.addEventListener('DOMContentLoaded', function () {
    const elem = document.getElementById('draggable-box');
    const header = document.getElementById('header');
    
    // Initialize positions when the mouse button is pressed
    header.onmousedown = function (e) {
        e.preventDefault();
        
        // Get the initial mouse cursor position
        let startPosX = e.clientX;
        let startPosY = e.clientY;
		var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
		pos3 = e.clientX;
		pos4 = e.clientY;
        
        // When moving the mouse, calculate the difference from the initial position
        function onMouseMove(e) {
            // Calculate the distance moved by subtracting the initial position from the current position
            pos1 = pos3 - e.clientX;
			pos2 = pos4 - e.clientY;
			pos3 = e.clientX;
			pos4 = e.clientY;

            // Update the position of the box by adding the distance moved to the box's current position
            elem.style.left = (elem.offsetLeft - pos1) + "px";
            elem.style.top = (elem.offsetTop - pos2) + "px";
			
			startPosX = e.clientX;
			startPosY = e.clientY;
        }

        // Attach the mouse move event listener
        document.addEventListener('mousemove', onMouseMove);

        // Detach the mouse move and mouse up event listeners when the mouse button is released
        document.onmouseup = function () {
            document.removeEventListener('mousemove', onMouseMove);
            document.onmouseup = null;
        };
    };
});
