/**
 * Tag Management Functions Module
 */

import * as state from './state.js';
import * as api from './api.js';
import { escapeHtml } from './utils.js';

/**
 * Load all tags from server
 */
export async function loadAllTags() {
    try {
        const data = await api.getAllTags();
        if (data.success) {
            state.setAllTags(data.tags);
        }
    } catch (error) {
        console.error('Load tags error:', error);
    }
}

/**
 * Render tags in the UI
 * @param {string[]} tags - Array of tag strings
 */
export function renderTags(tags) {
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

/**
 * Add a tag to current video
 * @param {string} tag - Tag to add
 */
export async function addTag(tag) {
    if (!state.currentPlayingVideo || !tag.trim()) return;

    const currentTags = state.currentPlayingVideo.tags || [];
    if (currentTags.includes(tag.trim())) return;

    const newTags = [...currentTags, tag.trim()];

    try {
        const data = await api.updateVideoTags(state.currentPlayingVideo.id, newTags);
        if (data.success) {
            state.currentPlayingVideo.tags = newTags;
            renderTags(newTags);

            // Update allTags if this is a new tag
            if (!state.allTags.includes(tag.trim())) {
                const updatedTags = [...state.allTags, tag.trim()].sort();
                state.setAllTags(updatedTags);
            }
        }
    } catch (error) {
        console.error('Add tag error:', error);
    }
}

/**
 * Remove a tag from current video
 * @param {string} tag - Tag to remove
 */
export async function removeTag(tag) {
    if (!state.currentPlayingVideo) return;

    const currentTags = state.currentPlayingVideo.tags || [];
    const newTags = currentTags.filter(t => t !== tag);

    try {
        const data = await api.updateVideoTags(state.currentPlayingVideo.id, newTags);
        if (data.success) {
            state.currentPlayingVideo.tags = newTags;
            renderTags(newTags);
        }
    } catch (error) {
        console.error('Remove tag error:', error);
    }
}

/**
 * Show tag suggestions based on query
 * @param {string} query - Search query
 */
export function showTagSuggestions(query) {
    const suggestions = document.getElementById('tagSuggestions');
    const currentTags = state.currentPlayingVideo?.tags || [];

    if (!query.trim()) {
        suggestions.classList.add('d-none');
        state.setSelectedSuggestionIndex(-1);
        return;
    }

    const filtered = state.allTags.filter(tag =>
        tag.toLowerCase().includes(query.toLowerCase()) &&
        !currentTags.includes(tag)
    );

    if (filtered.length === 0) {
        suggestions.classList.add('d-none');
        state.setSelectedSuggestionIndex(-1);
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
            state.setSelectedSuggestionIndex(-1);
        });
        suggestions.appendChild(item);
    });

    suggestions.classList.remove('d-none');
    state.setSelectedSuggestionIndex(-1);
}

/**
 * Update suggestion selection state
 * @param {NodeList} items - Suggestion items
 */
function updateSuggestionSelection(items) {
    items.forEach((item, index) => {
        item.classList.toggle('active', index === state.selectedSuggestionIndex);
    });
}

/**
 * Initialize tag input event listeners
 */
export function initTagInput() {
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
            const newIndex = Math.min(state.selectedSuggestionIndex + 1, items.length - 1);
            state.setSelectedSuggestionIndex(newIndex);
            updateSuggestionSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newIndex = Math.max(state.selectedSuggestionIndex - 1, -1);
            state.setSelectedSuggestionIndex(newIndex);
            updateSuggestionSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (state.selectedSuggestionIndex >= 0 && items[state.selectedSuggestionIndex]) {
                items[state.selectedSuggestionIndex].click();
            } else if (tagInput.value.trim()) {
                addTag(tagInput.value.trim());
                tagInput.value = '';
                suggestions.classList.add('d-none');
            }
        } else if (e.key === 'Escape') {
            suggestions.classList.add('d-none');
            state.setSelectedSuggestionIndex(-1);
        }
    });

    tagInput.addEventListener('blur', () => {
        // Delay to allow click on suggestion
        setTimeout(() => {
            suggestions.classList.add('d-none');
            state.setSelectedSuggestionIndex(-1);
        }, 200);
    });
}
