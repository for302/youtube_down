/**
 * Update System Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { showToast } from './utils.js';
import { openExternalLink } from './player.js';

/**
 * Initialize update system
 */
export function initUpdateSystem() {
    // Check update button in settings
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', () => {
            checkForUpdates(true);
        });
    }

    // Start update download button
    const startUpdateBtn = document.getElementById('startUpdateBtn');
    if (startUpdateBtn) {
        startUpdateBtn.addEventListener('click', startUpdateDownload);
    }

    // Install update button
    const installUpdateBtn = document.getElementById('installUpdateBtn');
    if (installUpdateBtn) {
        installUpdateBtn.addEventListener('click', installUpdate);
    }

    // Load current version
    loadCurrentVersion();
}

/**
 * Load current version from server
 */
export async function loadCurrentVersion() {
    try {
        const data = await api.getVersion();
        if (data.success) {
            const versionText = document.getElementById('currentVersionText');
            if (versionText) {
                versionText.textContent = `v${data.version}`;
            }
        }
    } catch (error) {
        console.error('Load version error:', error);
    }
}

/**
 * Check for updates
 * @param {boolean} showNoUpdateMessage - Whether to show message if no update
 */
export async function checkForUpdates(showNoUpdateMessage = false) {
    const updateStatus = document.getElementById('updateStatus');
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');

    if (checkUpdateBtn) {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1 spin"></i>Checking...';
    }

    if (updateStatus) {
        updateStatus.textContent = 'Checking for updates...';
    }

    try {
        const data = await api.checkUpdateAPI();

        if (data.success) {
            if (data.has_update) {
                state.setUpdateInfo(data);
                showUpdateModal(data);
                if (updateStatus) {
                    updateStatus.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>Update available!</span>';
                }
            } else {
                if (showNoUpdateMessage) {
                    if (updateStatus) {
                        updateStatus.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i>You have the latest version</span>';
                    }
                    showToast('You are using the latest version', 'success');
                } else if (updateStatus) {
                    updateStatus.textContent = '';
                }
            }
        } else {
            if (showNoUpdateMessage && updateStatus) {
                updateStatus.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>Check failed</span>';
            }
            console.error('Update check failed:', data.error);
        }
    } catch (error) {
        console.error('Check update error:', error);
        if (showNoUpdateMessage && updateStatus) {
            updateStatus.innerHTML = '<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>Connection error</span>';
        }
    } finally {
        if (checkUpdateBtn) {
            checkUpdateBtn.disabled = false;
            checkUpdateBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Check for Updates';
        }
    }
}

/**
 * Show update modal
 * @param {object} data - Update data
 */
export function showUpdateModal(data) {
    // Reset modal state
    document.getElementById('updateInfoSection').classList.remove('d-none');
    document.getElementById('updateDownloadSection').classList.add('d-none');
    document.getElementById('updateCompleteSection').classList.add('d-none');

    // Show/hide buttons
    document.getElementById('updateLaterBtn').classList.remove('d-none');
    document.getElementById('viewReleaseBtn').classList.remove('d-none');
    document.getElementById('startUpdateBtn').classList.remove('d-none');
    document.getElementById('installUpdateBtn').classList.add('d-none');
    document.getElementById('updateModalClose').classList.remove('d-none');

    // Populate data
    document.getElementById('updateCurrentVersion').textContent = `v${data.current}`;
    document.getElementById('updateLatestVersion').textContent = `v${data.latest}`;
    document.getElementById('releaseNotes').textContent = data.release_notes || 'No release notes available.';

    // Set release URL
    const viewReleaseBtn = document.getElementById('viewReleaseBtn');
    if (data.release_url) {
        viewReleaseBtn.href = data.release_url;
        viewReleaseBtn.onclick = (e) => {
            e.preventDefault();
            openExternalLink(data.release_url);
        };
    }

    // Disable download button if no download URL
    const startUpdateBtn = document.getElementById('startUpdateBtn');
    if (!data.download_url) {
        startUpdateBtn.disabled = true;
        startUpdateBtn.title = 'No installer available for download';
    } else {
        startUpdateBtn.disabled = false;
        startUpdateBtn.title = '';
    }

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('updateModal'));
    modal.show();
}

/**
 * Start update download
 */
export async function startUpdateDownload() {
    if (!state.updateInfo || !state.updateInfo.download_url) {
        showToast('Download URL not available', 'error');
        return;
    }

    // Switch to download view
    document.getElementById('updateInfoSection').classList.add('d-none');
    document.getElementById('updateDownloadSection').classList.remove('d-none');
    document.getElementById('updateCompleteSection').classList.add('d-none');

    // Hide buttons during download
    document.getElementById('updateLaterBtn').classList.add('d-none');
    document.getElementById('viewReleaseBtn').classList.add('d-none');
    document.getElementById('startUpdateBtn').classList.add('d-none');
    document.getElementById('updateModalClose').classList.add('d-none');

    // Start download
    try {
        const data = await api.downloadUpdateAPI(
            state.updateInfo.download_url,
            state.updateInfo.asset_name
        );
        if (data.success) {
            startUpdateProgressPolling();
        } else {
            showToast(data.error || 'Failed to start download', 'error');
            resetUpdateModal();
        }
    } catch (error) {
        console.error('Start update download error:', error);
        showToast('Failed to start download', 'error');
        resetUpdateModal();
    }
}

/**
 * Start polling for update download progress
 */
export function startUpdateProgressPolling() {
    const interval = setInterval(async () => {
        try {
            const data = await api.getUpdateProgress();

            updateUpdateProgress(data);

            if (data.status === 'completed') {
                stopUpdateProgressPolling();
                showUpdateComplete();
            } else if (data.status === 'error') {
                stopUpdateProgressPolling();
                showToast(data.message || 'Download failed', 'error');
                resetUpdateModal();
            }
        } catch (error) {
            console.error('Update progress polling error:', error);
        }
    }, 500);

    state.setUpdateProgressInterval(interval);
}

/**
 * Stop polling for update progress
 */
export function stopUpdateProgressPolling() {
    if (state.updateProgressInterval) {
        clearInterval(state.updateProgressInterval);
        state.setUpdateProgressInterval(null);
    }
}

/**
 * Update progress UI
 * @param {object} data - Progress data
 */
function updateUpdateProgress(data) {
    const progressBar = document.getElementById('updateProgressBar');
    const progressPercent = document.getElementById('updateDownloadPercent');
    const progressMessage = document.getElementById('updateDownloadMessage');

    const percent = data.progress || 0;
    progressBar.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;

    if (data.message) {
        progressMessage.textContent = data.message;
    }
}

/**
 * Show update complete view
 */
function showUpdateComplete() {
    document.getElementById('updateInfoSection').classList.add('d-none');
    document.getElementById('updateDownloadSection').classList.add('d-none');
    document.getElementById('updateCompleteSection').classList.remove('d-none');

    // Show install button
    document.getElementById('updateLaterBtn').classList.remove('d-none');
    document.getElementById('viewReleaseBtn').classList.add('d-none');
    document.getElementById('startUpdateBtn').classList.add('d-none');
    document.getElementById('installUpdateBtn').classList.remove('d-none');
    document.getElementById('updateModalClose').classList.remove('d-none');
}

/**
 * Reset update modal to initial state
 */
function resetUpdateModal() {
    document.getElementById('updateInfoSection').classList.remove('d-none');
    document.getElementById('updateDownloadSection').classList.add('d-none');
    document.getElementById('updateCompleteSection').classList.add('d-none');

    document.getElementById('updateLaterBtn').classList.remove('d-none');
    document.getElementById('viewReleaseBtn').classList.remove('d-none');
    document.getElementById('startUpdateBtn').classList.remove('d-none');
    document.getElementById('installUpdateBtn').classList.add('d-none');
    document.getElementById('updateModalClose').classList.remove('d-none');

    // Reset progress
    document.getElementById('updateProgressBar').style.width = '0%';
    document.getElementById('updateDownloadPercent').textContent = '0%';
    document.getElementById('updateDownloadMessage').textContent = '';
}

/**
 * Install update
 */
export async function installUpdate() {
    const installBtn = document.getElementById('installUpdateBtn');
    installBtn.disabled = true;
    installBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1 spin"></i>Installing...';

    try {
        const data = await api.installUpdateAPI();
        if (!data.success) {
            showToast(data.error || 'Failed to launch installer', 'error');
            installBtn.disabled = false;
            installBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Install & Restart';
        }
        // If success, app will exit and installer will launch
    } catch (error) {
        console.error('Install update error:', error);
        showToast('Failed to launch installer', 'error');
        installBtn.disabled = false;
        installBtn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Install & Restart';
    }
}
