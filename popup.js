document.addEventListener('DOMContentLoaded', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('youtube.com')) {
        document.querySelector('.content').innerHTML = `
            <p style="text-align:center; color:#4a5568; padding: 24px 16px;">
                Open a YouTube page to use this extension.
            </p>
        `;
        return;
    }

    await initPopup(tab.id);
});

async function initPopup(tabId) {
    const el = {
        status: document.getElementById('extension-status'),
        toggle: document.getElementById('toggle-extension'),
        blacklistedCount: document.getElementById('blacklisted-count'),
        blacklistTotal: document.getElementById('blacklist-total'),
        exportBtn: document.getElementById('export-blacklist'),
        importBtn: document.getElementById('import-blacklist'),
        clearBtn: document.getElementById('clear-blacklist'),
        importFile: document.getElementById('import-file'),
        processPage: document.getElementById('process-page')
    };

    await loadState(tabId, el);
    bindEvents(tabId, el);
}

async function loadState(tabId, el) {
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                if (!window.ytHelper) return { error: true };
                return {
                    isPaused: window.ytHelper.isPaused(),
                    stats: window.ytHelper.getStats(),
                    blacklistTotal: window.ytHelper.getBlacklist().length
                };
            }
        });

        if (!result || result.error) {
            showMsg('Extension not loaded. Refresh the YouTube page.', 'error');
            return;
        }

        updateStatus(el, result.isPaused);
        el.blacklistedCount.textContent = result.stats.blacklisted ?? 0;
        el.blacklistTotal.textContent = result.blacklistTotal ?? 0;
    } catch (err) {
        showMsg('Failed to connect. Refresh the page.', 'error');
    }
}

function updateStatus(el, isPaused) {
    el.status.textContent = isPaused ? 'Paused' : 'Active';
    el.status.className = `status-badge ${isPaused ? 'paused' : 'active'}`;
    el.toggle.textContent = isPaused ? 'Resume' : 'Pause for this page';
}

function bindEvents(tabId, el) {
    el.toggle.addEventListener('click', async () => {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                window.ytHelper.isPaused()
                    ? window.ytHelper.resumeExtension()
                    : window.ytHelper.pauseExtension();
            }
        });
        await loadState(tabId, el);
    });

    el.exportBtn.addEventListener('click', async () => {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.ytHelper.exportBlacklist()
        });
    });

    el.importBtn.addEventListener('click', () => el.importFile.click());

    el.importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId },
                func: (content) => window.ytHelper.importBlacklist(content),
                args: [text]
            });
            showMsg(`Imported ${result} videos`, 'success');
            await loadState(tabId, el);
        } catch {
            showMsg('Import failed — invalid file', 'error');
        }
    });

    el.clearBtn.addEventListener('click', async () => {
        if (!confirm('Clear the entire blacklist? This cannot be undone.')) return;
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.ytHelper.clearBlacklist()
        });
        showMsg('Blacklist cleared', 'success');
        await loadState(tabId, el);
    });

    el.processPage.addEventListener('click', async () => {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.ytHelper.processPage()
        });
        showMsg('Page re-processed', 'success');
        setTimeout(() => loadState(tabId, el), 800);
    });
}

function showMsg(text, type) {
    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.textContent = text;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.opacity = '0';
        setTimeout(() => n.remove(), 300);
    }, 2500);
}
