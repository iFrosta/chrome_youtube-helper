(async () => {
    const CONFIG = {
        OVERFLOW: 50,
        SPEED: 1.75,
        CLEANUP_INTERVAL: 500,
        MAX_RETRIES: 50,
        PROCESS_DELAY: 250,
        STORAGE_PREFIX: 'ytHelper_',
        BLACKLIST_KEY: 'ytHelper_blacklist',
        LAST_CLEANUP_KEY: 'ytHelper_lastCleanup',
        CLEANUP_DAYS: 30,
        DEBOUNCE_DELAY: 100
    };

    // State management
    const state = {
        blacklist: new Set(),
        processedVideos: new WeakSet(),
        isProcessing: false,
        mutationQueue: [],
        stats: { removed: 0, blacklisted: 0, shorts: 0 },
        manualSpeedChange: false,
        extensionPaused: false,
        lastKnownSpeed: CONFIG.SPEED
    };

    // Initialize
    init();

    async function init() {
        loadBlacklist();
        setupObservers();
        setPlaybackSpeed();
        performInitialCleanup();
        processPage();
        setupGlobalFunctions();
    }

    // Load blacklist from localStorage
    function loadBlacklist() {
        try {
            const stored = localStorage.getItem(CONFIG.BLACKLIST_KEY);
            if (stored) {
                const ids = JSON.parse(stored);
                state.blacklist = new Set(ids);
            }
        } catch (e) {
            console.error('[YT Helper] Failed to load blacklist:', e);
            state.blacklist = new Set();
        }
    }

    // Save blacklist to localStorage
    function saveBlacklist() {
        try {
            localStorage.setItem(CONFIG.BLACKLIST_KEY, JSON.stringify([...state.blacklist]));
        } catch (e) {
            console.error('[YT Helper] Failed to save blacklist:', e);
        }
    }

    // Setup mutation observer with debouncing
    function setupObservers() {
        let debounceTimer;

        const observer = new MutationObserver((mutations) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (!state.isProcessing) {
                    processPage();
                }
            }, CONFIG.DEBOUNCE_DELAY);
        });

        const targetNode = document.querySelector('ytd-page-manager') || document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: false
        });

        // Scroll handler with throttling
        let scrollTimer;
        let lastScrollY = window.scrollY;

        window.addEventListener('scroll', () => {
            if (window.scrollY > lastScrollY) {
                clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    if (!state.isProcessing) {
                        processPage();
                    }
                }, CONFIG.PROCESS_DELAY);
            }
            lastScrollY = window.scrollY;
        }, { passive: true });
    }

    // Main processing function
    async function processPage() {
        if (state.isProcessing || state.extensionPaused) return;
        state.isProcessing = true;

        try {
            removeShorts();
            removeWatchedVideos();
            processBlacklistButtons();
            removeBlacklistedVideos();
        } catch (e) {
            console.error('[YT Helper] Processing error:', e);
        } finally {
            state.isProcessing = false;
        }
    }

    // Remove Shorts sections and individual shorts
    function removeShorts() {
        // Remove Shorts shelves
        document.querySelectorAll('ytd-rich-section-renderer').forEach(section => {
            const title = section.querySelector('#title')?.textContent?.trim().toLowerCase();
            if (title === 'shorts' || title === 'youtube shorts') {
                section.remove();
                state.stats.shorts++;
            }
        });

        // Remove individual Shorts in feed
        document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
            const isShort =
                item.querySelector('[overlay-style="SHORTS"]') ||
                item.querySelector('ytd-thumbnail-overlay-time-status-renderer')?.textContent?.includes('SHORTS') ||
                item.querySelector('a[href*="/shorts/"]');

            if (isShort) {
                item.remove();
                state.stats.shorts++;
            }
        });
    }

    // Remove videos watched over threshold
    function removeWatchedVideos() {
        document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
            const progress = item.querySelector('#progress');
            if (progress) {
                const width = parseFloat(progress.style.width);
                if (width > CONFIG.OVERFLOW) {
                    item.remove();
                    state.stats.removed++;
                }
            }
        });
    }

    // Extract video ID from various YouTube URL formats
    function extractVideoId(element) {
        const link = element.querySelector('a#thumbnail, a.yt-simple-endpoint');
        if (!link) return null;

        const href = link.getAttribute('href');
        if (!href) return null;

        // Handle different URL formats
        const patterns = [
            /[?&]v=([^&]+)/,          // Regular watch URL
            /\/shorts\/([^/?]+)/,      // Shorts URL
            /\/embed\/([^/?]+)/,       // Embed URL
            /youtu\.be\/([^/?]+)/      // Shortened URL
        ];

        for (const pattern of patterns) {
            const match = href.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    // Add blacklist buttons to videos
    function processBlacklistButtons() {
        document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
            // Skip if already processed
            if (state.processedVideos.has(item)) return;

            const videoId = extractVideoId(item);
            if (!videoId) return;

            // Skip if already blacklisted
            if (state.blacklist.has(videoId)) return;

            const dismissible = item.querySelector('#dismissible');
            if (!dismissible || dismissible.querySelector('.yt-helper-remove')) return;

            const button = createBlacklistButton(videoId, item);

            // Find the best position for the button
            const thumbnail = item.querySelector('#thumbnail');
            if (thumbnail) {
                thumbnail.style.position = 'relative';
                thumbnail.appendChild(button);
            } else {
                dismissible.style.position = 'relative';
                dismissible.appendChild(button);
            }

            state.processedVideos.add(item);
        });
    }

    // Create blacklist button
    function createBlacklistButton(videoId, itemElement) {
        const button = document.createElement('button');
        button.className = 'yt-helper-remove';
        button.innerHTML = '✕';

        Object.assign(button.style, {
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '28px',
            height: '28px',
            backgroundColor: 'rgba(205, 24, 24, 0.9)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: '10',
            fontSize: '16px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
        });

        // Hover effect
        button.onmouseenter = () => {
            button.style.backgroundColor = 'rgba(205, 24, 24, 1)';
            button.style.transform = 'scale(1.1)';
        };

        button.onmouseleave = () => {
            button.style.backgroundColor = 'rgba(205, 24, 24, 0.9)';
            button.style.transform = 'scale(1)';
        };

        button.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            state.blacklist.add(videoId);
            saveBlacklist();

            // Fade out and remove
            itemElement.style.transition = 'opacity 0.3s ease';
            itemElement.style.opacity = '0';
            setTimeout(() => itemElement.remove(), 300);

            state.stats.blacklisted++;
            console.log(`[YT Helper] Blacklisted video: ${videoId}`);
        };

        return button;
    }

    // Remove blacklisted videos
    function removeBlacklistedVideos() {
        if (state.blacklist.size === 0) return;

        document.querySelectorAll('ytd-rich-item-renderer').forEach(item => {
            const videoId = extractVideoId(item);
            if (videoId && state.blacklist.has(videoId)) {
                item.remove();
            }
        });
    }

    // Set video playback speed
    async function setPlaybackSpeed(retries = 0) {
        const video = document.querySelector('video.html5-main-video');

        if (video) {
            // Only set speed if no manual change has been made and extension is not paused
            if (!state.manualSpeedChange && !state.extensionPaused) {
                video.playbackRate = CONFIG.SPEED;
                state.lastKnownSpeed = CONFIG.SPEED;
            }

            // Listen for rate changes to detect manual changes
            if (!video.hasAttribute('data-speed-set')) {
                video.setAttribute('data-speed-set', 'true');
                video.addEventListener('ratechange', () => {
                    // If the speed was changed to something other than our config speed
                    // and we didn't just set it, mark as manual change
                    if (video.playbackRate !== state.lastKnownSpeed && 
                        video.playbackRate !== CONFIG.SPEED) {
                        state.manualSpeedChange = true;
                        console.log(`[YT Helper] Manual speed change detected: ${video.playbackRate}x`);
                    }
                });
            }
        } else if (retries < CONFIG.MAX_RETRIES) {
            setTimeout(() => setPlaybackSpeed(retries + 1), CONFIG.CLEANUP_INTERVAL);
        }
    }

    // Cleanup old data
    function performInitialCleanup() {
        const now = Date.now();
        const lastCleanup = parseInt(localStorage.getItem(CONFIG.LAST_CLEANUP_KEY) || '0');
        const daysSinceCleanup = (now - lastCleanup) / (1000 * 60 * 60 * 24);

        if (daysSinceCleanup > 7) {
            // Clean up old storage keys from previous version
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('youtubeHelper-') || key.startsWith('ytHelper_')) &&
                    key !== CONFIG.BLACKLIST_KEY && key !== CONFIG.LAST_CLEANUP_KEY) {
                    localStorage.removeItem(key);
                }
            }

            localStorage.setItem(CONFIG.LAST_CLEANUP_KEY, now.toString());
            console.log('[YT Helper] Cleanup completed');
        }
    }

    // Setup global functions for manual control
    function setupGlobalFunctions() {
        window.ytHelper = {
            clearBlacklist: () => {
                state.blacklist.clear();
                saveBlacklist();
                console.log('[YT Helper] Blacklist cleared');
                processPage();
            },

            removeFromBlacklist: (videoId) => {
                if (state.blacklist.delete(videoId)) {
                    saveBlacklist();
                    console.log(`[YT Helper] Removed ${videoId} from blacklist`);
                    processPage();
                }
            },

            getBlacklist: () => [...state.blacklist],

            getStats: () => ({ ...state.stats }),

            setSpeed: (speed) => {
                CONFIG.SPEED = speed;
                state.manualSpeedChange = false; // Reset manual change flag
                state.lastKnownSpeed = speed;
                setPlaybackSpeed();
                console.log(`[YT Helper] Speed set to ${speed}x`);
            },

            resetSpeedControl: () => {
                state.manualSpeedChange = false;
                setPlaybackSpeed();
                console.log('[YT Helper] Speed control reset');
            },

            pauseExtension: () => {
                state.extensionPaused = true;
                console.log('[YT Helper] Extension paused for this page');
            },

            resumeExtension: () => {
                state.extensionPaused = false;
                processPage();
                console.log('[YT Helper] Extension resumed');
            },

            isPaused: () => state.extensionPaused,

            isSpeedManual: () => state.manualSpeedChange,

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

            importBlacklist: async (file) => {
                try {
                    const text = await file.text();
                    const ids = JSON.parse(text);
                    ids.forEach(id => state.blacklist.add(id));
                    saveBlacklist();
                    console.log(`[YT Helper] Imported ${ids.length} video IDs`);
                    processPage();
                } catch (e) {
                    console.error('[YT Helper] Import failed:', e);
                }
            },

            processPage: () => {
                processPage();
                console.log('[YT Helper] Page processing triggered');
            },

            getConfig: () => ({ ...CONFIG }),

            setConfig: (key, value) => {
                if (CONFIG.hasOwnProperty(key)) {
                    CONFIG[key] = value;
                    console.log(`[YT Helper] Config ${key} set to ${value}`);
                }
            }
        };

        console.log('[YT Helper] Initialized. Use window.ytHelper for manual controls.');
    }
})();