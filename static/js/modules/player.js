/**
 * Video Player Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { escapeHtml, detectPlatform, getPlatformInfo } from './utils.js';
import { renderTags, loadAllTags } from './tags.js';

/**
 * Play video in the player
 * @param {object} video - Video object
 * @param {string} preferredType - Preferred media type ('video' or 'audio')
 */
export async function playVideo(video, preferredType = null) {
    state.setCurrentPlayingVideo(video);

    // Update active state in list
    document.querySelectorAll('.video-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === video.id);
    });

    // Show player container
    document.getElementById('playerPlaceholder').classList.add('d-none');
    const playerContainer = document.getElementById('playerContainer');
    playerContainer.classList.remove('d-none');

    const videoPlayer = document.getElementById('videoPlayer');
    const videoEmbed = document.getElementById('videoEmbed');
    const linkOnlyOverlay = document.getElementById('linkOnlyOverlay');
    const downloadBtn = document.getElementById('playerDownloadBtn');
    const mediaTypeSelector = document.getElementById('mediaTypeSelector');

    // Reset all video elements
    videoPlayer.classList.add('d-none');
    videoEmbed.classList.add('d-none');
    linkOnlyOverlay.classList.add('d-none');
    videoEmbed.src = '';

    // Hide media type selector by default
    if (mediaTypeSelector) {
        mediaTypeSelector.classList.add('d-none');
    }

    // Check media availability
    const hasVideo = video.has_video || false;
    const hasAudio = video.has_audio || (video.filename && video.filename.toLowerCase().endsWith('.mp3'));
    const isLinkOnly = video.link_only && !hasVideo && !hasAudio;

    // Get video wrapper for audio mode styling
    const videoWrapper = document.querySelector('.video-wrapper');

    // Get thumbnail URL for backgrounds
    const thumbUrl = video.local_thumbnail
        ? `/api/thumbnails/${encodeURIComponent(video.id)}`
        : (video.thumbnail ? `/api/proxy-thumbnail?url=${encodeURIComponent(video.thumbnail)}` : '');

    // Handle link-only items
    if (isLinkOnly) {
        linkOnlyOverlay.classList.remove('d-none');
        // Show thumbnail as background
        linkOnlyOverlay.style.backgroundImage = thumbUrl ? `url(${thumbUrl})` : 'none';

        // Remove audio mode from wrapper
        videoWrapper.classList.remove('audio-mode');
        videoWrapper.style.backgroundImage = 'none';

        // Show download button for link-only items
        downloadBtn.classList.remove('d-none');
    } else {
        videoPlayer.classList.remove('d-none');

        // Show media type selector if both video and audio are available
        if (hasVideo && hasAudio && mediaTypeSelector) {
            mediaTypeSelector.classList.remove('d-none');
            updateMediaTypeSelectorState(preferredType || 'video');
        }

        // Determine which type to play
        let playAsAudio = false;
        if (preferredType === 'audio') {
            playAsAudio = true;
        } else if (preferredType === 'video') {
            playAsAudio = false;
        } else {
            // Default: play video if available, otherwise audio
            playAsAudio = !hasVideo && hasAudio;
        }

        // Apply audio mode styling with thumbnail background
        if (playAsAudio && thumbUrl) {
            videoWrapper.classList.add('audio-mode');
            videoWrapper.style.backgroundImage = `url(${thumbUrl})`;
        } else {
            videoWrapper.classList.remove('audio-mode');
            videoWrapper.style.backgroundImage = 'none';
        }

        const typeParam = playAsAudio ? '?type=audio' : '';

        // Set video source
        if (video.folder) {
            videoPlayer.src = `/api/videos/${encodeURIComponent(video.folder)}/${encodeURIComponent(video.id)}${typeParam}`;
        } else {
            videoPlayer.src = `/api/video/${encodeURIComponent(video.id)}${typeParam}`;
        }
        videoPlayer.load();

        // Hide download button for local videos
        downloadBtn.classList.add('d-none');
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

    // Check if audio file (MP3)
    const isAudio = video.is_audio || (video.filename && video.filename.toLowerCase().endsWith('.mp3'));

    // Platform badge - always show platform info with image
    const platform = video.platform || detectPlatform(video.url);
    const platformInfo = getPlatformInfo(platform);
    const platformBadge = document.getElementById('playerPlatform');
    platformBadge.innerHTML = `<img src="${platformInfo.icon}" alt="${platformInfo.name}" class="platform-icon"> ${platformInfo.name}`;
    platformBadge.className = `platform-badge ${platform}`;

    // Audio badge - show/hide based on file type
    const audioBadge = document.getElementById('playerAudioBadge');
    if (isAudio) {
        audioBadge.classList.remove('d-none');
    } else {
        audioBadge.classList.add('d-none');
    }

    // Source link (generic for all platforms)
    const sourceLink = document.getElementById('playerSourceLink');
    if (video.url) {
        sourceLink.href = video.url;
        sourceLink.classList.remove('d-none');
        sourceLink.innerHTML = `<img src="${platformInfo.icon}" alt="${platformInfo.name}" class="platform-icon me-1">${platformInfo.name}에서 보기`;
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

/**
 * Parse timestamps in description and make them clickable
 * @param {string} text - Description text
 * @returns {string} HTML with clickable timestamps
 */
export function parseTimestamps(text) {
    if (!text) return '';

    // Match timestamps like 0:00, 00:00, 0:00:00, 00:00:00
    const timestampRegex = /\b(\d{1,2}:)?(\d{1,2}):(\d{2})\b/g;

    return escapeHtml(text).replace(timestampRegex, (match) => {
        const seconds = timestampToSeconds(match);
        return `<span class="timestamp-link" data-time="${seconds}">${match}</span>`;
    });
}

/**
 * Convert timestamp string to seconds
 * @param {string} timestamp - Timestamp string (e.g., "1:30" or "1:30:00")
 * @returns {number} Seconds
 */
export function timestampToSeconds(timestamp) {
    const parts = timestamp.split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
}

/**
 * Open external link in browser
 * @param {string} url - URL to open
 */
export function openExternalLink(url) {
    // Try PyWebView API first
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_url) {
        window.pywebview.api.open_url(url);
    } else {
        // Fallback: open in new window
        window.open(url, '_blank');
    }
}

/**
 * Download video later (for link-only items)
 */
export async function downloadLater() {
    if (!state.currentPlayingVideo || !state.currentPlayingVideo.link_only) return;

    try {
        const data = await api.downloadLaterAPI(
            state.currentPlayingVideo.id,
            state.currentPlayingVideo.folder
        );
        if (data.success) {
            alert('다운로드가 시작되었습니다.');
            // Refresh library after download completes
            const { loadVideoLibrary } = await import('./library.js');
            setTimeout(loadVideoLibrary, 2000);
        } else {
            alert(data.error || '다운로드에 실패했습니다.');
        }
    } catch (error) {
        console.error('Download later error:', error);
    }
}

/**
 * Initialize timestamp click handler
 */
export function initTimestampClickHandler() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('timestamp-link')) {
            const time = parseInt(e.target.dataset.time);
            const videoPlayer = document.getElementById('videoPlayer');
            if (videoPlayer && !state.currentPlayingVideo?.link_only) {
                videoPlayer.currentTime = time;
                videoPlayer.play();
            }
        }
    });
}

// Title Edit Functions
export function startEditTitle() {
    const title = document.getElementById('playerTitle');
    const editSection = document.getElementById('titleEditSection');
    const input = document.getElementById('titleEditInput');

    title.classList.add('d-none');
    editSection.classList.remove('d-none');
    input.value = state.currentPlayingVideo?.title || '';
    input.focus();
}

export function cancelEditTitle() {
    document.getElementById('playerTitle').classList.remove('d-none');
    document.getElementById('titleEditSection').classList.add('d-none');
}

export async function saveTitle() {
    const newTitle = document.getElementById('titleEditInput').value.trim();
    if (!newTitle || !state.currentPlayingVideo) {
        cancelEditTitle();
        return;
    }

    try {
        const data = await api.updateVideoMetadata(state.currentPlayingVideo.id, { title: newTitle });
        if (data.success) {
            state.currentPlayingVideo.title = newTitle;
            document.getElementById('playerTitle').textContent = newTitle;
            const { loadVideoLibrary } = await import('./library.js');
            loadVideoLibrary();
        }
    } catch (error) {
        console.error('Save title error:', error);
    }

    cancelEditTitle();
}

// Description Edit Functions
export function startEditDescription() {
    const desc = document.querySelector('.video-description');
    const editSection = document.getElementById('descEditSection');
    const input = document.getElementById('descEditInput');

    desc.classList.add('d-none');
    editSection.classList.remove('d-none');
    input.value = state.currentPlayingVideo?.description || '';
    input.focus();
}

export function cancelEditDescription() {
    document.querySelector('.video-description').classList.remove('d-none');
    document.getElementById('descEditSection').classList.add('d-none');
}

export async function saveDescription() {
    const newDesc = document.getElementById('descEditInput').value;
    if (!state.currentPlayingVideo) {
        cancelEditDescription();
        return;
    }

    try {
        const data = await api.updateVideoMetadata(state.currentPlayingVideo.id, { description: newDesc });
        if (data.success) {
            state.currentPlayingVideo.description = newDesc;
            document.getElementById('playerDescription').innerHTML = parseTimestamps(newDesc);
        }
    } catch (error) {
        console.error('Save description error:', error);
    }

    cancelEditDescription();
}

/**
 * Get embed URL for video platforms
 * @param {string} url - Original video URL
 * @param {string} platform - Platform name
 * @returns {string|null} Embed URL or null if not embeddable
 */
export function getEmbedUrl(url, platform) {
    if (!url) return null;

    try {
        switch (platform) {
            case 'youtube': {
                // Extract video ID from YouTube URL
                const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([^&?\s]+)/);
                if (match) {
                    return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
                }
                break;
            }
            case 'vimeo': {
                const match = url.match(/vimeo\.com\/(\d+)/);
                if (match) {
                    return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
                }
                break;
            }
            case 'twitter': {
                // Twitter/X doesn't support simple iframe embedding
                // Return null to open in external browser
                return null;
            }
            case 'instagram':
            case 'tiktok':
            case 'facebook':
                // These platforms don't allow simple iframe embedding
                return null;
            default:
                return null;
        }
    } catch (e) {
        console.error('Error parsing embed URL:', e);
    }
    return null;
}

/**
 * Play embedded video (for link-only items)
 */
export function playEmbeddedVideo() {
    if (!state.currentPlayingVideo) return;

    const video = state.currentPlayingVideo;
    const platform = video.platform || 'other';
    const embedUrl = getEmbedUrl(video.url, platform);

    const videoEmbed = document.getElementById('videoEmbed');
    const linkOnlyOverlay = document.getElementById('linkOnlyOverlay');

    if (embedUrl) {
        // Show iframe with embedded video
        videoEmbed.src = embedUrl;
        videoEmbed.classList.remove('d-none');
        linkOnlyOverlay.classList.add('d-none');
    } else {
        // Open in external browser if embedding not supported
        openExternalLink(video.url);
    }
}

/**
 * Update media type selector button states
 * @param {string} activeType - 'video' or 'audio'
 */
function updateMediaTypeSelectorState(activeType) {
    const videoBtn = document.getElementById('playVideoBtn');
    const audioBtn = document.getElementById('playAudioBtn');

    if (videoBtn && audioBtn) {
        videoBtn.classList.toggle('active', activeType === 'video');
        audioBtn.classList.toggle('active', activeType === 'audio');
    }
}

/**
 * Switch to video playback
 */
export function switchToVideo() {
    if (state.currentPlayingVideo) {
        playVideo(state.currentPlayingVideo, 'video');
    }
}

/**
 * Switch to audio playback
 */
export function switchToAudio() {
    if (state.currentPlayingVideo) {
        playVideo(state.currentPlayingVideo, 'audio');
    }
}

/**
 * Initialize player event handlers
 */
export function initPlayerEventHandlers() {
    // Play embed button click handler
    const playEmbedBtn = document.getElementById('playEmbedBtn');
    if (playEmbedBtn) {
        playEmbedBtn.addEventListener('click', playEmbeddedVideo);
    }

    // Download later button click handler (in overlay)
    const downloadLaterBtn = document.getElementById('downloadLaterBtn');
    if (downloadLaterBtn) {
        downloadLaterBtn.addEventListener('click', downloadLater);
    }

    // Player download button click handler
    const playerDownloadBtn = document.getElementById('playerDownloadBtn');
    if (playerDownloadBtn) {
        playerDownloadBtn.addEventListener('click', downloadLater);
    }

    // Media type selector buttons
    const playVideoBtn = document.getElementById('playVideoBtn');
    const playAudioBtn = document.getElementById('playAudioBtn');

    if (playVideoBtn) {
        playVideoBtn.addEventListener('click', switchToVideo);
    }
    if (playAudioBtn) {
        playAudioBtn.addEventListener('click', switchToAudio);
    }
}
