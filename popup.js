const folderInput = document.getElementById('folder');
const savedMsg = document.getElementById('saved');

chrome.storage.local.get(['downloadFolder'], (result) => {
  folderInput.value = result.downloadFolder || '';
});

let saveTimeout;
folderInput.addEventListener('input', () => {
  const value = folderInput.value.trim();
  chrome.storage.local.set({ downloadFolder: value }, () => {
    savedMsg.classList.add('show');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => savedMsg.classList.remove('show'), 1500);
  });
});
