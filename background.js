// Background script for Download Link Collector extension

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'collectAllDownloadLinks') {
    collectDownloadLinksFromAllTabs(message.settings);
    sendResponse({received: true});
  }
  return true; // Keep message channel open for async response
});

// Function to collect download links from all open tabs
async function collectDownloadLinksFromAllTabs(settings = {}) {
  try {
    console.log('Starting download link collection...');
    
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    console.log(`Found ${tabs.length} tabs to process`);
    
    const allDownloadLinks = [];
    let processedTabs = 0;
    
    // Process each tab
    for (const tab of tabs) {
      try {
        // Skip chrome:// and other restricted URLs
        if (tab.url.startsWith('chrome://') || 
            tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('edge://') || 
            tab.url.startsWith('about:') ||
            tab.url.startsWith('moz-extension://')) {
          console.log(`Skipping restricted tab: ${tab.url}`);
          continue;
        }

        console.log(`Processing tab: ${tab.title} - ${tab.url}`);

        // Inject content script and get download links
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: findDownloadLinks,
          args: [settings]
        });
        
        if (results && results[0] && results[0].result) {
          const links = results[0].result;
          console.log(`Found ${links.length} download links in tab: ${tab.title}`);
          
          if (links.length > 0) {
            allDownloadLinks.push({
              tabTitle: tab.title,
              tabUrl: tab.url,
              downloadLinks: links
            });
          }
        }
        processedTabs++;
      } catch (error) {
        console.log(`Error processing tab ${tab.id} (${tab.title}): ${error.message}`);
      }
    }
    
    console.log(`Processed ${processedTabs} tabs, found ${allDownloadLinks.length} tabs with download links`);
    
    // Calculate total links
    const totalLinks = allDownloadLinks.reduce((sum, tab) => sum + tab.downloadLinks.length, 0);
    
    // Send results to popup (let popup handle file creation)
    if (allDownloadLinks.length > 0) {
      console.log(`Sending ${totalLinks} links from ${allDownloadLinks.length} tabs to popup`);
      
      // Notify popup of success
      chrome.runtime.sendMessage({
        action: 'collectionComplete',
        success: true,
        linkCount: totalLinks,
        tabCount: allDownloadLinks.length,
        results: allDownloadLinks // Send the actual results
      });
    } else {
      console.log('No download links found in any tabs');
      // Notify popup that no links were found
      chrome.runtime.sendMessage({
        action: 'collectionComplete',
        success: false,
        linkCount: 0,
        tabCount: 0
      });
    }
    
  } catch (error) {
    console.error('Error collecting download links:', error);
    // Notify popup of error
    chrome.runtime.sendMessage({
      action: 'collectionError',
      error: error.message
    });
  }
}

// Function to be injected into each tab to find download links
function findDownloadLinks(settings = {}) {
  const downloadLinks = [];
  
  // Find all anchor tags
  const links = document.querySelectorAll('a[href]');
  
  console.log(`Scanning ${links.length} links on page: ${window.location.href}`);
  
  links.forEach(link => {
    const text = link.textContent.trim();
    const href = link.href;
    
    // Check for exact "Download" text (case insensitive)
    const hasDownloadText = text.toLowerCase() === 'download';
    
    // Optional: Also check if "Download" is a significant part of the text
    // This catches cases like "Download File", "Download Now", etc.
    const containsDownloadWord = settings.allowDownloadVariations ? 
      /\bdownload\b/i.test(text) : false;
    
    const isValidDownloadLink = hasDownloadText || containsDownloadWord;
    
    if (isValidDownloadLink && href && href !== '#' && href !== 'javascript:void(0)') {
      try {
        // Convert relative URLs to absolute URLs
        const absoluteUrl = new URL(href, window.location.href).href;
        downloadLinks.push({
          text: text,
          url: absoluteUrl,
          context: link.outerHTML.substring(0, 200) // Limit context length
        });
      } catch (error) {
        console.warn('Invalid URL found:', href);
      }
    }
  });
  
  console.log(`Found ${downloadLinks.length} download links on this page`);
  return downloadLinks;
}

// Function to save links to a text file
async function saveLinksToFile(allDownloadLinks) {
  try {
    let fileContent = '';
    
    // Collect all URLs in a simple list, one per line
    allDownloadLinks.forEach((tabData) => {
      tabData.downloadLinks.forEach((link) => {
        fileContent += link.url + '\n';
      });
    });
    
    // Create data URL instead of blob URL
    const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(fileContent);
    
    const filename = `download_links_${new Date().toISOString().split('T')[0]}.txt`;
    
    console.log('Attempting to download file:', filename);
    
    // Use chrome.downloads API to save the file
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true // This will show the save dialog so user can choose location
    });
    
    console.log('Download started with ID:', downloadId);
    
    // Listen for download completion
    const downloadListener = function(downloadDelta) {
      if (downloadDelta.id === downloadId && downloadDelta.state) {
        if (downloadDelta.state.current === 'complete') {
          console.log('Download completed successfully');
          chrome.downloads.onChanged.removeListener(downloadListener);
        } else if (downloadDelta.state.current === 'interrupted') {
          console.log('Download was interrupted');
          chrome.downloads.onChanged.removeListener(downloadListener);
        }
      }
    };
    
    chrome.downloads.onChanged.addListener(downloadListener);
    
    console.log('Download links saved successfully');
    
  } catch (error) {
    console.error('Error saving file:', error);
    throw error; // Re-throw to handle in calling function
  }
}

// Auto-collect on extension startup (optional)
chrome.runtime.onStartup.addListener(() => {
  // Uncomment the line below if you want auto-collection on browser startup
  // collectDownloadLinksFromAllTabs();
});