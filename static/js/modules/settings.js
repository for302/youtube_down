/**
 * Settings Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { loadFolders, updateDownloadFolderSelect } from './folders.js';

/**
 * Load settings from server
 */
export async function loadSettings() {
    try {
        const data = await api.getSettings();

        if (data.success) {
            state.setAppSettings(data.settings);
            applySettings();

            // Show setup modal if content folder is not configured
            if (!state.appSettings.content_path) {
                showInitialSetupModal();
            }
        }
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

/**
 * Save settings to server
 * @param {object} settings - Settings to save
 * @returns {Promise<object>} Result
 */
export async function saveSettings(settings) {
    try {
        const data = await api.saveSettingsAPI(settings);
        if (data.success) {
            state.setAppSettings(data.settings);
            applySettings();
        }
        return data;
    } catch (error) {
        console.error('Save settings error:', error);
        return { success: false };
    }
}

/**
 * Apply settings to UI
 */
export function applySettings() {
    // Apply theme
    document.documentElement.setAttribute('data-theme', state.appSettings.theme || 'light');

    // Update theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === state.appSettings.theme);
    });

    // Update content path input
    const contentPathInput = document.getElementById('contentPathInput');
    if (contentPathInput) {
        contentPathInput.value = state.appSettings.content_path || '';
    }

    // Update default folder input
    const defaultFolderInput = document.getElementById('defaultFolderInput');
    if (defaultFolderInput) {
        defaultFolderInput.value = state.appSettings.default_folder || '00_Inbox';
    }

    // Update developer mode toggle
    const developerModeToggle = document.getElementById('developerModeToggle');
    if (developerModeToggle) {
        developerModeToggle.checked = state.appSettings.developer_mode || false;
    }
}

/**
 * Show initial setup modal
 */
export function showInitialSetupModal() {
    const modalEl = document.getElementById('settingsModal');
    const modal = new bootstrap.Modal(modalEl, {
        backdrop: 'static',
        keyboard: false
    });

    // Add setup message to modal
    const modalBody = modalEl.querySelector('.modal-body');
    let setupAlert = modalEl.querySelector('.setup-alert');
    if (!setupAlert) {
        setupAlert = document.createElement('div');
        setupAlert.className = 'alert alert-info setup-alert mb-4';
        setupAlert.innerHTML = `
            <i class="bi bi-info-circle me-2"></i>
            <strong>Welcome to ClickClipDown!</strong> Please set the content folder and default folder name to start using the app.
        `;
        modalBody.insertBefore(setupAlert, modalBody.firstChild);
    }

    // Show default folder section prominently during initial setup
    const defaultFolderSection = document.getElementById('defaultFolderSection');
    if (defaultFolderSection) {
        defaultFolderSection.classList.add('initial-setup-highlight');
    }

    // Hide close button until configured
    const closeBtn = modalEl.querySelector('.btn-close');
    const footerCloseBtn = modalEl.querySelector('.modal-footer .btn-secondary');
    if (closeBtn) closeBtn.classList.add('d-none');
    if (footerCloseBtn) footerCloseBtn.classList.add('d-none');

    modal.show();

    // Listen for content path changes to enable closing
    const checkConfigured = () => {
        if (state.appSettings.content_path) {
            if (closeBtn) closeBtn.classList.remove('d-none');
            if (footerCloseBtn) footerCloseBtn.classList.remove('d-none');
            if (setupAlert) setupAlert.remove();
            if (defaultFolderSection) {
                defaultFolderSection.classList.remove('initial-setup-highlight');
            }
        }
    };

    // Check periodically
    const checkInterval = setInterval(() => {
        checkConfigured();
        if (state.appSettings.content_path) {
            clearInterval(checkInterval);
        }
    }, 500);
}

/**
 * Initialize settings modal event listeners
 */
export function initSettingsModal() {
    // Theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const theme = btn.dataset.theme;
            await saveSettings({ theme });
        });
    });

    // Content folder selection
    const selectContentFolderBtn = document.getElementById('selectContentFolderBtn');
    if (selectContentFolderBtn) {
        selectContentFolderBtn.addEventListener('click', selectContentFolder);
    }

    // Open content folder button
    const openContentFolderBtn = document.getElementById('openContentFolderBtn');
    if (openContentFolderBtn) {
        openContentFolderBtn.addEventListener('click', openContentFolder);
    }

    // Default folder name save button
    const saveDefaultFolderBtn = document.getElementById('saveDefaultFolderBtn');
    if (saveDefaultFolderBtn) {
        saveDefaultFolderBtn.addEventListener('click', saveDefaultFolder);
    }

    // Default folder input
    const defaultFolderInput = document.getElementById('defaultFolderInput');
    if (defaultFolderInput) {
        defaultFolderInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveDefaultFolder();
        });
    }

    // Developer mode toggle
    const developerModeToggle = document.getElementById('developerModeToggle');
    if (developerModeToggle) {
        developerModeToggle.addEventListener('change', toggleDeveloperMode);
    }
}

/**
 * Select content folder
 */
export async function selectContentFolder() {
    // Try PyWebView API first
    if (window.pywebview && window.pywebview.api && window.pywebview.api.select_content_folder) {
        try {
            const path = await window.pywebview.api.select_content_folder();
            if (path) {
                document.getElementById('contentPathInput').value = path;
                state.updateAppSettings({ content_path: path });
                await saveSettings({ content_path: path });
                loadFolders();
                updateDownloadFolderSelect();
            }
        } catch (error) {
            console.error('PyWebView select_content_folder error:', error);
            selectContentFolderFallback();
        }
    } else {
        selectContentFolderFallback();
    }
}

/**
 * Fallback for content folder selection
 */
async function selectContentFolderFallback() {
    const path = prompt('콘텐츠 폴더 경로를 입력하세요:');
    if (path) {
        const result = await saveSettings({ content_path: path });
        if (result.success) {
            document.getElementById('contentPathInput').value = state.appSettings.content_path;
            loadFolders();
            updateDownloadFolderSelect();
        } else {
            alert('유효하지 않은 경로입니다.');
        }
    }
}

/**
 * Open content folder in explorer
 */
export async function openContentFolder() {
    if (!state.appSettings.content_path) {
        alert('Content folder is not set.');
        return;
    }

    try {
        await api.openContentFolderAPI(state.appSettings.content_path);
    } catch (error) {
        console.error('Open content folder error:', error);
    }
}

/**
 * Save default folder name
 */
export async function saveDefaultFolder() {
    const input = document.getElementById('defaultFolderInput');
    const newName = input.value.trim();

    if (!newName) {
        alert('Please enter a folder name.');
        return;
    }

    try {
        const result = await saveSettings({ default_folder: newName });
        if (result.success) {
            // Rename the default folder if it exists
            const data = await api.renameDefaultFolderAPI(newName);
            if (data.success) {
                loadFolders();
                updateDownloadFolderSelect();
            }
        }
    } catch (error) {
        console.error('Save default folder error:', error);
    }
}

/**
 * Toggle developer mode (requires app restart)
 */
export async function toggleDeveloperMode() {
    const toggle = document.getElementById('developerModeToggle');
    const enabled = toggle.checked;

    try {
        // Save setting
        await saveSettings({ developer_mode: enabled });

        // Show restart notice
        alert(enabled
            ? 'Developer Mode enabled. Restart the app to open DevTools (F12).'
            : 'Developer Mode disabled. Restart the app to apply.');
    } catch (error) {
        console.error('Toggle developer mode error:', error);
    }
}
