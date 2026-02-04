/**
 * Application State Module
 * Contains all global state variables and constants
 */

// Video download state
export let currentVideoInfo = null;
export let selectedResolution = '720p';
export let selectedBitrate = '192';
export let selectedFolder = '00_Inbox';
export let progressInterval = null;
export let lastFilepath = '';

// Library state
export let videoLibrary = [];
export let currentPlayingVideo = null;

// Tag state
export let allTags = [];
export let selectedSuggestionIndex = -1;

// Folder Management State
export let folders = [];
export let currentFolder = null;  // null means "All Folders"
export let contextMenuTarget = null;
export let folderToRename = null;

// Settings State
export let appSettings = {
    content_path: '',
    theme: 'light',
    default_folder: '00_Inbox'
};

// Update State
export let updateInfo = null;
export let updateProgressInterval = null;

// Search & Filter State
export let searchQuery = '';
export let platformFilters = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'other'];

// Platform Detection Constants
export const PLATFORM_PATTERNS = {
    youtube: [/youtube\.com/, /youtu\.be/],
    tiktok: [/tiktok\.com/, /vm\.tiktok\.com/],
    instagram: [/instagram\.com/, /instagr\.am/],
    facebook: [/facebook\.com/, /fb\.watch/, /fb\.com/],
    twitter: [/twitter\.com/, /x\.com/],
    vimeo: [/vimeo\.com/],
    dailymotion: [/dailymotion\.com/, /dai\.ly/],
    naver: [/naver\.com/, /tv\.naver\.com/, /clip\.naver\.com/, /naver\.me/],
    pinterest: [/pinterest\.com/, /pin\.it/, /pinimg\.com/],
    reddit: [/reddit\.com/, /redd\.it/, /v\.redd\.it/, /i\.redd\.it/],
    soundcloud: [/soundcloud\.com/],
};

export const PLATFORM_ICONS = {
    youtube: { icon: '/static/img/platforms/youtube.svg', name: 'YouTube', url: 'https://www.youtube.com' },
    tiktok: { icon: '/static/img/platforms/tiktok.svg', name: 'TikTok', url: 'https://www.tiktok.com' },
    instagram: { icon: '/static/img/platforms/instagram.svg', name: 'Instagram', url: 'https://www.instagram.com' },
    facebook: { icon: '/static/img/platforms/facebook.svg', name: 'Facebook', url: 'https://www.facebook.com' },
    twitter: { icon: '/static/img/platforms/twitter.svg', name: 'X', url: 'https://x.com' },
    vimeo: { icon: '/static/img/platforms/vimeo.svg', name: 'Vimeo', url: 'https://vimeo.com' },
    dailymotion: { icon: '/static/img/platforms/dailymotion.svg', name: 'Dailymotion', url: 'https://www.dailymotion.com' },
    reddit: { icon: '/static/img/platforms/reddit.svg', name: 'Reddit', url: 'https://www.reddit.com' },
    naver: { icon: '/static/img/platforms/naver.svg', name: 'Naver', url: 'https://tv.naver.com' },
    pinterest: { icon: '/static/img/platforms/pinterest.svg', name: 'Pinterest', url: 'https://www.pinterest.com' },
    soundcloud: { icon: '/static/img/platforms/soundcloud.svg', name: 'SoundCloud', url: 'https://soundcloud.com' },
    other: { icon: '/static/img/platforms/other.svg', name: '기타', url: null }
};

// State setters
export function setCurrentVideoInfo(value) {
    currentVideoInfo = value;
}

export function setSelectedResolution(value) {
    selectedResolution = value;
}

export function setSelectedBitrate(value) {
    selectedBitrate = value;
}

export function setSelectedFolder(value) {
    selectedFolder = value;
}

export function setProgressInterval(value) {
    progressInterval = value;
}

export function setLastFilepath(value) {
    lastFilepath = value;
}

export function setVideoLibrary(value) {
    videoLibrary = value;
}

export function setCurrentPlayingVideo(value) {
    currentPlayingVideo = value;
}

export function setAllTags(value) {
    allTags = value;
}

export function setSelectedSuggestionIndex(value) {
    selectedSuggestionIndex = value;
}

export function setFolders(value) {
    folders = value;
}

export function setCurrentFolder(value) {
    currentFolder = value;
}

export function setContextMenuTarget(value) {
    contextMenuTarget = value;
}

export function setFolderToRename(value) {
    folderToRename = value;
}

export function setAppSettings(value) {
    appSettings = value;
}

export function updateAppSettings(updates) {
    appSettings = { ...appSettings, ...updates };
}

export function setUpdateInfo(value) {
    updateInfo = value;
}

export function setUpdateProgressInterval(value) {
    updateProgressInterval = value;
}

export function setSearchQuery(value) {
    searchQuery = value;
}

export function setPlatformFilters(value) {
    platformFilters = value;
}
