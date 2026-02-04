/**
 * Folder Management Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { escapeHtml } from './utils.js';
import { loadVideoLibrary, hideContextMenus } from './library.js';
import { playVideo, openExternalLink } from './player.js';

/**
 * Load folders from server
 */
export async function loadFolders() {
    try {
        const data = await api.getFolders();

        if (data.success) {
            state.setFolders(data.folders);
            renderFolderList();

            // Show/hide setup notice in sidebar
            const setupNotice = document.getElementById('sidebarFolderSetup');
            const folderList = document.getElementById('sidebarFolderList');
            const addFolderBtn = document.getElementById('sidebarAddFolderBtn');

            if (data.configured) {
                setupNotice.classList.add('d-none');
                folderList.classList.remove('d-none');
                addFolderBtn.classList.remove('d-none');
            } else {
                setupNotice.classList.remove('d-none');
                folderList.classList.add('d-none');
                addFolderBtn.classList.add('d-none');
            }
        }
    } catch (error) {
        console.error('Load folders error:', error);
    }
}

/**
 * Render folder list in sidebar
 */
export function renderFolderList() {
    const folderListEl = document.getElementById('sidebarFolderList');
    if (!folderListEl) return;

    folderListEl.innerHTML = '';

    // Add "All Folders" option
    const allItem = document.createElement('div');
    allItem.className = `sidebar-folder-item all-folders ${state.currentFolder === null ? 'active' : ''}`;
    allItem.innerHTML = `
        <i class="bi bi-collection"></i>
        <span class="folder-name">All</span>
    `;
    allItem.addEventListener('click', () => selectFolderItem(null));
    folderListEl.appendChild(allItem);

    // Add each folder
    state.folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = `sidebar-folder-item ${state.currentFolder === folder.name ? 'active' : ''}`;
        item.dataset.folder = folder.name;
        item.innerHTML = `
            <i class="bi bi-folder${folder.is_default ? '-fill' : ''}"></i>
            <span class="folder-name">${escapeHtml(folder.name)}</span>
            <span class="folder-count">${folder.video_count}</span>
        `;
        item.addEventListener('click', () => selectFolderItem(folder.name));

        // Context menu for non-default folders
        if (!folder.is_default) {
            item.addEventListener('contextmenu', (e) => showFolderContextMenu(e, folder.name));
        }

        // Drop target for drag-and-drop
        item.addEventListener('dragover', handleFolderDragOver);
        item.addEventListener('dragleave', handleFolderDragLeave);
        item.addEventListener('drop', (e) => handleFolderDrop(e, folder.name));

        folderListEl.appendChild(item);
    });
}

/**
 * Select a folder item
 * @param {string|null} folderName - Folder name or null for all
 */
export function selectFolderItem(folderName) {
    state.setCurrentFolder(folderName);
    // Clear search when folder is selected
    state.setSearchQuery('');
    const searchInput = document.getElementById('librarySearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    renderFolderList();

    // Import dynamically to avoid circular dependency
    import('./main.js').then(main => {
        if (main.switchPage) {
            main.switchPage('library');
        }
    });

    loadVideoLibrary();
}

/**
 * Initialize folder management event listeners
 */
export function initFolderManagement() {
    // Add folder button in sidebar
    const addFolderBtn = document.getElementById('sidebarAddFolderBtn');
    if (addFolderBtn) {
        addFolderBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('createFolderModal'));
            document.getElementById('newFolderInput').value = '';
            modal.show();
        });
    }

    // Confirm create folder
    const confirmCreateBtn = document.getElementById('confirmCreateFolderBtn');
    if (confirmCreateBtn) {
        confirmCreateBtn.addEventListener('click', createFolder);
    }

    // Confirm rename folder
    const confirmRenameBtn = document.getElementById('confirmRenameFolderBtn');
    if (confirmRenameBtn) {
        confirmRenameBtn.addEventListener('click', confirmRenameFolder);
    }

    // Confirm move video
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    if (confirmMoveBtn) {
        confirmMoveBtn.addEventListener('click', confirmMoveVideo);
    }

    // Enter key handlers for modals
    document.getElementById('newFolderInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createFolder();
    });

    document.getElementById('renameFolderInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') confirmRenameFolder();
    });
}

/**
 * Create a new folder
 */
export async function createFolder() {
    const input = document.getElementById('newFolderInput');
    const name = input.value.trim();

    if (!name) return;

    try {
        const data = await api.createFolderAPI(name);
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('createFolderModal')).hide();
            loadFolders();
            updateDownloadFolderSelect();
        } else {
            alert(data.message || 'Failed to create folder');
        }
    } catch (error) {
        console.error('Create folder error:', error);
    }
}

/**
 * Show rename folder modal
 * @param {string} oldName - Current folder name
 */
export async function renameFolder(oldName) {
    state.setFolderToRename(oldName);
    const modal = new bootstrap.Modal(document.getElementById('renameFolderModal'));
    document.getElementById('renameFolderInput').value = oldName;
    modal.show();
}

/**
 * Confirm and execute folder rename
 */
export async function confirmRenameFolder() {
    if (!state.folderToRename) return;

    const input = document.getElementById('renameFolderInput');
    const newName = input.value.trim();

    if (!newName || newName === state.folderToRename) {
        bootstrap.Modal.getInstance(document.getElementById('renameFolderModal')).hide();
        return;
    }

    try {
        const data = await api.renameFolderAPI(state.folderToRename, newName);
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('renameFolderModal')).hide();
            if (state.currentFolder === state.folderToRename) {
                state.setCurrentFolder(data.new_name);
            }
            loadFolders();
            loadVideoLibrary();
            updateDownloadFolderSelect();
        } else {
            alert(data.message || 'Failed to rename folder');
        }
    } catch (error) {
        console.error('Rename folder error:', error);
    }

    state.setFolderToRename(null);
}

/**
 * Delete a folder
 * @param {string} name - Folder name to delete
 */
export async function deleteFolder(name) {
    const defaultFolder = state.appSettings.default_folder || '00_Inbox';
    if (!confirm(`Delete folder "${name}"? Videos will be moved to ${defaultFolder}.`)) {
        return;
    }

    try {
        const data = await api.deleteFolderAPI(name);
        if (data.success) {
            if (state.currentFolder === name) {
                state.setCurrentFolder(null);
            }
            loadFolders();
            loadVideoLibrary();
            updateDownloadFolderSelect();
        } else {
            alert(data.message || 'Failed to delete folder');
        }
    } catch (error) {
        console.error('Delete folder error:', error);
    }
}

/**
 * Show move video modal
 * @param {object} video - Video to move
 */
export function showMoveVideoModal(video) {
    const select = document.getElementById('moveFolderSelect');
    select.innerHTML = '';

    state.folders.forEach(folder => {
        if (folder.name !== video.folder) {
            const option = document.createElement('option');
            option.value = folder.name;
            option.textContent = folder.name + (folder.is_default ? ' (Default)' : '');
            select.appendChild(option);
        }
    });

    state.setContextMenuTarget(video);
    const modal = new bootstrap.Modal(document.getElementById('moveFolderModal'));
    modal.show();
}

/**
 * Confirm and execute video move
 */
export async function confirmMoveVideo() {
    if (!state.contextMenuTarget) return;

    const video = state.contextMenuTarget;
    const select = document.getElementById('moveFolderSelect');
    const targetFolder = select.value;

    try {
        const data = await api.moveVideo(video.filename, video.folder, targetFolder);
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('moveFolderModal')).hide();
            loadFolders();
            loadVideoLibrary();
        } else {
            alert(data.message || 'Failed to move video');
        }
    } catch (error) {
        console.error('Move video error:', error);
    }

    state.setContextMenuTarget(null);
}

/**
 * Update download folder select dropdown
 */
export function updateDownloadFolderSelect() {
    const select = document.getElementById('downloadFolderSelect');
    if (!select) return;

    const defaultFolder = state.appSettings.default_folder || '00_Inbox';
    select.innerHTML = '';

    // Add default folder first
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultFolder;
    defaultOption.textContent = `${defaultFolder} (Default)`;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    state.folders.forEach(folder => {
        if (folder.name !== defaultFolder) {
            const option = document.createElement('option');
            option.value = folder.name;
            option.textContent = folder.name;
            select.appendChild(option);
        }
    });
}

// Context Menu Functions
function showFolderContextMenu(e, folderName) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenus();

    state.setContextMenuTarget(folderName);

    const menu = document.getElementById('folderContextMenu');
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.classList.remove('d-none');

    // Adjust position if menu goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${e.clientX - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${e.clientY - rect.height}px`;
    }
}

/**
 * Handle folder context menu action
 * @param {string} action - Action to perform
 */
export function handleFolderContextAction(action) {
    hideContextMenus();

    if (!state.contextMenuTarget) return;
    const folderName = state.contextMenuTarget;

    switch (action) {
        case 'rename':
            renameFolder(folderName);
            break;
        case 'delete':
            deleteFolder(folderName);
            break;
    }

    state.setContextMenuTarget(null);
}

/**
 * Handle video context menu action
 * @param {string} action - Action to perform
 */
export async function handleVideoContextAction(action) {
    hideContextMenus();

    if (!state.contextMenuTarget) return;
    const video = state.contextMenuTarget;

    switch (action) {
        case 'play':
            playVideo(video);
            break;
        case 'move':
            showMoveVideoModal(video);
            break;
        case 'open-location':
            await openFileLocation(video);
            break;
        case 'youtube':
            if (video.url) {
                openExternalLink(video.url);
            }
            break;
        case 'delete':
            await deleteVideo(video);
            break;
    }

    state.setContextMenuTarget(null);
}

/**
 * Open file location in explorer
 * @param {object} video - Video object
 */
async function openFileLocation(video) {
    try {
        await api.openFileLocationAPI(video.folder, video.filename);
    } catch (error) {
        console.error('Open file location error:', error);
    }
}

/**
 * Delete a video
 * @param {object} video - Video to delete
 */
async function deleteVideo(video) {
    if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) {
        return;
    }

    try {
        // Use video_id for the new unified delete logic
        const videoId = video.video_id || video.id;
        const data = await api.deleteVideoAPI(video.folder, video.filename, videoId);
        if (data.success) {
            // If this video was playing, hide player
            if (state.currentPlayingVideo && state.currentPlayingVideo.id === video.id) {
                document.getElementById('playerContainer').classList.add('d-none');
                document.getElementById('playerPlaceholder').classList.remove('d-none');
                state.setCurrentPlayingVideo(null);
            }
            loadFolders();
            loadVideoLibrary();
        } else {
            alert(data.message || 'Failed to delete video');
        }
    } catch (error) {
        console.error('Delete video error:', error);
    }
}

// Drag and Drop Functions
export function initDragAndDrop() {
    const videoList = document.getElementById('videoList');
    if (!videoList) return;

    videoList.addEventListener('dragstart', handleDragStart);
    videoList.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
    const videoItem = e.target.closest('.video-item');
    if (!videoItem) return;

    videoItem.classList.add('dragging');

    e.dataTransfer.setData('text/plain', JSON.stringify({
        id: videoItem.dataset.id,
        folder: videoItem.dataset.folder,
        filename: videoItem.dataset.filename
    }));
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    const videoItem = e.target.closest('.video-item');
    if (videoItem) {
        videoItem.classList.remove('dragging');
    }
}

function handleFolderDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleFolderDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleFolderDrop(e, targetFolder) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');

    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));

        if (data.folder === targetFolder) return;

        const result = await api.moveVideo(data.filename, data.folder, targetFolder);
        if (result.success) {
            loadFolders();
            loadVideoLibrary();
        } else {
            alert(result.message || 'Failed to move video');
        }
    } catch (error) {
        console.error('Drop error:', error);
    }
}

/**
 * Initialize context menu event listeners
 */
export function initContextMenu() {
    // Hide context menus on click outside
    document.addEventListener('click', hideContextMenus);
    document.addEventListener('contextmenu', (e) => {
        // Only prevent default if clicking on a context menu trigger
        const isVideoItem = e.target.closest('.video-item');
        const isFolderItem = e.target.closest('.folder-item:not(.all-folders)');
        if (!isVideoItem && !isFolderItem) {
            hideContextMenus();
        }
    });

    // Video context menu actions
    document.getElementById('videoContextMenu')?.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => handleVideoContextAction(item.dataset.action));
    });

    // Folder context menu actions
    document.getElementById('folderContextMenu')?.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => handleFolderContextAction(item.dataset.action));
    });
}
