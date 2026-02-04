/**
 * YouTube Downloader Frontend - Main Entry Point
 * ES6 Module-based architecture
 */

// Import all modules
import * as state from './state.js';
import * as api from './api.js';
import * as utils from './utils.js';
import * as download from './download.js';
import * as library from './library.js';
import * as player from './player.js';
import * as folders from './folders.js';
import * as settings from './settings.js';
import * as update from './update.js';
import * as tags from './tags.js';

/**
 * Initialize the application
 */
function init() {
    // Initialize DOM element references
    download.initDownloadElements();

    // Initialize event listeners
    initEventListeners();
    initNavigation();

    // Initialize components
    settings.loadSettings();
    settings.initSettingsModal();
    folders.initFolderManagement();
    folders.initContextMenu();
    folders.initDragAndDrop();
    update.initUpdateSystem();
    tags.initTagInput();
    player.initTimestampClickHandler();
    player.initPlayerEventHandlers();

    // Load folders on startup (sidebar always visible)
    folders.loadFolders();

    // Check for updates on startup (after a short delay)
    setTimeout(() => update.checkForUpdates(false), 2000);
}

/**
 * Initialize navigation
 */
function initNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            switchPage(page);
        });
    });
}

/**
 * Switch between pages
 * @param {string} pageName - Page to switch to
 */
export function switchPage(pageName) {
    // Update menu active state
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Update page visibility
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    if (pageName === 'download') {
        document.getElementById('downloadPage').classList.add('active');
        folders.updateDownloadFolderSelect();
    } else if (pageName === 'library') {
        document.getElementById('libraryPage').classList.add('active');
        folders.loadFolders();
        library.loadVideoLibrary();
    }
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
    const urlInput = document.getElementById('urlInput');
    const fetchBtn = document.getElementById('fetchBtn');

    // Fetch button
    fetchBtn?.addEventListener('click', download.fetchVideoInfo);

    // URL input - Enter key
    urlInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') download.fetchVideoInfo();
    });

    // URL input - Paste detection
    urlInput?.addEventListener('paste', () => {
        setTimeout(download.fetchVideoInfo, 100);
    });

    // Download buttons
    document.getElementById('downloadVideoBtn')?.addEventListener('click', () => download.startDownload('video'));
    document.getElementById('downloadAudioBtn')?.addEventListener('click', () => download.startDownload('audio'));

    // Cancel button
    document.getElementById('cancelBtn')?.addEventListener('click', download.cancelDownload);

    // Open folder button
    document.getElementById('openFolderBtn')?.addEventListener('click', download.openFolder);

    // Download more button
    document.getElementById('downloadMoreBtn')?.addEventListener('click', download.resetUI);

    // Quality buttons (MP3)
    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.setSelectedBitrate(this.dataset.bitrate);
        });
    });

    // Refresh library button
    document.getElementById('refreshLibraryBtn')?.addEventListener('click', library.loadVideoLibrary);

    // Save link only button
    document.getElementById('saveLinkOnlyBtn')?.addEventListener('click', download.saveLinkOnly);

    // Download later button
    document.getElementById('downloadLaterBtn')?.addEventListener('click', player.downloadLater);

    // Search input - real-time filtering
    const searchInput = document.getElementById('librarySearchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            state.setSearchQuery(e.target.value.trim());

            // Show/hide clear button
            if (searchClearBtn) {
                searchClearBtn.classList.toggle('d-none', !state.searchQuery);
            }

            // When searching, switch to "All Folders" to search across all videos
            if (state.searchQuery && state.currentFolder !== null) {
                state.setCurrentFolder(null);
                folders.renderFolderList();
                await library.loadVideoLibrary();
            } else {
                library.renderVideoList();
            }
        });
    }

    // Search clear button
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                state.setSearchQuery('');
                searchClearBtn.classList.add('d-none');
                library.renderVideoList();
                searchInput.focus();
            }
        });
    }

    // Platform filter button
    document.getElementById('platformFilterBtn')?.addEventListener('click', library.togglePlatformFilter);

    // Platform filter checkboxes
    document.querySelectorAll('.platform-filter-item input').forEach(checkbox => {
        checkbox.addEventListener('change', library.handlePlatformFilterChange);
    });

    // Close filter dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('platformFilterDropdown');
        const btn = document.getElementById('platformFilterBtn');
        if (dropdown && !dropdown.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
            dropdown.classList.add('d-none');
        }
    });

    // Title edit buttons
    document.getElementById('editTitleBtn')?.addEventListener('click', player.startEditTitle);
    document.getElementById('saveTitleBtn')?.addEventListener('click', player.saveTitle);
    document.getElementById('cancelTitleBtn')?.addEventListener('click', player.cancelEditTitle);

    // Description edit buttons
    document.getElementById('editDescBtn')?.addEventListener('click', player.startEditDescription);
    document.getElementById('saveDescBtn')?.addEventListener('click', player.saveDescription);
    document.getElementById('cancelDescBtn')?.addEventListener('click', player.cancelEditDescription);

    // Platform icons click - open in external browser
    document.querySelectorAll('.supported-platforms .platform-icon[data-url]').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            const url = icon.dataset.url;
            if (url) {
                player.openExternalLink(url);
            }
        });
    });
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions to window for onclick handlers in HTML
window.fetchVideoInfo = download.fetchVideoInfo;
window.startDownload = download.startDownload;
window.cancelDownload = download.cancelDownload;
window.resetUI = download.resetUI;
window.openFolder = download.openFolder;
window.saveLinkOnly = download.saveLinkOnly;

window.loadVideoLibrary = library.loadVideoLibrary;
window.renderVideoList = library.renderVideoList;

window.playVideo = player.playVideo;
window.openExternalLink = player.openExternalLink;
window.downloadLater = player.downloadLater;
window.playEmbeddedVideo = player.playEmbeddedVideo;
window.startEditTitle = player.startEditTitle;
window.saveTitle = player.saveTitle;
window.cancelEditTitle = player.cancelEditTitle;
window.startEditDescription = player.startEditDescription;
window.saveDescription = player.saveDescription;
window.cancelEditDescription = player.cancelEditDescription;

window.loadFolders = folders.loadFolders;
window.createFolder = folders.createFolder;
window.renameFolder = folders.renameFolder;
window.deleteFolder = folders.deleteFolder;
window.confirmRenameFolder = folders.confirmRenameFolder;
window.confirmMoveVideo = folders.confirmMoveVideo;
window.showMoveVideoModal = folders.showMoveVideoModal;
window.updateDownloadFolderSelect = folders.updateDownloadFolderSelect;

window.loadSettings = settings.loadSettings;
window.saveSettings = settings.saveSettings;
window.selectContentFolder = settings.selectContentFolder;
window.saveDefaultFolder = settings.saveDefaultFolder;

window.checkForUpdates = update.checkForUpdates;
window.startUpdateDownload = update.startUpdateDownload;
window.installUpdate = update.installUpdate;

window.addTag = tags.addTag;
window.removeTag = tags.removeTag;

window.showToast = utils.showToast;
window.escapeHtml = utils.escapeHtml;
window.formatBytes = utils.formatBytes;
window.isValidUrl = utils.isValidUrl;
window.detectPlatform = utils.detectPlatform;
window.getPlatformInfo = utils.getPlatformInfo;

window.switchPage = switchPage;
