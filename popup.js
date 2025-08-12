// Popup functionality for YouTube Helper extension
document.addEventListener('DOMContentLoaded', async () => {
    // Get reference to the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if we're on YouTube
    if (!tab.url.includes('youtube.com')) {
        document.body.innerHTML = `
            <div class="container">
                <div class="header">
                    <h1>🎬 YouTube Helper</h1>
                </div>
                <div class="content" style="text-align: center; padding: 40px 20px;">
                    <p style="color: #4a5568;">This extension only works on YouTube pages.</p>
                    <p style="color: #7c3aed; margin-top: 10px;">Please navigate to YouTube to use the controls.</p>
                </div>
            </div>
        `;
        return;
    }

    // Initialize popup
    await initializePopup(tab.id);
});

async function initializePopup(tabId) {
    // Get DOM elements
    const elements = {
        extensionStatus: document.getElementById('extension-status'),
        toggleExtension: document.getElementById('toggle-extension'),
        speedInput: document.getElementById('speed-input'),
        speedButtons: document.querySelectorAll('.speed-btn'),
        speedStatus: document.getElementById('speed-status'),
        resetSpeed: document.getElementById('reset-speed'),
        removedCount: document.getElementById('removed-count'),
        shortsCount: document.getElementById('shorts-count'),
        blacklistedCount: document.getElementById('blacklisted-count'),
        blacklistTotal: document.getElementById('blacklist-total'),
        exportBlacklist: document.getElementById('export-blacklist'),
        importBlacklist: document.getElementById('import-blacklist'),
        clearBlacklist: document.getElementById('clear-blacklist'),
        importFile: document.getElementById('import-file'),
        overflowThreshold: document.getElementById('overflow-threshold'),
        overflowValue: document.getElementById('overflow-value'),
        refreshStats: document.getElementById('refresh-stats'),
        processPage: document.getElementById('process-page')
    };

    // Load initial state
    await loadState(tabId, elements);

    // Set up event listeners
    setupEventListeners(tabId, elements);
}

async function loadState(tabId, elements) {
    try {
        // Execute script to get current state
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                if (typeof window.ytHelper === 'undefined') {
                    return { error: 'Extension not loaded' };
                }
                
                return {
                    isPaused: window.ytHelper.isPaused(),
                    isSpeedManual: window.ytHelper.isSpeedManual(),
                    stats: window.ytHelper.getStats(),
                    blacklistCount: window.ytHelper.getBlacklist().length,
                    currentSpeed: document.querySelector('video.html5-main-video')?.playbackRate || 1,
                    config: window.ytHelper.getConfig()
                };
            }
        });

        const state = results[0]?.result;
        
        if (state?.error) {
            showError('Extension not fully loaded. Please refresh the page.');
            return;
        }

        // Update UI based on state
        updateExtensionStatus(elements, state.isPaused);
        updateSpeedStatus(elements, state.isSpeedManual, state.currentSpeed);
        updateStats(elements, state.stats, state.blacklistCount);
        updateSettings(elements, state.config);
        
    } catch (error) {
        console.error('Failed to load state:', error);
        showError('Failed to connect to YouTube Helper. Please refresh the page.');
    }
}

function updateExtensionStatus(elements, isPaused) {
    const statusElement = elements.extensionStatus;
    const toggleButton = elements.toggleExtension;
    
    if (isPaused) {
        statusElement.textContent = 'Paused';
        statusElement.className = 'status-value paused';
        toggleButton.textContent = 'Resume Extension';
        toggleButton.className = 'btn btn-primary';
    } else {
        statusElement.textContent = 'Active';
        statusElement.className = 'status-value active';
        toggleButton.textContent = 'Pause for this page';
        toggleButton.className = 'btn btn-secondary';
    }
}

function updateSpeedStatus(elements, isManual, currentSpeed) {
    const speedStatus = elements.speedStatus;
    const speedInput = elements.speedInput;
    
    if (isManual) {
        speedStatus.textContent = `Manual control (${currentSpeed}x)`;
        speedStatus.className = 'manual';
    } else {
        speedStatus.textContent = 'Auto-control enabled';
        speedStatus.className = '';
    }
    
    // Update speed input to current speed
    speedInput.value = currentSpeed;
    
    // Highlight active speed button
    elements.speedButtons.forEach(btn => {
        btn.classList.remove('active');
        if (parseFloat(btn.dataset.speed) === currentSpeed) {
            btn.classList.add('active');
        }
    });
}

function updateStats(elements, stats, blacklistCount) {
    elements.removedCount.textContent = stats.removed || 0;
    elements.shortsCount.textContent = stats.shorts || 0;
    elements.blacklistedCount.textContent = stats.blacklisted || 0;
    elements.blacklistTotal.textContent = blacklistCount || 0;
}

function updateSettings(elements, config) {
    if (config) {
        elements.overflowThreshold.value = config.OVERFLOW || 50;
        elements.overflowValue.textContent = `${config.OVERFLOW || 50}%`;
        elements.speedInput.value = config.SPEED || 1.75;
    }
}

function setupEventListeners(tabId, elements) {
    // Extension toggle
    elements.toggleExtension.addEventListener('click', async () => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    if (window.ytHelper.isPaused()) {
                        window.ytHelper.resumeExtension();
                    } else {
                        window.ytHelper.pauseExtension();
                    }
                }
            });
            
            // Reload state
            await loadState(tabId, elements);
        } catch (error) {
            showError('Failed to toggle extension');
        }
    });

    // Speed controls
    elements.speedInput.addEventListener('change', async () => {
        const speed = parseFloat(elements.speedInput.value);
        if (speed >= 0.25 && speed <= 4) {
            await setSpeed(tabId, speed);
            await loadState(tabId, elements);
        }
    });

    elements.speedButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const speed = parseFloat(button.dataset.speed);
            elements.speedInput.value = speed;
            await setSpeed(tabId, speed);
            await loadState(tabId, elements);
        });
    });

    elements.resetSpeed.addEventListener('click', async () => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => window.ytHelper.resetSpeedControl()
            });
            
            await loadState(tabId, elements);
        } catch (error) {
            showError('Failed to reset speed control');
        }
    });

    // Blacklist controls
    elements.exportBlacklist.addEventListener('click', async () => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => window.ytHelper.exportBlacklist()
            });
        } catch (error) {
            showError('Failed to export blacklist');
        }
    });

    elements.importBlacklist.addEventListener('click', () => {
        elements.importFile.click();
    });

    elements.importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const text = await file.text();
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: (fileContent) => {
                        const mockFile = { text: () => Promise.resolve(fileContent) };
                        return window.ytHelper.importBlacklist(mockFile);
                    },
                    args: [text]
                });
                
                await loadState(tabId, elements);
                showSuccess('Blacklist imported successfully');
            } catch (error) {
                showError('Failed to import blacklist');
            }
        }
    });

    elements.clearBlacklist.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear the entire blacklist? This cannot be undone.')) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => window.ytHelper.clearBlacklist()
                });
                
                await loadState(tabId, elements);
                showSuccess('Blacklist cleared');
            } catch (error) {
                showError('Failed to clear blacklist');
            }
        }
    });

    // Settings
    elements.overflowThreshold.addEventListener('input', () => {
        elements.overflowValue.textContent = `${elements.overflowThreshold.value}%`;
    });

    elements.overflowThreshold.addEventListener('change', async () => {
        const threshold = parseInt(elements.overflowThreshold.value);
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: (newThreshold) => {
                    if (typeof window.ytHelper !== 'undefined') {
                        window.ytHelper.setConfig('OVERFLOW', newThreshold);
                    }
                },
                args: [threshold]
            });
            showSuccess(`Threshold updated to ${threshold}%`);
        } catch (error) {
            showError('Failed to update threshold');
        }
    });

    // Footer actions
    elements.refreshStats.addEventListener('click', async () => {
        await loadState(tabId, elements);
        showSuccess('Stats refreshed');
    });

    elements.processPage.addEventListener('click', async () => {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    if (typeof window.ytHelper !== 'undefined') {
                        window.ytHelper.processPage();
                    }
                }
            });
            
            showSuccess('Page processing triggered');
            // Refresh stats after processing
            setTimeout(() => loadState(tabId, elements), 1000);
        } catch (error) {
            showError('Failed to process page');
        }
    });
}

async function setSpeed(tabId, speed) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (newSpeed) => window.ytHelper.setSpeed(newSpeed),
            args: [speed]
        });
    } catch (error) {
        showError('Failed to set speed');
    }
}

function showError(message) {
    showNotification(message, 'error');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '500',
        zIndex: '1000',
        transition: 'all 0.3s ease',
        backgroundColor: type === 'error' ? '#f56565' : '#48bb78',
        color: 'white',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    });
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
