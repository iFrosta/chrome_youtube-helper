(() => {
    const CONFIG = {
        BLACKLIST_KEY: 'ytHelper_blacklist',
        DEBOUNCE_DELAY: 150
    };

    const state = {
        blacklist: new Set(),
        processedVideos: new WeakSet(),
        extensionPaused: false,
        stats: { shorts: 0, blacklisted: 0 }
    };

    init();

    function init() {
        try {
            loadBlacklist();
            injectStyles();
            setupObserver();
            setupNavigationDetection();
            processBlacklist();
            setupGlobalFunctions();
            console.log('[YT Helper] Initialized');
        } catch (e) {
            console.error('[YT Helper] Init error:', e);
        }
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'yt-helper-styles';
        style.textContent = `
            /* Hide Shorts sections and items */
            ytd-rich-section-renderer,
            ytd-reel-shelf-renderer,
            ytd-reel-item-renderer { display: none !important; }

            ytd-rich-item-renderer:has(a[href*="/shorts/"]),
            ytd-rich-item-renderer:has([overlay-style="SHORTS"]) { display: none !important; }

            /* Hide home page recommendations feed (JS adds .yt-helper-home to body) */
            body.yt-helper-home ytd-rich-grid-renderer { display: none !important; }

            /* Hide watch page sidebar recommendations */
            ytd-watch-next-secondary-results-renderer { display: none !important; }

            /* Hide videos with a watch progress bar (already watched) */
            ytd-rich-item-renderer:has(ytd-thumbnail-overlay-resume-playback-renderer),
            ytd-rich-item-renderer:has(yt-thumbnail-overlay-progress-bar-view-model) { display: none !important; }

            /* Hide Home and Shorts nav buttons in sidebar */
            ytd-guide-entry-renderer:has(a[href="/"]),
            ytd-guide-entry-renderer:has(a[title="Shorts"]),
            ytd-mini-guide-entry-renderer:has(a[href="/"]),
            ytd-mini-guide-entry-renderer:has(a[title="Shorts"]) { display: none !important; }

            /* Blacklist button */
            .yt-helper-remove {
                position: absolute;
                top: 8px;
                right: 8px;
                width: 28px;
                height: 28px;
                background: rgba(205, 24, 24, 0.85);
                color: white;
                border: none;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10;
                font-size: 14px;
                font-weight: bold;
                transition: background 0.15s, transform 0.15s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .yt-helper-remove:hover {
                background: rgba(205, 24, 24, 1);
                transform: scale(1.1);
            }
        `;
        document.head.appendChild(style);
    }

    function loadBlacklist() {
        try {
            const stored = localStorage.getItem(CONFIG.BLACKLIST_KEY);
            if (stored) state.blacklist = new Set(JSON.parse(stored));
        } catch (e) {
            state.blacklist = new Set();
        }
    }

    function saveBlacklist() {
        try {
            localStorage.setItem(CONFIG.BLACKLIST_KEY, JSON.stringify([...state.blacklist]));
        } catch (e) {
            console.error('[YT Helper] Failed to save blacklist:', e);
        }
    }

    function setupObserver() {
        let debounceTimer;
        const observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(processBlacklist, CONFIG.DEBOUNCE_DELAY);
        });
        const target = document.querySelector('ytd-page-manager, ytd-app') || document.body;
        observer.observe(target, { childList: true, subtree: true });
    }

    function updateHomeClass() {
        const isHome = location.pathname === '/' || location.pathname === '';
        document.body.classList.toggle('yt-helper-home', isHome);
    }

    function setupNavigationDetection() {
        updateHomeClass();
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                updateHomeClass();
                setTimeout(processBlacklist, 500);
            }
        }).observe(document.querySelector('ytd-app') || document.body, {
            subtree: true,
            childList: true
        });
    }

    function processBlacklist() {
        if (state.extensionPaused) return;
        removeBlacklistedVideos();
        addBlacklistButtons();
    }

    function extractVideoId(element) {
        const link = element.querySelector('a[href*="/watch"], a.yt-lockup-view-model__content-image');
        if (!link) return null;
        const href = link.getAttribute('href');
        if (!href) return null;
        const match = href.match(/[?&]v=([^&]+)/);
        return match ? match[1] : null;
    }

    function removeBlacklistedVideos() {
        if (state.blacklist.size === 0) return;
        document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
            const id = extractVideoId(item);
            if (id && state.blacklist.has(id)) item.remove();
        });
    }

    function addBlacklistButtons() {
        document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
            if (state.processedVideos.has(item)) return;
            const id = extractVideoId(item);
            if (!id || state.blacklist.has(id)) return;
            if (item.querySelector('.yt-helper-remove')) return;

            const container = item.querySelector(
                'a.yt-lockup-view-model__content-image, a#thumbnail, #dismissible'
            );
            if (!container) return;

            container.style.position = 'relative';

            const btn = document.createElement('button');
            btn.className = 'yt-helper-remove';
            btn.textContent = '✕';
            btn.title = 'Hide this video';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                state.blacklist.add(id);
                saveBlacklist();
                item.style.transition = 'opacity 0.3s';
                item.style.opacity = '0';
                setTimeout(() => item.remove(), 300);
                state.stats.blacklisted++;
            };

            container.appendChild(btn);
            state.processedVideos.add(item);
        });
    }

    function setupGlobalFunctions() {
        window.ytHelper = {
            clearBlacklist: () => {
                state.blacklist.clear();
                saveBlacklist();
                processBlacklist();
                console.log('[YT Helper] Blacklist cleared');
            },
            removeFromBlacklist: (videoId) => {
                if (state.blacklist.delete(videoId)) {
                    saveBlacklist();
                    processBlacklist();
                }
            },
            getBlacklist: () => [...state.blacklist],
            getStats: () => ({ ...state.stats }),
            pauseExtension: () => {
                state.extensionPaused = true;
                console.log('[YT Helper] Paused');
            },
            resumeExtension: () => {
                state.extensionPaused = false;
                processBlacklist();
                console.log('[YT Helper] Resumed');
            },
            isPaused: () => state.extensionPaused,
            exportBlacklist: () => {
                const data = JSON.stringify([...state.blacklist], null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `youtube-blacklist-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            },
            importBlacklist: (fileContent) => {
                const ids = JSON.parse(fileContent);
                ids.forEach(id => state.blacklist.add(id));
                saveBlacklist();
                processBlacklist();
                return ids.length;
            },
            processPage: () => processBlacklist()
        };

        console.log('[YT Helper] Ready. Use window.ytHelper for manual controls.');
    }
})();
