// Content script for Download Link Collector extension

// Function to find download links on the current page
function findDownloadLinksOnPage() {
  const downloadLinks = [];
  
  // Find all anchor tags with href attributes
  const links = document.querySelectorAll('a[href]');
  
  links.forEach(link => {
    const text = link.textContent.trim();
    const href = link.href;
    
    // Check for exact "Download" text (case insensitive)
    const hasExactDownloadText = text.toLowerCase() === 'download';
    
    if (hasExactDownloadText && href) {
      try {
        // Convert relative URLs to absolute URLs
        const absoluteUrl = new URL(href, window.location.href).href;
        downloadLinks.push({
          text: text,
          url: absoluteUrl,
          element: link.outerHTML
        });
      } catch (error) {
        console.warn('Invalid URL found:', href);
      }
    }
  });
  
  return downloadLinks;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getDownloadLinks') {
    const links = findDownloadLinksOnPage();
    sendResponse({ downloadLinks: links });
  }
});

// Optional: Auto-detect new download links when page content changes
let observer;

function startObserving() {
  if (observer) {
    observer.disconnect();
  }
  
  observer = new MutationObserver((mutations) => {
    let hasNewLinks = false;
    
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const newLinks = node.querySelectorAll ? node.querySelectorAll('a[href]') : [];
            if (newLinks.length > 0) {
              // Check if any of the new links contain "Download"
              const hasDownloadLinks = Array.from(newLinks).some(link => 
                link.textContent.trim().toLowerCase() === 'download'
              );
              if (hasDownloadLinks) {
                hasNewLinks = true;
              }
            }
          }
        });
      }
    });
    
    if (hasNewLinks) {
      // Notify background script of potential new download links
      chrome.runtime.sendMessage({
        action: 'newLinksDetected',
        url: window.location.href
      });
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Start observing when page is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}