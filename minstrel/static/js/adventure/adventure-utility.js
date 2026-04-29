export function parseIntervalToMinutes(intervalString) {
    const s = intervalString.trim().toLowerCase();
    if (s === 'continuous') {
        return 'Continuous';
    }

    const parts = s.split(' ');
    if (parts.length < 2) return 5; // Default

    const value = parseFloat(parts[0]);
    const unit = parts[1];

    if (unit.startsWith('sec')) {
        return value / 60; // allow fractional minutes (e.g., 30 sec -> 0.5)
    } else if (unit.startsWith('min')) {
        return value;
    } else if (unit.startsWith('hour')) {
        return value * 60;
    } else if (s.includes('times a day')) {
        return Math.round((24 * 60) / value);
    } else if (s === 'twice a day') {
        return 12 * 60;
    } else if (s === 'once a day') {
        return 24 * 60;
    } else if (s === 'once a week') {
        return 7 * 24 * 60;
    }
}

export async function getResponseErrorMessage(response) {
    try {
        const data = await response.clone().json();
        if (data && typeof data === 'object') {
            return data.detail || data.message || JSON.stringify(data);
        }
    } catch (e) {
        // fall through to text
    }
    try {
        return await response.text();
    } catch (e) {
        return `HTTP ${response.status}`;
    }
}
