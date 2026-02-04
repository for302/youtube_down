/**
 * Utility Functions Module
 */

import { PLATFORM_PATTERNS, PLATFORM_ICONS } from './state.js';

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidUrl(url) {
    // Check supported platform patterns
    for (const patterns of Object.values(PLATFORM_PATTERNS)) {
        if (patterns.some(pattern => pattern.test(url))) {
            return true;
        }
    }
    // Also allow general HTTP(S) URLs (yt-dlp supports many sites)
    return /^https?:\/\/.+/.test(url);
}

/**
 * Escape regex special characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
export function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect platform from URL
 * @param {string} url - URL to detect platform from
 * @returns {string} Platform name
 */
export function detectPlatform(url) {
    if (!url) return 'other';
    const lowerUrl = url.toLowerCase();
    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
        if (patterns.some(pattern => pattern.test(lowerUrl))) {
            return platform;
        }
    }
    return 'other';
}

/**
 * Get platform info (icon, color, name)
 * @param {string} platform - Platform name
 * @returns {object} Platform info
 */
export function getPlatformInfo(platform) {
    return PLATFORM_ICONS[platform] || PLATFORM_ICONS.other;
}

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - Toast type ('success' or 'error')
 */
export function showToast(message, type = 'success') {
    // Create toast container if not exists
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast-message ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Highlight text with search query
 * @param {string} text - Text to highlight
 * @param {string} query - Search query
 * @returns {string} HTML with highlights
 */
export function highlightText(text, query) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    if (!query || !query.trim()) return escaped;

    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}
