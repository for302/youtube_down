/**
 * API Module
 * Abstractions for all API calls
 */

/**
 * Fetch JSON from URL with error handling
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<object>} JSON response
 */
export async function fetchJSON(url, options = {}) {
    const response = await fetch(url, options);
    return response.json();
}

/**
 * POST JSON to URL
 * @param {string} url - The URL to post to
 * @param {object} data - Data to post
 * @returns {Promise<object>} JSON response
 */
export async function postJSON(url, data) {
    return fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

// Video Info API
export async function getVideoInfo(url) {
    return postJSON('/api/info', { url });
}

// Download API
export async function startVideoDownload(options) {
    return postJSON('/api/download', options);
}

export async function getDownloadProgress() {
    return fetchJSON('/api/progress');
}

export async function cancelVideoDownload() {
    return fetchJSON('/api/cancel', { method: 'POST' });
}

// Library API
export async function getLibrary(folder = null) {
    let url = '/api/library';
    if (folder) {
        url += `?folder=${encodeURIComponent(folder)}`;
    }
    return fetchJSON(url);
}

// Folder API
export async function getFolders() {
    return fetchJSON('/api/folders');
}

export async function createFolderAPI(name) {
    return postJSON('/api/folders', { name });
}

export async function renameFolderAPI(oldName, newName) {
    return fetchJSON(`/api/folders/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName })
    });
}

export async function deleteFolderAPI(name) {
    return fetchJSON(`/api/folders/${encodeURIComponent(name)}`, {
        method: 'DELETE'
    });
}

export async function renameDefaultFolderAPI(newName) {
    return postJSON('/api/rename-default-folder', { new_name: newName });
}

// Video Operations API
export async function moveVideo(filename, sourceFolder, targetFolder) {
    return postJSON('/api/videos/move', {
        filename,
        source_folder: sourceFolder,
        target_folder: targetFolder
    });
}

export async function deleteVideoAPI(folder, filename, videoId = null) {
    return postJSON('/api/delete-video', { folder, filename, video_id: videoId });
}

export async function openFileLocationAPI(folder, filename) {
    return postJSON('/api/open-file-location', { folder, filename });
}

export async function openFolderAPI(filepath) {
    return postJSON('/api/open-folder', { filepath });
}

export async function openContentFolderAPI(path) {
    return postJSON('/api/open-content-folder', { path });
}

// Settings API
export async function getSettings() {
    return fetchJSON('/api/settings');
}

export async function saveSettingsAPI(settings) {
    return postJSON('/api/settings', settings);
}

// Tags API
export async function getAllTags() {
    return fetchJSON('/api/tags');
}

export async function updateVideoTags(videoId, tags) {
    return postJSON(`/api/tags/${encodeURIComponent(videoId)}`, { tags });
}

// Metadata API
export async function updateVideoMetadata(videoId, metadata) {
    return postJSON(`/api/update-metadata/${encodeURIComponent(videoId)}`, metadata);
}

// Link/Download Later API
export async function saveLinkAPI(url, folder) {
    return postJSON('/api/save-link', { url, folder });
}

export async function downloadLaterAPI(videoId, folder) {
    return postJSON('/api/download-later', { video_id: videoId, folder });
}

// Update API
export async function getVersion() {
    return fetchJSON('/api/version');
}

export async function checkUpdateAPI() {
    return fetchJSON('/api/check-update');
}

export async function downloadUpdateAPI(downloadUrl, assetName) {
    return postJSON('/api/download-update', {
        download_url: downloadUrl,
        asset_name: assetName
    });
}

export async function getUpdateProgress() {
    return fetchJSON('/api/update-progress');
}

export async function installUpdateAPI() {
    return fetchJSON('/api/install-update', { method: 'POST' });
}
