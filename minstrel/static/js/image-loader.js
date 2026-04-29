export async function loadImage(url, imgElement) {
    let isSuccess = false;  // Flag to indicate if the image loading is successful

    try {
        const cache = await caches.open('image-cache');
        const cacheUrl = `images/${url.split('/').pop()}`;
        let cachedResponse = await cache.match(cacheUrl);

        if (!cachedResponse || !cachedResponse.ok) {
            const response = await fetch(url);
            if (response.ok) {
                const blob = await response.blob();
                await cache.put(cacheUrl, new Response(blob));
                cachedResponse = new Response(blob);
            }
        }

        if (cachedResponse && cachedResponse.ok) {
            const blob = await cachedResponse.blob();
            const imageUrl = URL.createObjectURL(blob);
            imgElement.src = imageUrl;
            imgElement.style.display = 'block';
            isSuccess = true;  // Set success to true as image loaded correctly
        } else {
            throw new Error('Image not found in cache or network.');
        }
    } catch (error) {
        console.error('Error loading image:', error);
        imgElement.style.display = 'none';
    }

    return isSuccess;  // Return the success status
}