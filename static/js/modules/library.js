/**
 * Library Page Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { escapeHtml, detectPlatform, getPlatformInfo, highlightText, showToast } from './utils.js';
import { playVideo } from './player.js';

/**
 * Load video library from server
 */
export async function loadVideoLibrary() {
    try {
        const data = await api.getLibrary(state.currentFolder);

        if (data.success) {
            state.setVideoLibrary(data.videos);
            renderVideoList();
        }
    } catch (error) {
        console.error('Load library error:', error);
    }
}

/**
 * Render video list in UI
 */
export function renderVideoList() {
    const videoListEl = document.getElementById('videoList');
    const emptyState = document.getElementById('emptyLibrary');

    if (!videoListEl || !emptyState) {
        return;
    }

    // Filter videos by search and platform
    let filteredVideos = state.videoLibrary.filter(video => {
        // Platform filter
        const platform = video.platform || detectPlatform(video.url);
        const platformMatch = state.platformFilters.includes(platform) || state.platformFilters.includes('other');

        // Search filter
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
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
        const folderBadge = !state.currentFolder && video.folder
            ? `<div class="video-item-folder"><i class="bi bi-folder"></i>${escapeHtml(video.folder)}</div>`
            : '';

        // Check media types from new format (has_video, has_audio)
        const hasVideo = video.has_video || false;
        const hasAudio = video.has_audio || (video.filename && video.filename.toLowerCase().endsWith('.mp3'));
        const isLinkOnly = video.link_only && !hasVideo && !hasAudio;

        // Platform overlay on thumbnail (bottom-left) - always show platform logo with link
        const platformOverlay = platformInfo.url
            ? `<a href="${platformInfo.url}" class="platform-overlay" title="${platformInfo.name}" onclick="event.stopPropagation(); window.pywebview ? pywebview.api.open_url('${platformInfo.url}') : window.open('${platformInfo.url}', '_blank'); return false;"><img src="${platformInfo.icon}" alt="${platformInfo.name}"></a>`
            : `<span class="platform-overlay" title="${platformInfo.name}"><img src="${platformInfo.icon}" alt="${platformInfo.name}"></span>`;

        // Build media type badges (top-left on thumbnail)
        let mediaBadges = '';
        if (hasVideo && hasAudio) {
            // Both video and audio available
            mediaBadges = `
                <span class="media-badge video"><i class="bi bi-film"></i> MP4</span>
                <span class="media-badge audio"><i class="bi bi-music-note-beamed"></i> MP3</span>
            `;
        } else if (hasVideo) {
            mediaBadges = '<span class="media-badge video"><i class="bi bi-film"></i> MP4</span>';
        } else if (hasAudio) {
            mediaBadges = '<span class="media-badge audio"><i class="bi bi-music-note-beamed"></i> MP3</span>';
        } else if (isLinkOnly) {
            mediaBadges = '<span class="media-badge link-only"><i class="bi bi-link-45deg"></i> 링크</span>';
        }

        // Storage badge (local or link)
        const storageBadge = isLinkOnly
            ? '<span class="storage-badge link"><i class="bi bi-cloud"></i> 링크</span>'
            : '<span class="storage-badge local"><i class="bi bi-hdd"></i> 로컬</span>';

        // Download button for link-only items
        const downloadBtn = isLinkOnly
            ? '<button class="btn-download-item" title="다운로드"><i class="bi bi-download"></i></button>'
            : '';

        // Use local thumbnail if available, otherwise proxy external thumbnails
        let thumbnailUrl;
        if (video.local_thumbnail) {
            thumbnailUrl = `/api/thumbnails/${encodeURIComponent(video.id)}`;
        } else if (video.thumbnail) {
            // Use proxy for all external thumbnails to avoid CORS/tracking issues
            thumbnailUrl = `/api/proxy-thumbnail?url=${encodeURIComponent(video.thumbnail)}`;
        } else {
            thumbnailUrl = '/static/img/placeholder.png';
        }

        item.innerHTML = `
            <div class="video-item-thumb">
                <img src="${thumbnailUrl}" alt="Thumbnail"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2268%22><rect fill=%22%23ccc%22 width=%22120%22 height=%2268%22/></svg>'">
                <span class="duration">${video.duration_str || ''}</span>
                ${platformOverlay}
                <div class="media-badges-container">${mediaBadges}</div>
            </div>
            <div class="video-item-content">
                <div class="video-item-badges">
                    ${storageBadge}
                    ${downloadBtn}
                </div>
                <div class="video-item-info">
                    <div class="video-item-title">${highlightText(video.title, state.searchQuery)}</div>
                    <div class="video-item-channel">${highlightText(video.channel || '', state.searchQuery)}</div>
                    ${folderBadge}
                </div>
            </div>
        `;

        item.addEventListener('click', () => playVideo(video));
        item.addEventListener('contextmenu', (e) => showVideoContextMenu(e, video));

        // Download button event for link-only items
        if (isLinkOnly) {
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

/**
 * Show video context menu
 * @param {Event} e - Context menu event
 * @param {object} video - Video object
 */
function showVideoContextMenu(e, video) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenus();

    state.setContextMenuTarget(video);

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

/**
 * Hide all context menus
 */
export function hideContextMenus() {
    document.getElementById('videoContextMenu')?.classList.add('d-none');
    document.getElementById('folderContextMenu')?.classList.add('d-none');
}

/**
 * Download video from library list (for link-only items)
 * @param {object} video - Video object
 */
async function downloadVideoFromList(video) {
    try {
        const data = await api.downloadLaterAPI(video.id, video.folder);
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

/**
 * Toggle platform filter dropdown
 */
export function togglePlatformFilter() {
    const dropdown = document.getElementById('platformFilterDropdown');
    dropdown.classList.toggle('d-none');
}

/**
 * Handle platform filter change
 * @param {Event} e - Change event
 */
export function handlePlatformFilterChange(e) {
    const item = e.target.closest('.platform-filter-item');
    const platform = item.dataset.platform;

    if (platform === 'all') {
        // Toggle all
        const allChecked = e.target.checked;
        document.querySelectorAll('.platform-filter-item input').forEach(cb => {
            cb.checked = allChecked;
        });
        state.setPlatformFilters(allChecked
            ? ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'other']
            : []);
    } else {
        const filters = [...state.platformFilters];
        if (e.target.checked) {
            if (!filters.includes(platform)) {
                filters.push(platform);
            }
        } else {
            const index = filters.indexOf(platform);
            if (index > -1) {
                filters.splice(index, 1);
            }
        }
        state.setPlatformFilters(filters);

        // Update "All" checkbox
        const allCheckbox = document.getElementById('filterAll');
        allCheckbox.checked = state.platformFilters.length === 6;
    }

    renderVideoList();
}

// Export for context menu handling
export { showVideoContextMenu };
