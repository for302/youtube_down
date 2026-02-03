/**
 * YouTube Downloader Frontend Logic
 */

// State
let currentVideoInfo = null;
let selectedResolution = '720p';
let selectedBitrate = '192';
let selectedFolder = '00_Inbox';
let progressInterval = null;
let lastFilepath = '';
let videoLibrary = [];
let currentPlayingVideo = null;
let allTags = [];
let selectedSuggestionIndex = -1;

// Folder Management State
let folders = [];
let currentFolder = null;  // null means "All Folders"
let contextMenuTarget = null;
let folderToRename = null;

// Settings State
let appSettings = {
    content_path: '',
    theme: 'light',
    default_folder: '00_Inbox'
};

// DOM Elements
const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const urlError = document.getElementById('urlError');
const loadingSpinner = document.getElementById('loadingSpinner');
const videoInfo = document.getElementById('videoInfo');
const progressSection = document.getElementById('progressSection');
const completeSection = document.getElementById('completeSection');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initEventListeners();
    initNavigation();
    loadDownloadPath();
    loadSettings();
    initSettingsModal();
    initFolderManagement();
    initContextMenu();
    initDragAndDrop();
});

function initNavigation() {
    // Sidebar menu navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            switchPage(page);
        });
    });
}

function switchPage(pageName) {
    // Update menu active state
    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Update page visibility
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });

    // Show/hide sidebar folders
    const sidebarFolders = document.getElementById('sidebarFolders');
    if (pageName === 'download') {
        document.getElementById('downloadPage').classList.add('active');
        updateDownloadFolderSelect();
        sidebarFolders.classList.remove('show');
    } else if (pageName === 'library') {
        document.getElementById('libraryPage').classList.add('active');
        sidebarFolders.classList.add('show');
        loadFolders();
        loadVideoLibrary();
    }
}

function initEventListeners() {
    // Fetch button
    fetchBtn.addEventListener('click', fetchVideoInfo);

    // URL input - Enter key
    urlInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            fetchVideoInfo();
        }
    });

    // URL input - Paste detection
    urlInput.addEventListener('paste', function() {
        setTimeout(fetchVideoInfo, 100);
    });

    // Download buttons
    document.getElementById('downloadVideoBtn').addEventListener('click', () => startDownload('video'));
    document.getElementById('downloadAudioBtn').addEventListener('click', () => startDownload('audio'));

    // Cancel button
    document.getElementById('cancelBtn').addEventListener('click', cancelDownload);

    // Open folder button
    document.getElementById('openFolderBtn').addEventListener('click', openFolder);

    // Download more button
    document.getElementById('downloadMoreBtn').addEventListener('click', resetUI);

    // Quality buttons (MP3)
    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedBitrate = this.dataset.bitrate;
        });
    });

    // Select folder button
    document.getElementById('selectFolderBtn').addEventListener('click', selectFolder);

    // Refresh library button
    document.getElementById('refreshLibraryBtn').addEventListener('click', loadVideoLibrary);
}

async function fetchVideoInfo() {
    const url = urlInput.value.trim();

    if (!url) {
        showError('URL을 입력해주세요.');
        return;
    }

    if (!isValidYouTubeUrl(url)) {
        showError('유효한 YouTube URL을 입력해주세요.');
        return;
    }

    hideError();
    showLoading();
    hideVideoInfo();

    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        });

        const data = await response.json();

        if (data.success) {
            currentVideoInfo = data;
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

function displayVideoInfo(info) {
    document.getElementById('videoThumbnail').src = info.thumbnail;
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
                selectedResolution = this.dataset.resolution;
            }
        });

        resolutionContainer.appendChild(btn);
    });

    // Set default resolution to highest available
    const highestAvailable = availableResolutions[0] || '720p';
    if (availableResolutions.includes(highestAvailable)) {
        selectedResolution = highestAvailable;
        document.querySelectorAll('.resolution-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.resolution === highestAvailable);
        });
    }

    videoInfo.classList.remove('d-none');
    videoInfo.classList.add('fade-in');
}

async function startDownload(type) {
    if (!currentVideoInfo) return;

    // Get selected folder from dropdown
    const folderSelect = document.getElementById('downloadFolderSelect');
    const folder = folderSelect ? folderSelect.value : '00_Inbox';

    const options = {
        url: currentVideoInfo.url,
        type: type,
        resolution: selectedResolution,
        bitrate: selectedBitrate,
        folder: folder
    };

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options)
        });

        const data = await response.json();

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

function startProgressPolling() {
    progressInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/progress');
            const data = await response.json();

            updateProgress(data);

            if (data.status === 'completed') {
                stopProgressPolling();
                lastFilepath = data.filepath;
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
}

function stopProgressPolling() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function updateProgress(data) {
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

async function cancelDownload() {
    try {
        await fetch('/api/cancel', { method: 'POST' });
        stopProgressPolling();
        hideProgress();
        showError('다운로드가 취소되었습니다.');
    } catch (error) {
        console.error('Cancel error:', error);
    }
}

async function openFolder() {
    try {
        await fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filepath: lastFilepath })
        });
    } catch (error) {
        console.error('Open folder error:', error);
    }
}

async function selectFolder() {
    // Try PyWebView API first
    if (window.pywebview && window.pywebview.api) {
        const path = await window.pywebview.api.select_folder();
        if (path) {
            document.getElementById('downloadPath').value = path;
        }
    } else {
        // Fallback: prompt user
        const path = prompt('다운로드 폴더 경로를 입력하세요:');
        if (path) {
            try {
                const response = await fetch('/api/set-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: path })
                });
                const data = await response.json();
                if (data.success) {
                    document.getElementById('downloadPath').value = path;
                } else {
                    alert(data.error || '유효하지 않은 경로입니다.');
                }
            } catch (error) {
                console.error('Set path error:', error);
            }
        }
    }
}

async function loadDownloadPath() {
    try {
        const response = await fetch('/api/get-path');
        const data = await response.json();
        if (data.success) {
            document.getElementById('downloadPath').value = data.path;
        }
    } catch (error) {
        console.error('Load path error:', error);
    }
}

function resetUI() {
    urlInput.value = '';
    currentVideoInfo = null;
    hideVideoInfo();
    hideProgress();
    hideComplete();
    hideError();
    urlInput.focus();
}

// ===== Library Functions =====

async function loadVideoLibrary() {
    try {
        let url = '/api/library';
        if (currentFolder) {
            url += `?folder=${encodeURIComponent(currentFolder)}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        if (data.success) {
            videoLibrary = data.videos;
            renderVideoList();
        }
    } catch (error) {
        console.error('Load library error:', error);
    }
}

function renderVideoList() {
    const videoListEl = document.getElementById('videoList');
    const emptyState = document.getElementById('emptyLibrary');

    if (videoLibrary.length === 0) {
        emptyState.classList.remove('d-none');
        // Clear any existing video items
        videoListEl.querySelectorAll('.video-item').forEach(el => el.remove());
        return;
    }

    emptyState.classList.add('d-none');

    // Clear and rebuild list
    videoListEl.innerHTML = '';

    videoLibrary.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.dataset.id = video.id;
        item.dataset.folder = video.folder || '';
        item.dataset.filename = video.filename || '';
        item.draggable = true;

        // Show folder badge when viewing all folders
        const folderBadge = !currentFolder && video.folder
            ? `<div class="video-item-folder"><i class="bi bi-folder"></i>${escapeHtml(video.folder)}</div>`
            : '';

        item.innerHTML = `
            <div class="video-item-thumb">
                <img src="${video.thumbnail || '/static/img/placeholder.png'}" alt="Thumbnail"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22><rect fill=%22%23ccc%22 width=%22120%22 height=%2268%22/></svg>'">
                <span class="duration">${video.duration_str || ''}</span>
            </div>
            <div class="video-item-info">
                <div class="video-item-title">${escapeHtml(video.title)}</div>
                <div class="video-item-channel">${escapeHtml(video.channel || '')}</div>
                ${folderBadge}
            </div>
        `;

        item.addEventListener('click', () => playVideo(video));
        item.addEventListener('contextmenu', (e) => showVideoContextMenu(e, video));

        videoListEl.appendChild(item);
    });
}

async function playVideo(video) {
    currentPlayingVideo = video;

    // Update active state in list
    document.querySelectorAll('.video-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === video.id);
    });

    // Show player container
    document.getElementById('playerPlaceholder').classList.add('d-none');
    const playerContainer = document.getElementById('playerContainer');
    playerContainer.classList.remove('d-none');

    // Set video source - use folder-aware endpoint if folder is available
    const videoPlayer = document.getElementById('videoPlayer');
    if (video.folder) {
        videoPlayer.src = `/api/videos/${encodeURIComponent(video.folder)}/${encodeURIComponent(video.id)}`;
    } else {
        videoPlayer.src = `/api/video/${encodeURIComponent(video.id)}`;
    }
    videoPlayer.load();

    // Set video details
    document.getElementById('playerTitle').textContent = video.title;

    const channelLink = document.getElementById('playerChannel');
    channelLink.querySelector('span').textContent = video.channel || 'Unknown';
    if (video.channel_url) {
        channelLink.href = video.channel_url;
        channelLink.onclick = (e) => {
            e.preventDefault();
            openExternalLink(video.channel_url);
        };
    }

    document.getElementById('playerDuration').innerHTML =
        `<i class="bi bi-clock me-1"></i>${video.duration_str || ''}`;

    const youtubeLink = document.getElementById('playerYoutubeLink');
    if (video.url) {
        youtubeLink.href = video.url;
        youtubeLink.classList.remove('d-none');
        youtubeLink.onclick = (e) => {
            e.preventDefault();
            openExternalLink(video.url);
        };
    } else {
        youtubeLink.classList.add('d-none');
    }

    const description = document.getElementById('playerDescription');
    if (video.description) {
        description.textContent = video.description;
        description.classList.remove('d-none');
    } else {
        description.classList.add('d-none');
    }

    // Render tags
    renderTags(video.tags || []);

    // Load all tags for autocomplete
    loadAllTags();
}

function openExternalLink(url) {
    // Try PyWebView API first
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_url) {
        window.pywebview.api.open_url(url);
    } else {
        // Fallback: open in new window
        window.open(url, '_blank');
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

function showError(message) {
    urlError.textContent = message;
    urlError.classList.remove('d-none');
}

function hideError() {
    urlError.classList.add('d-none');
}

// Utility functions
function isValidYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/live\/[\w-]+/,
        /^(https?:\/\/)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/
    ];

    return patterns.some(pattern => pattern.test(url));
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Tag Functions =====

async function loadAllTags() {
    try {
        const response = await fetch('/api/tags');
        const data = await response.json();
        if (data.success) {
            allTags = data.tags;
        }
    } catch (error) {
        console.error('Load tags error:', error);
    }
}

function renderTags(tags) {
    const container = document.getElementById('tagsContainer');
    container.innerHTML = '';

    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.innerHTML = `
            ${escapeHtml(tag)}
            <span class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</span>
        `;

        tagEl.querySelector('.tag-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeTag(tag);
        });

        container.appendChild(tagEl);
    });
}

async function addTag(tag) {
    if (!currentPlayingVideo || !tag.trim()) return;

    const currentTags = currentPlayingVideo.tags || [];
    if (currentTags.includes(tag.trim())) return;

    const newTags = [...currentTags, tag.trim()];

    try {
        const response = await fetch(`/api/tags/${encodeURIComponent(currentPlayingVideo.id)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: newTags })
        });

        const data = await response.json();
        if (data.success) {
            currentPlayingVideo.tags = newTags;
            renderTags(newTags);

            // Update allTags if this is a new tag
            if (!allTags.includes(tag.trim())) {
                allTags.push(tag.trim());
                allTags.sort();
            }
        }
    } catch (error) {
        console.error('Add tag error:', error);
    }
}

async function removeTag(tag) {
    if (!currentPlayingVideo) return;

    const currentTags = currentPlayingVideo.tags || [];
    const newTags = currentTags.filter(t => t !== tag);

    try {
        const response = await fetch(`/api/tags/${encodeURIComponent(currentPlayingVideo.id)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: newTags })
        });

        const data = await response.json();
        if (data.success) {
            currentPlayingVideo.tags = newTags;
            renderTags(newTags);
        }
    } catch (error) {
        console.error('Remove tag error:', error);
    }
}

function showTagSuggestions(query) {
    const suggestions = document.getElementById('tagSuggestions');
    const currentTags = currentPlayingVideo?.tags || [];

    if (!query.trim()) {
        suggestions.classList.add('d-none');
        selectedSuggestionIndex = -1;
        return;
    }

    const filtered = allTags.filter(tag =>
        tag.toLowerCase().includes(query.toLowerCase()) &&
        !currentTags.includes(tag)
    );

    if (filtered.length === 0) {
        suggestions.classList.add('d-none');
        selectedSuggestionIndex = -1;
        return;
    }

    suggestions.innerHTML = '';
    filtered.slice(0, 10).forEach((tag, index) => {
        const item = document.createElement('div');
        item.className = 'tag-suggestion-item';
        item.textContent = tag;
        item.addEventListener('click', () => {
            addTag(tag);
            document.getElementById('tagInput').value = '';
            suggestions.classList.add('d-none');
            selectedSuggestionIndex = -1;
        });
        suggestions.appendChild(item);
    });

    suggestions.classList.remove('d-none');
    selectedSuggestionIndex = -1;
}

function initTagInput() {
    const tagInput = document.getElementById('tagInput');
    const suggestions = document.getElementById('tagSuggestions');

    if (!tagInput) return;

    tagInput.addEventListener('input', (e) => {
        showTagSuggestions(e.target.value);
    });

    tagInput.addEventListener('keydown', (e) => {
        const items = suggestions.querySelectorAll('.tag-suggestion-item');

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
            updateSuggestionSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            updateSuggestionSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
                items[selectedSuggestionIndex].click();
            } else if (tagInput.value.trim()) {
                addTag(tagInput.value.trim());
                tagInput.value = '';
                suggestions.classList.add('d-none');
            }
        } else if (e.key === 'Escape') {
            suggestions.classList.add('d-none');
            selectedSuggestionIndex = -1;
        }
    });

    tagInput.addEventListener('blur', () => {
        // Delay to allow click on suggestion
        setTimeout(() => {
            suggestions.classList.add('d-none');
            selectedSuggestionIndex = -1;
        }, 200);
    });
}

function updateSuggestionSelection(items) {
    items.forEach((item, index) => {
        item.classList.toggle('active', index === selectedSuggestionIndex);
    });
}

// Initialize tag input when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initTagInput();
});

// ===== Settings Functions =====

async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.success) {
            appSettings = data.settings;
            applySettings();

            // Show setup modal if content folder is not configured
            if (!appSettings.content_path) {
                showInitialSetupModal();
            }
        }
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

function showInitialSetupModal() {
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
            <strong>Welcome!</strong> Please set the content folder to start using the app.
        `;
        modalBody.insertBefore(setupAlert, modalBody.firstChild);
    }

    // Hide close button until configured
    const closeBtn = modalEl.querySelector('.btn-close');
    const footerCloseBtn = modalEl.querySelector('.modal-footer .btn-secondary');
    if (closeBtn) closeBtn.classList.add('d-none');
    if (footerCloseBtn) footerCloseBtn.classList.add('d-none');

    modal.show();

    // Listen for content path changes to enable closing
    const checkConfigured = () => {
        if (appSettings.content_path) {
            if (closeBtn) closeBtn.classList.remove('d-none');
            if (footerCloseBtn) footerCloseBtn.classList.remove('d-none');
            if (setupAlert) setupAlert.remove();
        }
    };

    // Check periodically
    const checkInterval = setInterval(() => {
        checkConfigured();
        if (appSettings.content_path) {
            clearInterval(checkInterval);
        }
    }, 500);
}

async function saveSettings(settings) {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });

        const data = await response.json();
        if (data.success) {
            appSettings = data.settings;
            applySettings();
        }
        return data;
    } catch (error) {
        console.error('Save settings error:', error);
        return { success: false };
    }
}

function applySettings() {
    // Apply theme
    document.documentElement.setAttribute('data-theme', appSettings.theme || 'light');

    // Update theme toggle buttons
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === appSettings.theme);
    });

    // Update content path input
    const contentPathInput = document.getElementById('contentPathInput');
    if (contentPathInput) {
        contentPathInput.value = appSettings.content_path || '';
    }
}

function initSettingsModal() {
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
}

async function selectContentFolder() {
    // Try PyWebView API first
    if (window.pywebview && window.pywebview.api && window.pywebview.api.select_content_folder) {
        const path = await window.pywebview.api.select_content_folder();
        if (path) {
            document.getElementById('contentPathInput').value = path;
            appSettings.content_path = path;
            loadFolders();
            updateDownloadFolderSelect();
        }
    } else {
        // Fallback: prompt user
        const path = prompt('Enter content folder path:');
        if (path) {
            const result = await saveSettings({ content_path: path });
            if (result.success) {
                loadFolders();
                updateDownloadFolderSelect();
            } else {
                alert('Invalid path.');
            }
        }
    }
}

// ===== Folder Management Functions =====

async function loadFolders() {
    try {
        const response = await fetch('/api/folders');
        const data = await response.json();

        if (data.success) {
            folders = data.folders;
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

function renderFolderList() {
    const folderListEl = document.getElementById('sidebarFolderList');
    if (!folderListEl) return;

    folderListEl.innerHTML = '';

    // Add "All Folders" option
    const allItem = document.createElement('div');
    allItem.className = `sidebar-folder-item all-folders ${currentFolder === null ? 'active' : ''}`;
    allItem.innerHTML = `
        <i class="bi bi-collection"></i>
        <span class="folder-name">All</span>
    `;
    allItem.addEventListener('click', () => selectFolderItem(null));
    folderListEl.appendChild(allItem);

    // Add each folder
    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = `sidebar-folder-item ${currentFolder === folder.name ? 'active' : ''}`;
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

function selectFolderItem(folderName) {
    currentFolder = folderName;
    renderFolderList();
    loadVideoLibrary();
}

function initFolderManagement() {
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

async function createFolder() {
    const input = document.getElementById('newFolderInput');
    const name = input.value.trim();

    if (!name) return;

    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await response.json();
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

async function renameFolder(oldName) {
    folderToRename = oldName;
    const modal = new bootstrap.Modal(document.getElementById('renameFolderModal'));
    document.getElementById('renameFolderInput').value = oldName;
    modal.show();
}

async function confirmRenameFolder() {
    if (!folderToRename) return;

    const input = document.getElementById('renameFolderInput');
    const newName = input.value.trim();

    if (!newName || newName === folderToRename) {
        bootstrap.Modal.getInstance(document.getElementById('renameFolderModal')).hide();
        return;
    }

    try {
        const response = await fetch(`/api/folders/${encodeURIComponent(folderToRename)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName })
        });

        const data = await response.json();
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('renameFolderModal')).hide();
            if (currentFolder === folderToRename) {
                currentFolder = data.new_name;
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

    folderToRename = null;
}

async function deleteFolder(name) {
    if (!confirm(`Delete folder "${name}"? Videos will be moved to 00_Inbox.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/folders/${encodeURIComponent(name)}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (data.success) {
            if (currentFolder === name) {
                currentFolder = null;
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

function updateDownloadFolderSelect() {
    const select = document.getElementById('downloadFolderSelect');
    if (!select) return;

    select.innerHTML = '<option value="00_Inbox" selected>00_Inbox (Default)</option>';

    folders.forEach(folder => {
        if (folder.name !== '00_Inbox') {
            const option = document.createElement('option');
            option.value = folder.name;
            option.textContent = folder.name;
            select.appendChild(option);
        }
    });
}

// ===== Context Menu Functions =====

function initContextMenu() {
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

function hideContextMenus() {
    document.getElementById('videoContextMenu')?.classList.add('d-none');
    document.getElementById('folderContextMenu')?.classList.add('d-none');
}

function showVideoContextMenu(e, video) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenus();

    contextMenuTarget = video;

    const menu = document.getElementById('videoContextMenu');
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

function showFolderContextMenu(e, folderName) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenus();

    contextMenuTarget = folderName;

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

function handleVideoContextAction(action) {
    hideContextMenus();

    if (!contextMenuTarget) return;
    const video = contextMenuTarget;

    switch (action) {
        case 'play':
            playVideo(video);
            break;
        case 'move':
            showMoveVideoModal(video);
            break;
        case 'open-location':
            openFileLocation(video);
            break;
        case 'youtube':
            if (video.url) {
                openExternalLink(video.url);
            }
            break;
        case 'delete':
            deleteVideo(video);
            break;
    }

    contextMenuTarget = null;
}

function handleFolderContextAction(action) {
    hideContextMenus();

    if (!contextMenuTarget) return;
    const folderName = contextMenuTarget;

    switch (action) {
        case 'rename':
            renameFolder(folderName);
            break;
        case 'delete':
            deleteFolder(folderName);
            break;
    }

    contextMenuTarget = null;
}

function showMoveVideoModal(video) {
    const select = document.getElementById('moveFolderSelect');
    select.innerHTML = '';

    folders.forEach(folder => {
        if (folder.name !== video.folder) {
            const option = document.createElement('option');
            option.value = folder.name;
            option.textContent = folder.name + (folder.is_default ? ' (Default)' : '');
            select.appendChild(option);
        }
    });

    contextMenuTarget = video;
    const modal = new bootstrap.Modal(document.getElementById('moveFolderModal'));
    modal.show();
}

async function confirmMoveVideo() {
    if (!contextMenuTarget) return;

    const video = contextMenuTarget;
    const select = document.getElementById('moveFolderSelect');
    const targetFolder = select.value;

    try {
        const response = await fetch('/api/videos/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: video.filename,
                source_folder: video.folder,
                target_folder: targetFolder
            })
        });

        const data = await response.json();
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

    contextMenuTarget = null;
}

async function openFileLocation(video) {
    try {
        await fetch('/api/open-file-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: video.folder,
                filename: video.filename
            })
        });
    } catch (error) {
        console.error('Open file location error:', error);
    }
}

async function deleteVideo(video) {
    if (!confirm(`Delete "${video.title}"? This cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch('/api/delete-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folder: video.folder,
                filename: video.filename
            })
        });

        const data = await response.json();
        if (data.success) {
            // If this video was playing, hide player
            if (currentPlayingVideo && currentPlayingVideo.id === video.id) {
                document.getElementById('playerContainer').classList.add('d-none');
                document.getElementById('playerPlaceholder').classList.remove('d-none');
                currentPlayingVideo = null;
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

// ===== Drag and Drop Functions =====

function initDragAndDrop() {
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

        const response = await fetch('/api/videos/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: data.filename,
                source_folder: data.folder,
                target_folder: targetFolder
            })
        });

        const result = await response.json();
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
