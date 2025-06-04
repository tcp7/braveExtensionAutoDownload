// Popup script for Download Link Collector extension

document.addEventListener('DOMContentLoaded', function() {
    const collectBtn = document.getElementById('collectBtn');
    const viewResultsBtn = document.getElementById('viewResultsBtn');
    const copyBtn = document.getElementById('copyBtn');
    const statusDiv = document.getElementById('status');
    const resultsDiv = document.getElementById('results');
    const resultsContent = document.getElementById('resultsContent');
    const autoCollectCheckbox = document.getElementById('autoCollect');
    const downloadVariationsCheckbox = document.getElementById('allowDownloadVariations');
    
    let lastResults = null;
    
    console.log('Popup loaded');
    
    // Load saved settings
    chrome.storage.sync.get(['autoCollect', 'allowDownloadVariations'], function(result) {
        autoCollectCheckbox.checked = result.autoCollect !== false; // Default to true
        downloadVariationsCheckbox.checked = result.allowDownloadVariations === true; // Default to false
    });
    
    // Save settings when changed
    autoCollectCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({autoCollect: this.checked});
    });
    
    downloadVariationsCheckbox.addEventListener('change', function() {
        chrome.storage.sync.set({allowDownloadVariations: this.checked});
    });
    
    // Handle collect button click
    collectBtn.addEventListener('click', function() {
        collectDownloadLinks();
    });
    
    // Handle view results button
    viewResultsBtn.addEventListener('click', function() {
        if (lastResults) {
            displayResults(lastResults);
        }
    });
    
    // Handle copy button
    copyBtn.addEventListener('click', function() {
        const textToCopy = resultsContent.textContent;
        navigator.clipboard.writeText(textToCopy).then(function() {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy All';
            }, 2000);
        }).catch(function(err) {
            console.error('Could not copy text: ', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy All';
            }, 2000);
        });
    });
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('Received message in popup:', message);
        
        if (message.action === 'collectionComplete') {
            collectBtn.disabled = false;
            collectBtn.textContent = 'Collect All Download Links';
            
            if (message.success) {
                lastResults = message.results; // Store results for viewing
                viewResultsBtn.style.display = 'block'; // Show view results button
                
                // Also create and download the file from popup context
                createAndDownloadFile(message.results);
                
                showStatus(`Successfully collected ${message.linkCount} download links from ${message.tabCount} tabs!`, 'success');
            } else {
                showStatus('No links with "Download" text found in any open tabs.', 'info');
            }
            
            // Hide status after 5 seconds
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        } else if (message.action === 'collectionError') {
            collectBtn.disabled = false;
            collectBtn.textContent = 'Collect All Download Links';
            showStatus(`Error occurred: ${message.error || 'Unknown error'}. Please try again.`, 'error');
            
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 7000);
        }
        
        return true; // Keep message channel open
    });
    
    function collectDownloadLinks() {
        console.log('Starting collection process...');
        
        // Disable button and show processing status
        collectBtn.disabled = true;
        collectBtn.textContent = 'Collecting...';
        
        const variationsEnabled = downloadVariationsCheckbox.checked;
        const statusMessage = variationsEnabled 
            ? 'Scanning all tabs for "Download" links and variations...' 
            : 'Scanning all tabs for exact "Download" text links...';
        
        showStatus(statusMessage, 'info');
        
        // Send message to background script
        chrome.runtime.sendMessage({
            action: 'collectAllDownloadLinks',
            settings: {
                allowDownloadVariations: downloadVariationsCheckbox.checked
            }
        }, function(response) {
            console.log('Message sent to background script, response:', response);
            if (chrome.runtime.lastError) {
                console.error('Runtime error:', chrome.runtime.lastError);
                collectBtn.disabled = false;
                collectBtn.textContent = 'Collect All Download Links';
                showStatus('Error: Could not communicate with background script', 'error');
            }
        });
        
        // Set a timeout in case no response comes back
        setTimeout(() => {
            if (collectBtn.disabled) {
                console.log('Timeout reached, re-enabling button');
                collectBtn.disabled = false;
                collectBtn.textContent = 'Collect All Download Links';
                showStatus('Operation timed out. Please try again.', 'error');
            }
        }, 30000); // 30 second timeout
    }
    
    function createAndDownloadFile(results) {
        try {
            let content = '';
            
            // Collect all URLs in a simple list, one per line
            results.forEach((tabData) => {
                tabData.downloadLinks.forEach((link) => {
                    content += link.url + '\n';
                });
            });
            
            // Create blob and download in popup context
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            // Create a temporary download link
            const a = document.createElement('a');
            a.href = url;
            a.download = `download_links_${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            console.log('File downloaded successfully from popup');
            
        } catch (error) {
            console.error('Error creating file in popup:', error);
        }
    }
    
    function displayResults(results) {
        let content = '';
        
        // Show URLs only, one per line
        results.forEach((tabData) => {
            tabData.downloadLinks.forEach((link) => {
                content += link.url + '\n';
            });
        });
        
        resultsContent.textContent = content;
        resultsDiv.style.display = 'block';
    }
    
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
    }
    
    // Show current tab info
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            const currentTab = tabs[0];
            // You could add current tab info display here if needed
        }
    });
});

// Handle keyboard shortcuts
document.addEventListener('keydown', function(event) {
    // Ctrl+Enter or Cmd+Enter to collect links
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        document.getElementById('collectBtn').click();
    }
});