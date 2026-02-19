// Handle injection requests and downloads

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Inject full content script when Jira is detected
  if (message.action === 'injectContextJira' && sender.tab?.id) {
    chrome.scripting.insertCSS({
      target: { tabId: sender.tab.id },
      files: ['content.css']
    }).then(() => {
      return chrome.scripting.executeScript({
        target: { tabId: sender.tab.id },
        files: ['content.js']
      });
    }).catch(() => {
      // Silently fail — page may have navigated away
    });
    return;
  }

  // Download single file
  if (message.action === 'downloadFile') {
    const { url, filename, folder } = message;
    const downloadPath = folder ? `${folder}/${filename}` : filename;

    chrome.downloads.download({
      url: url,
      filename: downloadPath,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });
    return true;
  }

  // Download all files
  if (message.action === 'downloadAll') {
    const { files, folder } = message;
    let completed = 0;
    let failed = 0;

    files.forEach((file) => {
      const downloadPath = folder ? `${folder}/${file.filename}` : file.filename;
      chrome.downloads.download({
        url: file.url,
        filename: downloadPath,
        saveAs: false
      }, () => {
        if (chrome.runtime.lastError) failed++;
        completed++;
        if (completed === files.length) {
          sendResponse({ success: true, total: files.length, failed });
        }
      });
    });
    return true;
  }
});
