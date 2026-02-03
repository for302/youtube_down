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

// Search & Filter State
let searchQuery = '';
let platformFilters = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'other'];

// Platform Detection
const PLATFORM_PATTERNS = {
    youtube: [/youtube\.com/, /youtu\.be/],
    tiktok: [/tiktok\.com/, /vm\.tiktok\.com/],
    instagram: [/instagram\.com/, /instagr\.am/],
    facebook: [/facebook\.com/, /fb\.watch/, /fb\.com/],
    twitter: [/twitter\.com/, /x\.com/],
    vimeo: [/vimeo\.com/],
    naver: [/naver\.com/, /tv\.naver\.com/, /clip\.naver\.com/],
    pinterest: [/pinterest\.com/],
};

const PLATFORM_ICONS = {
    youtube: { icon: 'bi-youtube', color: 'text-danger', name: 'YouTube' },
    tiktok: { icon: 'bi-tiktok', color: '', name: 'TikTok' },
    instagram: { icon: 'bi-instagram', color: 'text-danger', name: 'Instagram' },
    facebook: { icon: 'bi-facebook', color: 'text-primary', name: 'Facebook' },
    twitter: { icon: 'bi-twitter-x', color: '', name: 'X' },
    vimeo: { icon: 'bi-vimeo', color: 'text-info', name: 'Vimeo' },
    naver: { icon: 'bi-n-square', color: 'text-success', name: 'Naver' },
    pinterest: { icon: 'bi-pinterest', color: 'text-danger', name: 'Pinterest' },
    other: { icon: 'bi-globe', color: '', name: '기타' }
};

function detectPlatform(url) {
    if (!url) return 'other';
    const lowerUrl = url.toLowerCase();
    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
        if (patterns.some(pattern => pattern.test(lowerUrl))) {
            return platform;
        }
    }
    return 'other';
}

function getPlatformInfo(platform) {
    return PLATFORM_ICONS[platform] || PLATFORM_ICONS.other;
}

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

    // Load folders on startup (sidebar always visible)
    loadFolders();
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

    if (pageName === 'download') {
        document.getElementById('downloadPage').classList.add('active');
        updateDownloadFolderSelect();
    } else if (pageName === 'library') {
        document.getElementById('libraryPage').classList.add('active');
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
    document.getElementById('downloadVideoBtn')?.addEventListener('click', () => startDownload('video'));
    document.getElementById('downloadAudioBtn')?.addEventListener('click', () => startDownload('audio'));

    // Cancel button
    document.getElementById('cancelBtn')?.addEventListener('click', cancelDownload);

    // Open folder button
    document.getElementById('openFolderBtn')?.addEventListener('click', openFolder);

    // Download more button
    document.getElementById('downloadMoreBtn')?.addEventListener('click', resetUI);

    // Quality buttons (MP3)
    document.querySelectorAll('.quality-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            selectedBitrate = this.dataset.bitrate;
        });
    });

    // Select folder button (legacy)
    document.getElementById('selectFolderBtn')?.addEventListener('click', selectFolder);

    // Refresh library button
    document.getElementById('refreshLibraryBtn')?.addEventListener('click', loadVideoLibrary);

    // Save link only button
    document.getElementById('saveLinkOnlyBtn')?.addEventListener('click', saveLinkOnly);

    // Download later button
    document.getElementById('downloadLaterBtn')?.addEventListener('click', downloadLater);

    // Search input - real-time filtering
    const searchInput = document.getElementById('librarySearchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            searchQuery = e.target.value.trim();

            // Show/hide clear button
            if (searchClearBtn) {
                searchClearBtn.classList.toggle('d-none', !searchQuery);
            }

            // When searching, switch to "All Folders" to search across all videos
            if (searchQuery && currentFolder !== null) {
                currentFolder = null;
                renderFolderList();
                await loadVideoLibrary();  // Load all videos
            } else {
                // Real-time filter without reloading from server
                renderVideoList();
            }
        });
    }

    // Search clear button
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchQuery = '';
                searchClearBtn.classList.add('d-none');
                renderVideoList();
                searchInput.focus();
            }
        });
    }

    // Platform filter button
    document.getElementById('platformFilterBtn')?.addEventListener('click', togglePlatformFilter);

    // Platform filter checkboxes
    document.querySelectorAll('.platform-filter-item input').forEach(checkbox => {
        checkbox.addEventListener('change', handlePlatformFilterChange);
    });

    // Close filter dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('platformFilterDropdown');
        const btn = document.getElementById('platformFilterBtn');
        if (dropdown && !dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            dropdown.classList.add('d-none');
        }
    });

    // Title edit buttons
    document.getElementById('editTitleBtn')?.addEventListener('click', startEditTitle);
    document.getElementById('saveTitleBtn')?.addEventListener('click', saveTitle);
    document.getElementById('cancelTitleBtn')?.addEventListener('click', cancelEditTitle);

    // Description edit buttons
    document.getElementById('editDescBtn')?.addEventListener('click', startEditDescription);
    document.getElementById('saveDescBtn')?.addEventListener('click', saveDescription);
    document.getElementById('cancelDescBtn')?.addEventListener('click', cancelEditDescription);
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
    // Legacy function - downloadPath input removed from UI
    // Keeping for potential future use
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

    if (!videoListEl || !emptyState) {
        return;
    }

    // Filter videos by search and platform
    let filteredVideos = videoLibrary.filter(video => {
        // Platform filter
        const platform = video.platform || detectPlatform(video.url);
        const platformMatch = platformFilters.includes(platform) || platformFilters.includes('other');

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const titleMatch = video.title?.toLowerCase().includes(query);
            const channelMatch = video.channel?.toLowerCase().includes(query);
            const descMatch = video.description?.toLowerCase().includes(query);
            const tagsMatch = video.tags?.some(tag => tag.toLowerCase().includes(query));
            return platformMatch && (titleMatch || channelMatch || descMatch || tagsMatch);
        }

        return platformMatch;
    });

    if (filteredVideos.length === 0) {
        emptyState.classList.remove('d-none');
        videoListEl.querySelectorAll('.video-item').forEach(el => el.remove());
        return;
    }

    emptyState.classList.add('d-none');
    videoListEl.innerHTML = '';

    filteredVideos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.dataset.id = video.id;
        item.dataset.folder = video.folder || '';
        item.dataset.filename = video.filename || '';
        item.draggable = true;

        // Detect platform
        const platform = video.platform || detectPlatform(video.url);
        const platformInfo = getPlatformInfo(platform);

        // Show folder badge when viewing all folders
        const folderBadge = !currentFolder && video.folder
            ? `<div class="video-item-folder"><i class="bi bi-folder"></i>${escapeHtml(video.folder)}</div>`
            : '';

        // Platform overlay on thumbnail (bottom-left)
        const platformOverlay = `<span class="platform-overlay"><i class="bi ${platformInfo.icon}"></i></span>`;

        // Storage badge (local or link)
        const storageBadge = video.link_only
            ? '<span class="storage-badge link"><i class="bi bi-cloud"></i> 링크</span>'
            : '<span class="storage-badge local"><i class="bi bi-hdd"></i> 로컬</span>';

        // Download button for link-only items
        const downloadBtn = video.link_only
            ? '<button class="btn-download-item" title="다운로드"><i class="bi bi-download"></i></button>'
            : '';

        // Use local thumbnail if available, otherwise fallback to original URL
        const thumbnailUrl = video.local_thumbnail
            ? `/api/thumbnails/${encodeURIComponent(video.id)}`
            : (video.thumbnail || '/static/img/placeholder.png');

        item.innerHTML = `
            <div class="video-item-thumb">
                <img src="${thumbnailUrl}" alt="Thumbnail"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22><rect fill=%22%23ccc%22 width=%22120%22 height=%2268%22/></svg>'">
                <span class="duration">${video.duration_str || ''}</span>
                ${platformOverlay}
            </div>
            <div class="video-item-content">
                <div class="video-item-badges">
                    ${storageBadge}
                    ${downloadBtn}
                </div>
                <div class="video-item-info">
                    <div class="video-item-title">${highlightText(video.title, searchQuery)}</div>
                    <div class="video-item-channel">${highlightText(video.channel || '', searchQuery)}</div>
                    ${folderBadge}
                </div>
            </div>
        `;

        item.addEventListener('click', () => playVideo(video));
        item.addEventListener('contextmenu', (e) => showVideoContextMenu(e, video));

        // Download button event for link-only items
        if (video.link_only) {
            const downloadBtnEl = item.querySelector('.btn-download-item');
            if (downloadBtnEl) {
                downloadBtnEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    downloadVideoFromList(video);
                });
            }
        }

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

    const videoPlayer = document.getElementById('videoPlayer');
    const linkOnlyOverlay = document.getElementById('linkOnlyOverlay');

    // Handle link-only items
    if (video.link_only) {
        videoPlayer.classList.add('d-none');
        linkOnlyOverlay.classList.remove('d-none');
        // Show thumbnail as background
        linkOnlyOverlay.style.backgroundImage = video.local_thumbnail
            ? `url(/api/thumbnails/${encodeURIComponent(video.id)})`
            : `url(${video.thumbnail})`;
        linkOnlyOverlay.style.backgroundSize = 'cover';
        linkOnlyOverlay.style.backgroundPosition = 'center';
    } else {
        videoPlayer.classList.remove('d-none');
        linkOnlyOverlay.classList.add('d-none');

        // Set video source
        if (video.folder) {
            videoPlayer.src = `/api/videos/${encodeURIComponent(video.folder)}/${encodeURIComponent(video.id)}`;
        } else {
            videoPlayer.src = `/api/video/${encodeURIComponent(video.id)}`;
        }
        videoPlayer.load();
    }

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

    // Platform badge
    const platform = video.platform || detectPlatform(video.url);
    const platformInfo = getPlatformInfo(platform);
    const platformBadge = document.getElementById('playerPlatform');
    platformBadge.innerHTML = `<i class="bi ${platformInfo.icon} ${platformInfo.color}"></i> ${platformInfo.name}`;
    platformBadge.className = `platform-badge ${platform}`;

    // Source link (generic for all platforms)
    const sourceLink = document.getElementById('playerSourceLink');
    if (video.url) {
        sourceLink.href = video.url;
        sourceLink.classList.remove('d-none');
        sourceLink.innerHTML = `<i class="bi ${platformInfo.icon} me-1"></i>${platformInfo.name}에서 보기`;
        sourceLink.onclick = (e) => {
            e.preventDefault();
            openExternalLink(video.url);
        };
    } else {
        sourceLink.classList.add('d-none');
    }

    // Description with clickable timestamps
    const description = document.getElementById('playerDescription');
    if (video.description) {
        description.innerHTML = parseTimestamps(video.description);
        description.classList.remove('d-none');
    } else {
        description.innerHTML = '<em class="text-muted">상세정보 없음</em>';
    }

    // Hide edit sections
    document.getElementById('titleEditSection')?.classList.add('d-none');
    document.getElementById('descEditSection')?.classList.add('d-none');
    document.getElementById('playerTitle')?.classList.remove('d-none');
    document.querySelector('.video-description')?.classList.remove('d-none');

    // Render tags
    renderTags(video.tags || []);

    // Load all tags for autocomplete
    loadAllTags();
}

// Parse timestamps in description and make them clickable
function parseTimestamps(text) {
    if (!text) return '';

    // Match timestamps like 0:00, 00:00, 0:00:00, 00:00:00
    const timestampRegex = /\b(\d{1,2}:)?(\d{1,2}):(\d{2})\b/g;

    return escapeHtml(text).replace(timestampRegex, (match) => {
        const seconds = timestampToSeconds(match);
        return `<span class="timestamp-link" data-time="${seconds}">${match}</span>`;
    });
}

function timestampToSeconds(timestamp) {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
}

// Add click handler for timestamps
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('timestamp-link')) {
        const time = parseInt(e.target.dataset.time);
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer && !currentPlayingVideo?.link_only) {
            videoPlayer.currentTime = time;
            videoPlayer.play();
        }
    }
});

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

function highlightText(text, query) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    if (!query || !query.trim()) return escaped;

    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        if (appSettings.content_path) {
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

    // Update default folder input
    const defaultFolderInput = document.getElementById('defaultFolderInput');
    if (defaultFolderInput) {
        defaultFolderInput.value = appSettings.default_folder || '00_Inbox';
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
}

async function selectContentFolder() {
    // Try PyWebView API first
    if (window.pywebview && window.pywebview.api && window.pywebview.api.select_content_folder) {
        try {
            const path = await window.pywebview.api.select_content_folder();
            if (path) {
                document.getElementById('contentPathInput').value = path;
                appSettings.content_path = path;
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

async function selectContentFolderFallback() {
    const path = prompt('콘텐츠 폴더 경로를 입력하세요:');
    if (path) {
        const result = await saveSettings({ content_path: path });
        if (result.success) {
            document.getElementById('contentPathInput').value = appSettings.content_path;
            loadFolders();
            updateDownloadFolderSelect();
        } else {
            alert('유효하지 않은 경로입니다.');
        }
    }
}

async function openContentFolder() {
    if (!appSettings.content_path) {
        alert('Content folder is not set.');
        return;
    }

    try {
        await fetch('/api/open-content-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: appSettings.content_path })
        });
    } catch (error) {
        console.error('Open content folder error:', error);
    }
}

async function saveDefaultFolder() {
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
            const response = await fetch('/api/rename-default-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: newName })
            });
            const data = await response.json();
            if (data.success) {
                loadFolders();
                updateDownloadFolderSelect();
            }
        }
    } catch (error) {
        console.error('Save default folder error:', error);
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
    // Clear search when folder is selected
    searchQuery = '';
    const searchInput = document.getElementById('librarySearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    renderFolderList();
    switchPage('library');
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
    const defaultFolder = appSettings.default_folder || '00_Inbox';
    if (!confirm(`Delete folder "${name}"? Videos will be moved to ${defaultFolder}.`)) {
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

    const defaultFolder = appSettings.default_folder || '00_Inbox';
    select.innerHTML = '';

    // Add default folder first
    const defaultOption = document.createElement('option');
    defaultOption.value = defaultFolder;
    defaultOption.textContent = `${defaultFolder} (Default)`;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    folders.forEach(folder => {
        if (folder.name !== defaultFolder) {
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

// ===== Save Link Only =====
async function saveLinkOnly() {
    if (!currentVideoInfo) return;

    const folderSelect = document.getElementById('downloadFolderSelect');
    const folder = folderSelect ? folderSelect.value : appSettings.default_folder;

    try {
        const response = await fetch('/api/save-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentVideoInfo.url,
                folder: folder
            })
        });

        const data = await response.json();
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

// ===== Download Later (for link-only items) =====
async function downloadLater() {
    if (!currentPlayingVideo || !currentPlayingVideo.link_only) return;

    try {
        const response = await fetch('/api/download-later', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: currentPlayingVideo.id,
                folder: currentPlayingVideo.folder
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('다운로드가 시작되었습니다.');
            // Refresh library after download completes
            setTimeout(loadVideoLibrary, 2000);
        } else {
            alert(data.error || '다운로드에 실패했습니다.');
        }
    } catch (error) {
        console.error('Download later error:', error);
    }
}

// ===== Download Video From List (for link-only items in list) =====
async function downloadVideoFromList(video) {
    try {
        const response = await fetch('/api/download-later', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                video_id: video.id,
                folder: video.folder
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast('다운로드가 시작되었습니다.');
            // Refresh library after download completes
            setTimeout(loadVideoLibrary, 2000);
        } else {
            showToast(data.error || '다운로드 실패', 'error');
        }
    } catch (error) {
        console.error('Download error:', error);
    }
}

// ===== Toast Notification =====
function showToast(message, type = 'success') {
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

// ===== Platform Filter =====
function togglePlatformFilter() {
    const dropdown = document.getElementById('platformFilterDropdown');
    dropdown.classList.toggle('d-none');
}

function handlePlatformFilterChange(e) {
    const item = e.target.closest('.platform-filter-item');
    const platform = item.dataset.platform;

    if (platform === 'all') {
        // Toggle all
        const allChecked = e.target.checked;
        document.querySelectorAll('.platform-filter-item input').forEach(cb => {
            cb.checked = allChecked;
        });
        platformFilters = allChecked
            ? ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'other']
            : [];
    } else {
        if (e.target.checked) {
            if (!platformFilters.includes(platform)) {
                platformFilters.push(platform);
            }
        } else {
            platformFilters = platformFilters.filter(p => p !== platform);
        }

        // Update "All" checkbox
        const allCheckbox = document.getElementById('filterAll');
        allCheckbox.checked = platformFilters.length === 6;
    }

    renderVideoList();
}

// ===== Title Edit =====
function startEditTitle() {
    const title = document.getElementById('playerTitle');
    const editSection = document.getElementById('titleEditSection');
    const input = document.getElementById('titleEditInput');

    title.classList.add('d-none');
    editSection.classList.remove('d-none');
    input.value = currentPlayingVideo?.title || '';
    input.focus();
}

function cancelEditTitle() {
    document.getElementById('playerTitle').classList.remove('d-none');
    document.getElementById('titleEditSection').classList.add('d-none');
}

async function saveTitle() {
    const newTitle = document.getElementById('titleEditInput').value.trim();
    if (!newTitle || !currentPlayingVideo) {
        cancelEditTitle();
        return;
    }

    try {
        const response = await fetch(`/api/update-metadata/${encodeURIComponent(currentPlayingVideo.id)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
        });

        const data = await response.json();
        if (data.success) {
            currentPlayingVideo.title = newTitle;
            document.getElementById('playerTitle').textContent = newTitle;
            loadVideoLibrary();
        }
    } catch (error) {
        console.error('Save title error:', error);
    }

    cancelEditTitle();
}

// ===== Description Edit =====
function startEditDescription() {
    const desc = document.querySelector('.video-description');
    const editSection = document.getElementById('descEditSection');
    const input = document.getElementById('descEditInput');

    desc.classList.add('d-none');
    editSection.classList.remove('d-none');
    input.value = currentPlayingVideo?.description || '';
    input.focus();
}

function cancelEditDescription() {
    document.querySelector('.video-description').classList.remove('d-none');
    document.getElementById('descEditSection').classList.add('d-none');
}

async function saveDescription() {
    const newDesc = document.getElementById('descEditInput').value;
    if (!currentPlayingVideo) {
        cancelEditDescription();
        return;
    }

    try {
        const response = await fetch(`/api/update-metadata/${encodeURIComponent(currentPlayingVideo.id)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: newDesc })
        });

        const data = await response.json();
        if (data.success) {
            currentPlayingVideo.description = newDesc;
            document.getElementById('playerDescription').innerHTML = parseTimestamps(newDesc);
        }
    } catch (error) {
        console.error('Save description error:', error);
    }

    cancelEditDescription();
}
