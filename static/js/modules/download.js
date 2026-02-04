/**
 * Download Page Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { isValidUrl, detectPlatform } from './utils.js';

// DOM element references
let urlInput, fetchBtn, urlError, loadingSpinner, videoInfo, progressSection, completeSection;

/**
 * Initialize DOM references
 */
export function initDownloadElements() {
    urlInput = document.getElementById('urlInput');
    fetchBtn = document.getElementById('fetchBtn');
    urlError = document.getElementById('urlError');
    loadingSpinner = document.getElementById('loadingSpinner');
    videoInfo = document.getElementById('videoInfo');
    progressSection = document.getElementById('progressSection');
    completeSection = document.getElementById('completeSection');
}

/**
 * Fetch video info from URL
 */
export async function fetchVideoInfo() {
    const url = urlInput.value.trim();

    if (!url) {
        showError('URL을 입력해주세요.');
        return;
    }

    if (!isValidUrl(url)) {
        showError('유효한 동영상 URL을 입력해주세요.');
        return;
    }

    hideError();
    showLoading();
    hideVideoInfo();
    hideComplete();

    try {
        const data = await api.getVideoInfo(url);

        if (data.success) {
            state.setCurrentVideoInfo(data);
            displayVideoInfo(data);
        } else {
            showError(data.error || '동영상 정보를 가져올 수 없습니다.');
        }
    } catch (error) {
        showError('서버 연결 오류가 발생했습니다.');
        console.error(error);
    } finally {
        hideLoading();
    }
}

/**
 * Display video info in UI
 * @param {object} info - Video info object
 */
export function displayVideoInfo(info) {
    // Use proxy for external thumbnails to avoid CORS issues
    const thumbnailUrl = info.thumbnail
        ? `/api/proxy-thumbnail?url=${encodeURIComponent(info.thumbnail)}`
        : '/static/img/placeholder.png';
    document.getElementById('videoThumbnail').src = thumbnailUrl;
    document.getElementById('videoTitle').textContent = info.title;
    document.getElementById('videoChannel').textContent = info.channel;
    document.getElementById('videoDuration').textContent = info.duration_str;

    // Generate resolution buttons
    const resolutionContainer = document.getElementById('resolutionButtons');
    resolutionContainer.innerHTML = '';

    const defaultResolutions = ['2160p', '1440p', '1080p', '720p', '480p', '360p'];
    const availableResolutions = info.formats.map(f => f.resolution);

    defaultResolutions.forEach(res => {
        const isAvailable = availableResolutions.includes(res);
        const btn = document.createElement('button');
        btn.className = `btn btn-outline-secondary resolution-btn ${res === '720p' ? 'active' : ''}`;
        btn.dataset.resolution = res;
        btn.textContent = res;

        if (!isAvailable) {
            btn.disabled = true;
            btn.title = '이 해상도는 사용할 수 없습니다';
        }

        btn.addEventListener('click', function() {
            if (!this.disabled) {
                document.querySelectorAll('.resolution-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                state.setSelectedResolution(this.dataset.resolution);
            }
        });

        resolutionContainer.appendChild(btn);
    });

    // Set default resolution to highest available
    const highestAvailable = availableResolutions[0] || '720p';
    if (availableResolutions.includes(highestAvailable)) {
        state.setSelectedResolution(highestAvailable);
        document.querySelectorAll('.resolution-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.resolution === highestAvailable);
        });
    }

    videoInfo.classList.remove('d-none');
    videoInfo.classList.add('fade-in');

    // Auto-select audio tab for audio-only platforms (SoundCloud, etc.)
    const platform = info.platform || detectPlatform(info.url);
    const audioOnlyPlatforms = ['soundcloud'];

    if (audioOnlyPlatforms.includes(platform)) {
        // Switch to audio tab
        const audioTab = document.getElementById('audio-tab');
        const videoTab = document.getElementById('video-tab');
        const audioOptions = document.getElementById('audioOptions');
        const videoOptions = document.getElementById('videoOptions');

        if (audioTab && videoTab && audioOptions && videoOptions) {
            // Activate audio tab
            videoTab.classList.remove('active');
            audioTab.classList.add('active');
            videoTab.setAttribute('aria-selected', 'false');
            audioTab.setAttribute('aria-selected', 'true');

            // Show audio options, hide video options
            videoOptions.classList.remove('show', 'active');
            audioOptions.classList.add('show', 'active');
        }
    }
}

/**
 * Start download
 * @param {string} type - 'video' or 'audio'
 */
export async function startDownload(type) {
    if (!state.currentVideoInfo) return;

    // Get selected folder from dropdown
    const folderSelect = document.getElementById('downloadFolderSelect');
    const folder = folderSelect ? folderSelect.value : '00_Inbox';

    const options = {
        url: state.currentVideoInfo.url,
        type: type,
        resolution: state.selectedResolution,
        bitrate: state.selectedBitrate,
        folder: folder
    };

    try {
        const data = await api.startVideoDownload(options);

        if (data.success) {
            showProgress();
            startProgressPolling();
        } else {
            showError(data.error || '다운로드 시작에 실패했습니다.');
        }
    } catch (error) {
        showError('서버 연결 오류가 발생했습니다.');
        console.error(error);
    }
}

/**
 * Start polling for download progress
 */
export function startProgressPolling() {
    const interval = setInterval(async () => {
        try {
            const data = await api.getDownloadProgress();

            updateProgress(data);

            if (data.status === 'completed') {
                stopProgressPolling();
                state.setLastFilepath(data.filepath);
                showComplete(data.filename);
            } else if (data.status === 'error') {
                stopProgressPolling();
                showError(data.message || '다운로드 중 오류가 발생했습니다.');
                hideProgress();
            }
        } catch (error) {
            console.error('Progress polling error:', error);
        }
    }, 500);

    state.setProgressInterval(interval);
}

/**
 * Stop polling for download progress
 */
export function stopProgressPolling() {
    if (state.progressInterval) {
        clearInterval(state.progressInterval);
        state.setProgressInterval(null);
    }
}

/**
 * Update progress UI
 * @param {object} data - Progress data
 */
export function updateProgress(data) {
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const progressStatus = document.getElementById('progressStatus');
    const progressFilename = document.getElementById('progressFilename');
    const progressSpeed = document.getElementById('progressSpeed');

    const percent = data.progress || 0;
    progressBar.style.width = percent + '%';
    progressPercent.textContent = percent + '%';

    if (data.status === 'downloading') {
        progressStatus.textContent = '다운로드 중...';
    } else if (data.status === 'processing') {
        progressStatus.textContent = '파일 처리 중...';
        progressBar.classList.remove('progress-bar-animated');
    } else if (data.status === 'starting') {
        progressStatus.textContent = '다운로드 준비 중...';
    }

    if (data.filename) {
        progressFilename.textContent = data.filename;
    }

    if (data.speed) {
        progressSpeed.textContent = data.speed;
    }
}

/**
 * Cancel current download
 */
export async function cancelDownload() {
    try {
        await api.cancelVideoDownload();
        stopProgressPolling();
        hideProgress();
        showError('다운로드가 취소되었습니다.');
    } catch (error) {
        console.error('Cancel error:', error);
    }
}

/**
 * Reset UI to initial state
 */
export function resetUI() {
    urlInput.value = '';
    state.setCurrentVideoInfo(null);
    hideVideoInfo();
    hideProgress();
    hideComplete();
    hideError();
    urlInput.focus();
}

/**
 * Open folder containing downloaded file
 */
export async function openFolder() {
    try {
        await api.openFolderAPI(state.lastFilepath);
    } catch (error) {
        console.error('Open folder error:', error);
    }
}

/**
 * Save link only (without downloading)
 */
export async function saveLinkOnly() {
    if (!state.currentVideoInfo) return;

    const folderSelect = document.getElementById('downloadFolderSelect');
    const folder = folderSelect ? folderSelect.value : state.appSettings.default_folder;

    try {
        const data = await api.saveLinkAPI(state.currentVideoInfo.url, folder);
        if (data.success) {
            // Show completion
            document.getElementById('completeFilename').textContent = '링크가 저장되었습니다';
            completeSection.classList.remove('d-none');
            videoInfo.classList.add('d-none');
        } else {
            showError(data.error || '링크 저장에 실패했습니다.');
        }
    } catch (error) {
        showError('서버 연결 오류가 발생했습니다.');
        console.error(error);
    }
}

// UI Helper functions
function showLoading() {
    loadingSpinner.classList.remove('d-none');
}

function hideLoading() {
    loadingSpinner.classList.add('d-none');
}

function showVideoInfo() {
    videoInfo.classList.remove('d-none');
}

function hideVideoInfo() {
    videoInfo.classList.add('d-none');
}

function showProgress() {
    progressSection.classList.remove('d-none');
    progressSection.classList.add('fade-in');
    completeSection.classList.add('d-none');

    // Reset progress bar
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressBar').classList.add('progress-bar-animated');
    document.getElementById('progressPercent').textContent = '0%';
    document.getElementById('progressStatus').textContent = '다운로드 준비 중...';
    document.getElementById('progressFilename').textContent = '';
    document.getElementById('progressSpeed').textContent = '';
}

function hideProgress() {
    progressSection.classList.add('d-none');
}

function showComplete(filename) {
    progressSection.classList.add('d-none');
    completeSection.classList.remove('d-none');
    completeSection.classList.add('fade-in');
    document.getElementById('completeFilename').textContent = filename;
}

function hideComplete() {
    completeSection.classList.add('d-none');
}

export function showError(message) {
    urlError.textContent = message;
    urlError.classList.remove('d-none');
}

function hideError() {
    urlError.classList.add('d-none');
}

// Export UI helpers for external use
export { hideError, hideComplete, hideProgress, hideVideoInfo };
