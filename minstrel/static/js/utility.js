export function isMobileDevice() {
    const ua = navigator.userAgent;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function sanitizeHTML(text) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = text;
    return tempDiv.innerHTML;
}

export function setupPressedClass(button, className) {
    if (!button || !className) {
        return;
    }

    const addPressed = () => {
        button.classList.add(className);
    };

    const removePressed = () => {
        button.classList.remove(className);
    };

    // Use pointer events so it works for mouse, touch, and pen
    button.addEventListener('pointerdown', addPressed);
    button.addEventListener('pointerup', removePressed);
    button.addEventListener('pointercancel', removePressed);
    button.addEventListener('pointerleave', removePressed);
}