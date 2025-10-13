// What's That!? - Content Script
console.log("What's That!?: Content script loaded!");
console.log('Document URL:', document.URL);
console.log('Document readyState:', document.readyState);

// Create a debug panel that doesn't require opening DevTools
window.showDebugPanel = function() {
  // Remove existing panel if any
  const existing = document.getElementById('whatsapp-analyzer-debug');
  if (existing) existing.remove();
  
  const panel = document.createElement('div');
  panel.id = 'whatsapp-analyzer-debug';
  panel.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 350px;
    max-height: 80vh;
    background: white;
    border: 2px solid #25d366;
    border-radius: 8px;
    padding: 16px;
    z-index: 999999;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    font-family: monospace;
    font-size: 11px;
  `;
  
  const tracker = window.tracker;
  
  let html = '<h3 style="margin: 0 0 12px 0; color: #25d366;">Extension Debug</h3>';
  
  if (!tracker) {
    html += '<p style="color: red;">ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Tracker not initialized!</p>';
  } else {
    html += `<p>ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Tracker active</p>`;
    html += `<p><strong>Messages tracked:</strong> ${tracker.reactionData.size}</p>`;
    
    const chats = tracker.getAvailableChats();
    html += `<p><strong>Chats found:</strong> ${chats.length}</p>`;
    
    // Show unique senders
    const senders = new Set();
    tracker.reactionData.forEach(data => senders.add(data.sender));
    html += `<p><strong>Unique senders:</strong> ${senders.size}</p>`;
    html += '<div style="margin-top: 8px; font-size: 10px; color: #666;">';
    Array.from(senders).slice(0, 10).forEach(sender => {
      html += `- ${sender}<br>`;
    });
    html += '</div>';
    
    // Show reaction stats
    let totalReactions = 0;
    tracker.reactionData.forEach(data => {
      data.reactions.forEach(reactorMap => {
        reactorMap.forEach(count => totalReactions += count);
      });
    });
    html += `<p><strong>Total reactions:</strong> ${totalReactions}</p>`;
  }
  
  html += `<button onclick="document.getElementById('whatsapp-analyzer-debug').remove()" 
    style="margin-top: 12px; padding: 8px 16px; background: #25d366; color: white; border: none; border-radius: 4px; cursor: pointer;">
    Close
  </button>`;
  
  panel.innerHTML = html;
  document.body.appendChild(panel);
};

console.log('ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢Ãƒâ€šÃ‚Â¡ Tip: Run window.showDebugPanel() to see stats without opening DevTools!');

class WhatsAppReactionTracker {
  constructor() {
    this.reactionData = new Map();
    this.currentChat = { id: 'unknown', name: 'Unknown Chat' };
    this._scanTimer = null;
    this.init();
  }

  init() {
    console.log("What's That!?: Initializing...");
    
    // Wait for WhatsApp to be ready with multiple checks
    this.waitForWhatsApp();
  }

  waitForWhatsApp(attempts = 0) {
    // Check if extension context is still valid
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      console.log("What's That!?: Extension context invalidated, stopping");
      return;
    }
    
    console.log(`What's That!?: Checking if WhatsApp is ready (attempt ${attempts + 1}/10)...`);
    
    const main = document.querySelector('#main');
    const messages = document.querySelectorAll('[data-pre-plain-text]');
    
    console.log(`  - #main found: ${!!main}`);
    console.log(`  - Messages found: ${messages.length}`);
    
    if (main && messages.length > 0) {
      console.log("What's That!?: WhatsApp is ready!");
      this.scanMessages();
      this.setupObserver();
      this.setupRealTimeMonitoring();
    } else if (attempts < 10) {
      setTimeout(() => this.waitForWhatsApp(attempts + 1), 2000);
    } else {
      console.log("What's That!?: Timeout waiting for WhatsApp. Manual scan may be needed.");
      console.log('Run: window.tracker.scanMessages() to scan manually');
    }
  }

  scanMessages() {
    console.log("What's That!?: Scanning messages...");
    
    const messages = document.querySelectorAll('[data-pre-plain-text]');
    console.log(`Found ${messages.length} messages`);
    
    // Track unique senders for mock data
    const uniqueSenders = new Set();
    // Capture current chat info once per scan
    this.currentChat = this.getCurrentChatInfo();
    
    messages.forEach((msg, index) => {
      const prePlainText = msg.getAttribute('data-pre-plain-text') || '';
      console.log(`Message ${index + 1}: "${prePlainText}"`);
      
      // Enhanced sender extraction with multiple strategies
      let sender = this.extractSenderName(msg, prePlainText);
      
      if (!sender) sender = 'Unknown';
      if (sender) {
        uniqueSenders.add(sender);
        const messageId = this.generateMessageId(msg, prePlainText, sender, this.currentChat.id);
        
        // Extract reactions from a broader root (message row/container), not just the inner copyable node
        const reactionRoot = msg.closest('[role="row"]') 
          || msg.closest('[data-testid*="msg-container"]') 
          || msg.parentElement 
          || msg;
        const reactions = this.extractReactionsRobust(reactionRoot, sender);

        // Extract reply target (who this message replies to), if any
        const replyTo = this.extractReplyTo(msg, sender);
        
        // Extract actual message timestamp
        const messageTimestamp = this.extractMessageTimestamp(msg, prePlainText);
        
        // Compute message length (approximate) from the message row
        let messageLength = 0;
        try {
          const messageText = (reactionRoot && reactionRoot.innerText) ? reactionRoot.innerText.replace(/\s+/g, ' ').trim() : '';
          messageLength = messageText.length;
        } catch {}
        
        // TEMPORARY: Add mock reactions to demonstrate the analytics
        // Remove this once real reactions are detected
        if (false && reactions.size === 0 && Math.random() > 0.5) {
          const allSenders = Array.from(uniqueSenders);
          if (allSenders.length > 1) {
            // Pick a random person to react
            const reactor = allSenders[Math.floor(Math.random() * allSenders.length)];
            if (reactor !== sender) {
              const emojis = ['ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚Â', 'ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â', 'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¹Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡', 'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒâ€šÃ‚Â¥', 'ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚Â'];
              const emoji = emojis[Math.floor(Math.random() * emojis.length)];
              
              reactions.set(emoji, new Map([[reactor, 1]]));
              console.log(`  - [MOCK] Added reaction: ${emoji} from ${reactor}`);
            }
          }
        }
        
        this.reactionData.set(messageId, {
          sender: sender,
          reactions: reactions,
          timestamp: messageTimestamp, // Actual message timestamp
          chatId: this.currentChat.id,
          chatName: this.currentChat.name,
          replyTo: replyTo || null,
          messageLength: messageLength
        });
        
        console.log(`  - Extracted sender: ${sender}, Reactions: ${reactions.size}`);
      }
    });
    
    console.log(`Total messages tracked: ${this.reactionData.size}`);
    this.sendDataToBackground();
  }

  extractReactions(messageElement, messageSender) {
    const reactions = new Map();
    
    // Look for reaction elements in the message
    // WhatsApp shows reactions in various ways - let's look for common patterns
    
    // 1. Look for elements with reaction-related classes or attributes
    const reactionSelectors = [
      '[data-testid*="reaction"]',
      '[class*="reaction"]',
      '[aria-label*="reaction"]',
      'span[title*="reacted"]',
      'div[title*="reacted"]'
    ];
    
    reactionSelectors.forEach(selector => {
      const reactionElements = messageElement.querySelectorAll(selector);
      reactionElements.forEach(el => {
        const ariaLabel = el.getAttribute('aria-label') || '';
        const title = el.getAttribute('title') || '';
        const text = el.textContent || '';
        
        // Try to parse reaction information
        // Common patterns: "John reacted with ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚Â", "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚Â John, Mary"
        const combined = `${ariaLabel} ${title} ${text}`;
        
        // Extract emoji
        const emojiMatch = combined.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu);
        if (emojiMatch) {
          const emoji = emojiMatch[0];
          
          // Extract who reacted
          const nameMatch = combined.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s(?:reacted|with)/);
          if (nameMatch) {
            const reactor = nameMatch[1].trim();
            if (!reactions.has(emoji)) {
              reactions.set(emoji, new Map());
            }
            reactions.get(emoji).set(reactor, 1);
          }
        }
      });
    });
    
    // 2. Look for reaction counts in the message's parent container
    // Sometimes reactions are shown as a summary like "2" with emojis
    const parent = messageElement.parentElement;
    if (parent) {
      const countElements = parent.querySelectorAll('div[title], span[title]');
      countElements.forEach(el => {
        const title = el.getAttribute('title');
        if (title && title.length < 10 && /^\d+$/.test(title)) {
          // This might be a reaction count
          console.log(`  Found potential reaction count: ${title}`);
        }
      });
    }
    
    return reactions;
  }

  setupObserver() {
    const mainContainer = document.querySelector('#main');
    if (!mainContainer) {
      console.log("What's That!?: No main container found");
      return;
    }
    
    console.log("What's That!?: Setting up observer...");
    
    const observer = new MutationObserver(() => {
      // Check if extension is still valid before scanning
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        console.log("What's That!?: Extension invalidated, stopping observer");
        observer.disconnect();
        return;
      }
      this.scheduleScan();
    });
    
    observer.observe(mainContainer, {
      childList: true,
      subtree: true
    });
  }

  scheduleScan() {
    try {
      if (this._scanTimer) clearTimeout(this._scanTimer);
      this._scanTimer = setTimeout(() => {
        const previousCount = this.reactionData.size;
        this.scanMessages();
        
        // If new messages were detected, send data to background
        if (this.reactionData.size > previousCount) {
          console.log(`What's That!?: ${this.reactionData.size - previousCount} new messages detected, sending to background`);
          this.sendDataToBackground();
        }
        
        this._scanTimer = null;
      }, 500);
    } catch (e) {
      this.scanMessages();
    }
  }

  sendDataToBackground() {
    try {
      const dataToSend = {};
      this.reactionData.forEach((value, key) => {
        const reactionsObj = Object.fromEntries(
          Array.from(value.reactions.entries()).map(([emoji, reactors]) => [
            emoji,
            Object.fromEntries(reactors)
          ])
        );
        dataToSend[key] = {
          sender: value.sender,
          reactions: reactionsObj,
          timestamp: value.timestamp,
          chatId: value.chatId,
          chatName: value.chatName,
          replyTo: value.replyTo || null,
          messageLength: typeof value.messageLength === 'number' ? value.messageLength : 0
        };
      });
      
      console.log(`Sending ${Object.keys(dataToSend).length} messages to background`);
      
      // Check if chrome.runtime is available
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        console.log('Chrome runtime not available - extension may be reloading');
        return;
      }
      
      chrome.runtime.sendMessage({
        type: 'REACTION_DATA_UPDATE',
        data: dataToSend
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Error sending data:', chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      console.log('Error in sendDataToBackground:', error.message);
    }
  }

  // Controlled backfill: scroll up in steps to load older messages
  async startBackfill(options = {}) {
    const {
      stepDelayMs = 1000,
      steps = 50,
      pauseOnActivity = true
    } = options;
    try {
      const container = document.querySelector('#main [role="application"], #main [data-testid*="conversation-panel"], #main');
      let performed = 0;
      const isUserActive = () => {
        // Heuristic: if mouse is down or keys pressed recently, treat as active
        return false;
      };
      while (performed < steps) {
        if (pauseOnActivity && isUserActive()) break;
        // Attempt to scroll the messages list upward
        const scrollable = document.querySelector('#main ._ajyl, #main [role="main"], #main');
        if (scrollable && typeof scrollable.scrollBy === 'function') {
          scrollable.scrollBy({ top: -800, behavior: 'auto' });
        } else {
          window.scrollBy(0, -800);
        }
        // Let DOM load, then rescan
        await new Promise(r => setTimeout(r, stepDelayMs));
        this.scanMessages();
        performed++;
      }
      return { performed };
    } catch (e) {
      return { error: String(e && e.message || e) };
    }
  }

  getAvailableChats() {
    console.log('=== GET AVAILABLE CHATS ===');
    console.log('Total messages tracked:', this.reactionData.size);
    
    const chatMap = new Map();
    this.reactionData.forEach((messageData) => {
      if (messageData.chatId) {
        chatMap.set(messageData.chatId, messageData.chatName || messageData.chatId);
      }
    });
    const chats = Array.from(chatMap.entries()).map(([id, name]) => ({ id, name, type: 'tracked' }));
    console.log(`Final chats array: ${chats.length}`, chats);
    return chats;
  }

  // Enhanced reaction extraction with multiple detection strategies
  extractReactionsRobust(messageElement, messageSender) {
    // Ensure we search in the outer message container so we don’t miss reaction chips
    const searchRoot = messageElement.closest('[role="row"]') 
      || messageElement.closest('[data-testid*="msg-container"]') 
      || messageElement;
    const reactions = new Map();
    const debugInfo = { strategies: [], found: 0 };

    // Strategy 0: Generic reaction chips in modern WhatsApp
    const genericChips = this.findReactionChipsGeneric(searchRoot);
    if (genericChips.length > 0) {
      debugInfo.strategies.push('generic-chips');
      genericChips.forEach(chip => {
        const chipData = this.extractFromReactionChip(chip, messageSender);
        chipData.forEach((reactors, emoji) => {
          if (!reactions.has(emoji)) reactions.set(emoji, new Map());
          reactors.forEach((count, reactor) => {
            const current = reactions.get(emoji).get(reactor) || 0;
            reactions.get(emoji).set(reactor, current + count);
          });
        });
      });
    }

    // Strategy 1: Look for WhatsApp's reaction buttons/indicators
    const reactionButtons = this.findReactionButtons(searchRoot);
    if (reactionButtons.length > 0) {
      debugInfo.strategies.push('reaction-buttons');
      reactionButtons.forEach(button => {
        const buttonReactions = this.extractFromReactionButton(button, messageSender);
        buttonReactions.forEach((reactors, emoji) => {
          if (!reactions.has(emoji)) reactions.set(emoji, new Map());
          reactors.forEach((count, reactor) => {
            const current = reactions.get(emoji).get(reactor) || 0;
            reactions.get(emoji).set(reactor, current + count);
          });
        });
      });
    }

    // Strategy 2: Look for reaction tooltips and hover states
    const tooltipReactions = this.findReactionTooltips(searchRoot);
    if (tooltipReactions.length > 0) {
      debugInfo.strategies.push('tooltips');
      tooltipReactions.forEach(tooltip => {
        const tooltipData = this.extractFromTooltip(tooltip, messageSender);
        tooltipData.forEach((reactors, emoji) => {
          if (!reactions.has(emoji)) reactions.set(emoji, new Map());
          reactors.forEach((count, reactor) => {
            const current = reactions.get(emoji).get(reactor) || 0;
            reactions.get(emoji).set(reactor, current + count);
          });
        });
      });
    }

    // Strategy 3: Look for reaction counts and emoji indicators
    const countReactions = this.findReactionCounts(searchRoot);
    if (countReactions.length > 0) {
      debugInfo.strategies.push('counts');
      countReactions.forEach(countEl => {
        const countData = this.extractFromCountElement(countEl, messageSender);
        countData.forEach((reactors, emoji) => {
          if (!reactions.has(emoji)) reactions.set(emoji, new Map());
          reactors.forEach((count, reactor) => {
            const current = reactions.get(emoji).get(reactor) || 0;
            reactions.get(emoji).set(reactor, current + count);
          });
        });
      });
    }

    // Strategy 4: Look for emoji-only reactions in message context
    const emojiReactions = this.findEmojiReactions(searchRoot);
    if (emojiReactions.length > 0) {
      debugInfo.strategies.push('emoji-only');
      emojiReactions.forEach(emojiEl => {
        const emojiData = this.extractFromEmojiElement(emojiEl, messageSender);
        emojiData.forEach((reactors, emoji) => {
          if (!reactions.has(emoji)) reactions.set(emoji, new Map());
          reactors.forEach((count, reactor) => {
            const current = reactions.get(emoji).get(reactor) || 0;
            reactions.get(emoji).set(reactor, current + count);
          });
        });
      });
    }

    // Strategy 5: Modern WhatsApp reaction detection
    const modernReactions = this.findModernReactions(searchRoot);
    if (modernReactions.length > 0) {
      debugInfo.strategies.push('modern-detection');
      modernReactions.forEach(reactionEl => {
        const reactionData = this.extractFromModernReaction(reactionEl, messageSender);
        reactionData.forEach((reactors, emoji) => {
          if (!reactions.has(emoji)) reactions.set(emoji, new Map());
          reactors.forEach((count, reactor) => {
            const current = reactions.get(emoji).get(reactor) || 0;
            reactions.get(emoji).set(reactor, current + count);
          });
        });
      });
    }

    debugInfo.found = reactions.size;
    if (debugInfo.found > 0) {
      console.log(`What's That!?: Found ${debugInfo.found} reactions using strategies:`, debugInfo.strategies);
    } else {
      console.log(`What's That!?: No reactions found for message from ${messageSender}`);
    }

    return reactions;
  }

  // Strategy 0 helper: likely reaction chip containers
  findReactionChipsGeneric(messageElement) {
    const selectors = [
      '[data-testid="msg-reactions"]',
      '[data-testid^="msg-reactions"]',
      '[data-testid*="reactions"]',
      '[data-testid*="reaction-emoji"]',
      '[data-testid*="reactions-emoji"]',
      '[class*="reactions"]',
      '[class*="msg-reaction"]',
      '[aria-label*="Reacted"]', // English UI
      '[aria-label*="reaction"]'
    ];
    const out = [];
    selectors.forEach(sel => {
      try {
        messageElement.querySelectorAll(sel).forEach(el => out.push(el));
      } catch {}
    });
    return out;
  }

  // Strategy 0 extractor: parse a chip container
  extractFromReactionChip(el, messageSender) {
    const reactions = new Map();
    try {
      const aria = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      const text = el.textContent || '';
      const combined = `${aria} ${title} ${text}`;

      // Emojis present in the chip cluster
      const emojis = this.extractEmojisFromText(combined);

      // Try to get reactors; default to Unknown when missing
      const candidates = [combined];
      let p = el.parentElement; let steps = 0;
      while (p && steps < 2) {
        candidates.push(`${p.getAttribute('aria-label') || ''} ${p.getAttribute('title') || ''} ${p.textContent || ''}`);
        p = p.parentElement; steps++;
      }
      const reactorSet = this._extractReactorsFromCandidates(candidates, messageSender);
      const reactors = Array.from(reactorSet);
      const finalReactors = reactors.length ? reactors : ['Unknown'];

      emojis.forEach(emoji => {
        reactions.set(emoji, new Map());
        finalReactors.forEach(r => reactions.get(emoji).set(r, 1));
      });
    } catch {}
    return reactions;
  }

  // Strategy 1: Find reaction buttons
  findReactionButtons(messageElement) {
    const selectors = [
      // Modern WhatsApp selectors
      '[data-testid*="reaction"]',
      '[data-testid*="reaction-"]',
      '[data-testid*="msg-reaction"]',
      '[data-testid*="reaction-button"]',
      
      // Button-based reactions
      'button[aria-label*="reaction"]',
      'button[aria-label*="reacted"]',
      'div[role="button"][aria-label*="reaction"]',
      'div[role="button"][aria-label*="reacted"]',
      
      // Class-based selectors
      '.reaction-button',
      '[class*="reaction-button"]',
      '[class*="reaction"]',
      '[class*="emoji-reaction"]',
      
      // Generic emoji containers
      'span[role="img"]',
      'div[role="img"]',
      '[data-emoji]',
      
      // WhatsApp specific patterns
      '[aria-label*="👍"]',
      '[aria-label*="❤️"]',
      '[aria-label*="😂"]',
      '[aria-label*="😮"]',
      '[aria-label*="😢"]',
      '[aria-label*="🙏"]'
    ];

    const buttons = [];
    selectors.forEach(selector => {
      try {
        const elements = messageElement.querySelectorAll(selector);
        elements.forEach(el => buttons.push(el));
      } catch (e) {
        // ignore
      }
    });

    return buttons;
  }

  // Strategy 2: Find reaction tooltips
  findReactionTooltips(messageElement) {
    const selectors = [
      '[title*="reacted"]',
      '[aria-label*="reacted"]',
      '[title*="Reacted by"]',
      '[aria-label*="Reacted by"]',
      '[title*="reaction"]',
      '[aria-label*="reaction"]'
    ];

    const tooltips = [];
    selectors.forEach(selector => {
      try {
        const elements = messageElement.querySelectorAll(selector);
        elements.forEach(el => {
          const title = el.getAttribute('title') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          if (title.includes('reacted') || ariaLabel.includes('reacted') || 
              title.includes('reaction') || ariaLabel.includes('reaction')) {
            tooltips.push(el);
          }
        });
      } catch (e) {
        // ignore
      }
    });

    return tooltips;
  }

  // Strategy 3: Find reaction counts
  findReactionCounts(messageElement) {
    const selectors = [
      'span[title]',
      'div[title]',
      '[data-testid*="count"]',
      '[data-testid*="reaction-count"]',
      '[class*="count"]',
      '[class*="reaction-count"]',
      '[class*="number"]'
    ];

    const counts = [];
    selectors.forEach(selector => {
      try {
        const elements = messageElement.querySelectorAll(selector);
        elements.forEach(el => {
          const title = el.getAttribute('title') || '';
          const text = el.textContent || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          
          // Look for numeric counts that might be reaction counts
          if (/^\d+$/.test(text.trim()) && text.length <= 3) {
            counts.push(el);
          }
          
          // Also check for reaction-related attributes
          if (title.includes('reaction') || ariaLabel.includes('reaction') ||
              title.includes('reacted') || ariaLabel.includes('reacted')) {
            counts.push(el);
          }
        });
      } catch (e) {
        // ignore
      }
    });

    return counts;
  }

  // Strategy 4: Find emoji reactions
  findEmojiReactions(messageElement) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const elements = messageElement.querySelectorAll('*');
    const emojiElements = [];

    elements.forEach(el => {
      const text = el.textContent || '';
      const ariaLabel = el.getAttribute('aria-label') || '';
      const title = el.getAttribute('title') || '';
      
      // Check if element contains emojis and is likely a reaction
      if (emojiRegex.test(text) && text.length <= 10) { // Short text with emojis
        emojiElements.push(el);
      }
      
      // Also check aria-label and title for emoji reactions
      if (emojiRegex.test(ariaLabel) || emojiRegex.test(title)) {
        emojiElements.push(el);
      }
    });

    return emojiElements;
  }

  // Strategy 5: Modern WhatsApp reaction detection
  findModernReactions(messageElement) {
    const selectors = [
      // Latest WhatsApp reaction selectors
      '[data-testid*="reaction"]',
      '[data-testid*="msg-reaction"]',
      '[data-testid*="reaction-button"]',
      '[data-testid*="reaction-count"]',
      
      // Modern emoji reaction patterns
      'span[role="img"][aria-label*="👍"]',
      'span[role="img"][aria-label*="❤️"]',
      'span[role="img"][aria-label*="😂"]',
      'span[role="img"][aria-label*="😮"]',
      'span[role="img"][aria-label*="😢"]',
      'span[role="img"][aria-label*="🙏"]',
      
      // Generic emoji containers with reactions
      'div[role="img"]',
      'span[role="img"]',
      '[data-emoji]',
      
      // Class-based modern selectors
      '[class*="reaction"]',
      '[class*="emoji-reaction"]',
      '[class*="msg-reaction"]'
    ];

    const reactions = [];
    selectors.forEach(selector => {
      try {
        const elements = messageElement.querySelectorAll(selector);
        elements.forEach(el => {
          const ariaLabel = el.getAttribute('aria-label') || '';
          const title = el.getAttribute('title') || '';
          const text = el.textContent || '';
          
          // Check if this looks like a reaction element
          if (ariaLabel.includes('reacted') || ariaLabel.includes('reaction') ||
              title.includes('reacted') || title.includes('reaction') ||
              /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(text) ||
              /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(ariaLabel)) {
            reactions.push(el);
          }
        });
      } catch (e) {
        // ignore
      }
    });

    return reactions;
  }

  // Extract reactions from modern reaction elements
  extractFromModernReaction(reactionEl, messageSender) {
    const reactions = new Map();
    const ariaLabel = reactionEl.getAttribute('aria-label') || '';
    const title = reactionEl.getAttribute('title') || '';
    const text = reactionEl.textContent || '';
    
    const combined = `${ariaLabel} ${title} ${text}`;
    
    // Extract emojis from the element
    const emojis = this.extractEmojisFromText(combined);
    
    // Extract reactor names using multiple candidate strings
    const candidates = [combined];
    let p = reactionEl.parentElement; let steps = 0;
    while (p && steps < 2) {
      candidates.push(`${p.getAttribute('aria-label') || ''} ${p.getAttribute('title') || ''} ${p.textContent || ''}`);
      p = p.parentElement; steps++;
    }
    const reactors = Array.from(this._extractReactorsFromCandidates(candidates, messageSender));
    
    // If no reactors found, try to extract from parent elements
    let finalReactors = reactors;
    if (finalReactors.length === 0) {
      let parent = reactionEl.parentElement;
      let attempts = 0;
      while (parent && attempts < 3) {
        const parentText = parent.textContent || '';
        const parentAriaLabel = parent.getAttribute('aria-label') || '';
        const parentTitle = parent.getAttribute('title') || '';
        
        const parentCombined = `${parentAriaLabel} ${parentTitle} ${parentText}`;
        const parentReactors = this.extractReactorsFromText(parentCombined, messageSender);
        if (parentReactors.length > 0) {
          finalReactors = parentReactors;
          break;
        }
        
        parent = parent.parentElement;
        attempts++;
      }
    }
    
    // If still no reactors, use "Unknown"
    if (finalReactors.length === 0) {
      finalReactors = ['Unknown'];
    }
    
    // Create reaction entries
    emojis.forEach(emoji => {
      reactions.set(emoji, new Map());
      finalReactors.forEach(reactor => {
        reactions.get(emoji).set(reactor, 1);
      });
    });

    return reactions;
  }

  // Extract reactions from reaction button
  extractFromReactionButton(button, messageSender) {
    const reactions = new Map();
    const ariaLabel = button.getAttribute('aria-label') || '';
    const title = button.getAttribute('title') || '';
    const text = button.textContent || '';
    
    const combined = `${ariaLabel} ${title} ${text}`;
    const emojis = this.extractEmojisFromText(combined);
    const reactorsSet = this._extractReactorsFromCandidates([combined], messageSender);
    const reactors = reactorsSet.size ? Array.from(reactorsSet) : ['Unknown'];

    emojis.forEach(emoji => {
      if (!reactions.has(emoji)) reactions.set(emoji, new Map());
      reactors.forEach(reactor => {
        reactions.get(emoji).set(reactor, 1);
      });
    });

    return reactions;
  }

  // Extract reactions from tooltip
  extractFromTooltip(tooltip, messageSender) {
    const reactions = new Map();
    const ariaLabel = tooltip.getAttribute('aria-label') || '';
    const title = tooltip.getAttribute('title') || '';
    
    const combined = `${ariaLabel} ${title}`;
    const emojis = this.extractEmojisFromText(combined);
    const reactorsSet = this._extractReactorsFromCandidates([combined], messageSender);
    const reactors = reactorsSet.size ? Array.from(reactorsSet) : ['Unknown'];

    emojis.forEach(emoji => {
      if (!reactions.has(emoji)) reactions.set(emoji, new Map());
      reactors.forEach(reactor => {
        reactions.get(emoji).set(reactor, 1);
      });
    });

    return reactions;
  }

  // Extract reactions from count element
  extractFromCountElement(countEl, messageSender) {
    const reactions = new Map();
    const title = countEl.getAttribute('title') || '';
    const text = countEl.textContent || '';
    
    // Look for patterns like "👍 3" or "❤️ 2"
    const countMatch = text.match(/^(\d+)$/);
    if (countMatch) {
      const count = parseInt(countMatch[1]);
      // Try to find associated emoji from parent or sibling elements
      const parent = countEl.parentElement;
      if (parent) {
        const emojis = this.extractEmojisFromText(parent.textContent || '');
        emojis.forEach(emoji => {
          reactions.set(emoji, new Map([['Unknown', count]]));
        });
      }
    }

    return reactions;
  }

  // Extract reactions from emoji element
  extractFromEmojiElement(emojiEl, messageSender) {
    const reactions = new Map();
    const text = emojiEl.textContent || '';
    const emojis = this.extractEmojisFromText(text);
    
    emojis.forEach(emoji => {
      reactions.set(emoji, new Map([['Unknown', 1]]));
    });

    return reactions;
  }

  // Helper: Extract emojis from text
  extractEmojisFromText(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    return Array.from(new Set(text.match(emojiRegex) || []));
  }

  // Helper: Extract reactor names from text
  extractReactorsFromText(text, messageSender) {
    const reactors = new Set();
    const known = this.getKnownSenders();

    // Pattern 1: "John reacted with 👍"
    const reactedPattern = /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+reacted\s+with/i;
    const reactedMatch = text.match(reactedPattern);
    if (reactedMatch) {
      const name = this.cleanDisplayName(reactedMatch[1], messageSender, known);
      if (name) reactors.add(name);
    }

    // Pattern 2: "Reacted by John, Mary"
    const reactedByPattern = /Reacted by\s+([^,]+(?:,\s*[^,]+)*)/i;
    const reactedByMatch = text.match(reactedByPattern);
    if (reactedByMatch) {
      const names = reactedByMatch[1].split(',').map(n => n.trim());
      names.forEach(name => {
        const cleaned = this.cleanDisplayName(name, messageSender, known);
        if (cleaned) reactors.add(cleaned);
      });
    }

    // Pattern 3: Look for known names in the text
    known.forEach(name => {
      if (name !== messageSender && text.includes(name)) {
        reactors.add(name);
      }
    });

    return Array.from(reactors);
  }

  // Extract reply target (original author) from a reply/quoted header within the message bubble
  extractReplyTo(messageElement, messageSender) {
    try {
      const searchRoot = messageElement.closest('[role="row"]') || messageElement.closest('div') || messageElement;

      // Structural detection: quoted/reply header often contains the original name as first line
      const structural = searchRoot.querySelector('[data-testid*="msg-context"], [data-testid*="quoted-message"], [data-testid*="msg-quote"]');
      if (structural) {
        const nameEl = structural.querySelector('span[dir="auto"], strong[dir="auto"], div[dir="auto"]');
        const candidate = nameEl && (nameEl.textContent || '').trim();
        if (candidate && candidate !== messageSender && candidate.length <= 60) {
          return candidate;
        }
      }
      const replySelectors = [
        '[data-testid*="quoted"]',
        '[data-testid*="msg-context"]',
        '[aria-label*="replied"]',
        '[aria-label*="reply"]',
        '[title*="replied"]',
        '[title*="reply"]',
        '[class*="quoted"]',
        '[class*="reply"]'
      ];

      const candidates = [];
      replySelectors.forEach(sel => {
        searchRoot.querySelectorAll(sel).forEach(el => {
          const s = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${el.textContent || ''}`
            .replace(/\s+/g, ' ').trim();
          if (s) candidates.push(s);
        });
      });

      const known = this.getKnownSenders();
      const fromPatterns = [/replied to\s+([^:ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ\-\,]+)/i, /reply to\s+([^:ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ\-\,]+)/i, /in reply to\s+([^:ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ\-\,]+)/i];
      for (const str of candidates) {
        for (const rx of fromPatterns) {
          const m = str.match(rx);
          if (m && m[1]) {
            const name = m[1].trim();
            if (name && name !== messageSender) return name;
          }
        }
        // Fallback: pick the first known sender mentioned
        for (const name of known) {
          if (name !== messageSender && str.includes(name)) return name;
        }
        // Final fallback: extract phone number if present
        const phone = this.extractPhoneNumber(str);
        if (phone && phone !== messageSender) return phone;
      }
    } catch (e) {}
    return null;
  }

  getKnownSenders() {
    const set = new Set();
    try {
      this.reactionData.forEach(v => { if (v && v.sender) set.add(v.sender); });
    } catch (e) {}
    return set;
  }

  // Phone extraction helpers
  _extractReactorsFromCandidates(candidates, messageSender) {
    try {
      const known = this.getKnownSenders();
      const splitTokens = (s) => String(s).split(/,|\band\b|·|•/i).map(t => t.trim()).filter(Boolean);
      const clean = (raw) => this.cleanDisplayName(raw, messageSender, known);
      const reactorSet = new Set();
      candidates.forEach(str => {
        if (!str) return;
        let base = str;
        const rb = String(str).match(/Reacted by\s+(.+)/i);
        if (rb && rb[1]) base = rb[1];
        base = base.replace(/^[\p{Extended_Pictographic}\s,]+/gu, '');
        if (rb && rb[1]) {
          splitTokens(base).forEach(tok => {
            const n = clean(tok);
            if (n && n !== messageSender) reactorSet.add(n);
          });
        }
        const m = String(str).match(/([^,]+?)\s+reacted\b/i);
        if (m && m[1]) {
          const n2 = clean(m[1]);
          if (n2 && n2 !== messageSender) reactorSet.add(n2);
        }
      });
      // Fallback: if nothing found, look for any known sender names in the strings
      if (reactorSet.size === 0 && known && known.size) {
        candidates.forEach(str => {
          if (!str) return;
          known.forEach(name => {
            if (name !== messageSender && str.includes(name)) reactorSet.add(name);
          });
        });
      }
      return reactorSet;
    } catch { return new Set(); }
  }

  cleanDisplayName(raw, messageSender, knownSenders) {
    if (!raw) return null;
    let s = String(raw);
    // Preserve full phone numbers (keep area code) before stripping characters
    try {
      if (/^[\d\s().\-+]+$/.test(s)) {
        const cleanedDigits = s.replace(/[^\d+]/g, '');
        const phone0 = this.sanitizePhone(cleanedDigits);
        if (phone0) return phone0;
      }
    } catch {}
    // Remove emojis
    s = s.replace(/[\p{Extended_Pictographic}]/gu, ' ');
    // Drop common UI noise words
    s = s.replace(/\b(view|views|reaction|reactions|reacted|with|others?|more|see\s+fewer|see\s+more|total|in\s+total|reply|replied|message|messages)\b/gi, ' ');
    // Remove parentheses content and punctuation
    s = s.replace(/\(.*?\)/g, ' ').replace(/[|•·.,;:()\[\]{}<>]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return null;
    // Ignore 'you'/'me'
    if (/^you$/i.test(s) || /^me$/i.test(s)) return null;
    // Ignore times and pure numbers
    if (/(?:^|\s)(am|pm)\b/i.test(s) || /^\d+$/.test(s)) return null;
    
    // Only check for phone numbers if the string looks like it could be one
    // (contains only digits, +, spaces, parentheses, dots, hyphens)
    if (/^[\d\s().\-+]+$/.test(s)) {
      const phone = this.extractPhoneNumber(s);
      if (phone) return phone;
    }
    // Basic content check: must contain a letter
    if (!/[\p{L}]/u.test(s)) return null;
    // Cap length
    if (s.length > 60) s = s.slice(0, 60);
    // Avoid exact self
    if (messageSender && s === messageSender) return null;
    return s;
  }

  extractPhoneNumber(s) {
    try {
      if (!s) return null;
      // Allow spaces, dashes, and parentheses by cleaning first
      const cleanedRaw = String(s).replace(/[^\d+]/g, '');
      // More restrictive pattern: 7-15 digits, with optional + prefix
      // Must start with + or digit 1-9 (not 0)
      const m = cleanedRaw.match(/^(\+?[1-9]\d{6,14})$/);
      if (!m) return null;
      
      const phone = m[1];
      
      // Additional validation
      if (!this.isValidPhoneNumber(phone)) return null;
      
      return this.sanitizePhone(phone);
    } catch { return null; }
  }

  isValidPhoneNumber(phone) {
    try {
      // Remove all non-digits except +
      const cleaned = phone.replace(/[^\d+]/g, '');
      
      // Must be 7-15 digits total
      if (cleaned.length < 7 || cleaned.length > 15) return false;
      
      // Must start with + or digit 1-9 (not 0)
      if (!/^(\+[1-9]|[1-9])/.test(cleaned)) return false;
      
      // If it starts with +, the rest should be digits
      if (cleaned.startsWith('+')) {
        const digits = cleaned.slice(1);
        if (!/^\d+$/.test(digits)) return false;
        // International numbers should be 7-14 digits after +
        if (digits.length < 7 || digits.length > 14) return false;
      }
      
      // If it doesn't start with +, it should be all digits
      if (!cleaned.startsWith('+')) {
        if (!/^\d+$/.test(cleaned)) return false;
      }
      
      return true;
    } catch { return false; }
  }

  sanitizePhone(s) {
    try {
      let cleaned = String(s).replace(/[^\d+]/g, '');
      
      // Handle 00 prefix conversion to +
      if (cleaned.startsWith('00')) {
        cleaned = '+' + cleaned.slice(2);
      }
      
      // Ensure leading + for international numbers (10+ digits)
      if (!cleaned.startsWith('+') && cleaned.length >= 10) {
        cleaned = '+' + cleaned;
      }
      
      // Final validation
      if (!this.isValidPhoneNumber(cleaned)) return null;
      
      return cleaned;
    } catch { return null; }
  }

  // Helpers: stable IDs and chat detection
  generateMessageId(messageElement, prePlainText, sender, chatId) {
    const text = (messageElement.innerText || '').replace(/\s+/g, ' ').trim();
    const base = `${chatId}|${prePlainText || ''}|${sender || ''}|${text}`;
    return 'msg_' + this.hashString(base);
  }

  hashString(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & 0xffffffff;
    }
    return (h >>> 0).toString(36);
  }

  getCurrentChatInfo() {
    const bad = ['Menu', 'New chat', 'Search', 'Type a message', 'Attach', 'Profile', 'Get the app', 'video', 'call'];
    const headerTitle = document.querySelector('#main header [title]');
    let name = headerTitle && headerTitle.getAttribute('title');
    if (name && name.length < 100 && !bad.some(b => name.includes(b))) {
      return { id: this.slugify(name), name };
    }
    const selected = document.querySelector('[aria-selected="true"] [title]');
    name = selected && selected.getAttribute('title');
    if (name && name.length < 100 && !bad.some(b => name.includes(b))) {
      return { id: this.slugify(name), name };
    }
    return { id: 'unknown', name: 'Unknown Chat' };
  }

  // Enhanced monitoring and user feedback
  setupRealTimeMonitoring() {
    // Add visual indicators to show the extension is working
    this.addStatusIndicator();
    
    // Monitor data quality in real-time
    this.startDataQualityMonitoring();
    
    // Add periodic data refresh
    this.startPeriodicRefresh();
  }

  addStatusIndicator() {
    // Create a subtle status indicator on WhatsApp Web
    const indicator = document.createElement('div');
    indicator.id = 'whatsapp-analyzer-status';
    indicator.style.cssText = `
      position: fixed;
      top: 80px;
      left: 12px;
      background: rgba(37, 211, 102, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      cursor: pointer;
    `;
    indicator.textContent = '📊 Analyzing...';
    indicator.title = "What's That!? - Click for stats";
    
    // Add click handler to show quick stats (robust renderer)
    indicator.addEventListener('click', () => {
      try { this.renderQuickStatsPopup(); } catch (e) { try { this.showQuickStats(); } catch {} }
    });
    
    document.body.appendChild(indicator);

    // Reposition right under the left sidebar header (Meta AI icon area)
    const reposition = () => {
      try {
        const sideHeader = document.querySelector('#side header') || document.querySelector('#side [role="toolbar"]') || document.querySelector('#side');
        if (sideHeader) {
          const rect = sideHeader.getBoundingClientRect();
          indicator.style.top = `${Math.round(rect.bottom + 12)}px`;
          indicator.style.left = '12px';
        }
      } catch {}
    };
    reposition();
    window.addEventListener('resize', reposition, { passive: true });
    setTimeout(reposition, 750);
    
    // Update indicator periodically
    setInterval(() => {
      this.updateStatusIndicator(indicator);
    }, 5000);
  }

  updateStatusIndicator(indicator) {
    try {
      const messageCount = this.reactionData ? this.reactionData.size : 0;
      const chatName = this.currentChat ? this.currentChat.name : 'Unknown';
      
      if (messageCount === 0) {
        indicator.textContent = '📊 No data yet';
        indicator.style.background = 'rgba(255, 193, 7, 0.9)';
      } else {
        indicator.textContent = `📊 ${messageCount} msgs`;
        indicator.style.background = 'rgba(37, 211, 102, 0.9)';
      }
      
      indicator.title = `WhatsApp Reaction Analyzer\nChat: ${chatName}\nMessages: ${messageCount}\nClick for detailed stats`;
    } catch (error) {
      console.error('WhatsApp Reaction Analyzer: Error updating status indicator:', error);
    }
  }

  showQuickStats() {
    try {
      // Create a quick stats popup
      const popup = document.createElement('div');
      popup.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: white;
        border: 2px solid #25d366;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 999999;
        min-width: 250px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      const stats = this.calculateQuickStats();
      const chatName = this.currentChat ? this.currentChat.name : 'Unknown';
      
      popup.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #25d366; font-size: 14px;">Quick Stats</h3>
          <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 16px; cursor: pointer;">×</button>
        </div>
        <div style="font-size: 12px; line-height: 1.4;">
          <div style="margin-bottom: 6px;"><strong>Chat:</strong> ${this.escapeHtml(chatName)}</div>
          <div style="margin-bottom: 6px;"><strong>Messages:</strong> ${stats.totalMessages}</div>
          <div style="margin-bottom: 6px;"><strong>Reactions:</strong> ${stats.totalReactions}</div>
          <div style="margin-bottom: 6px;"><strong>Participants:</strong> ${stats.participants}</div>
          <div style="margin-bottom: 6px;"><strong>Data Quality:</strong> ${stats.dataQuality}%</div>
          <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #eee;">
            <a href="#" id="qs-dash" target="_blank" style="color: #25d366; text-decoration: none; font-weight: 600;">?? Open Full Dashboard</a>
          </div>
        </div>
      `;
      
      document.body.appendChild(popup);
      // Intercept dashboard link and open via background script
      try {
        const dashLink2 = document.getElementById('qs-dash');
        if (dashLink2) {
          dashLink2.addEventListener('click', (e) => {
            e.preventDefault();
            try { chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' }); }
            catch { window.open(dashLink2.href, '_blank'); }
          });
        }
      } catch {}
      // Post-render tweaks to improve reliability/visibility
      try {
        popup.id = 'whatsapp-analyzer-quick-stats';
        popup.style.zIndex = '2147483647';
        const closeBtn = popup.querySelector('button');
        if (closeBtn) closeBtn.addEventListener('click', () => popup.remove());
        const dashLink = popup.querySelector('a');
        if (dashLink) {
          try {
            if (!(chrome && chrome.runtime && chrome.runtime.getURL)) {
              dashLink.href = '#';
            }
            dashLink.textContent = '📊 Open Full Dashboard';
          } catch {}
        }
        if (!stats.totalMessages) {
          const container = popup.querySelector('div[style*="line-height"]');
          if (container) {
            const notice = document.createElement('div');
            notice.style.cssText = 'margin-top:6px;color:#777;';
            notice.textContent = 'No data yet. Scroll your chat to load messages.';
            container.appendChild(notice);
          }
        }
      } catch {}
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (popup.parentNode) {
          popup.remove();
        }
      }, 10000);
    } catch (error) {
      console.error("What's That!?: Error showing quick stats:", error);
    }
  }

  // More robust quick stats popup renderer (used by the status pill)
  renderQuickStatsPopup() {
    try {
      const existing = document.getElementById('whatsapp-analyzer-quick-stats');
      if (existing) existing.remove();
      const popup = document.createElement('div');
      popup.id = 'whatsapp-analyzer-quick-stats';
      popup.style.cssText = 'position:fixed;bottom:80px;right:20px;background:#fff;border:2px solid #25d366;border-radius:12px;padding:16px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:2147483647;min-width:260px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#222;';
      const stats = this.calculateQuickStats();
      const chatName = this.currentChat ? this.currentChat.name : 'Unknown';
      const linkUrl = (chrome && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('dashboard.html') : '#';
      popup.innerHTML = ''+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'+
        '<h3 style="margin:0;color:#25d366;font-size:14px;">Quick Stats</h3>'+
        '<button id="qs-close" style="background:none;border:none;font-size:16px;cursor:pointer;">×</button>'+
        '</div>'+
        '<div style="font-size:12px;line-height:1.4;">'+
        '<div style="margin-bottom:6px;"><strong>Chat:</strong> '+ this.escapeHtml(chatName) +'</div>'+
        '<div style="margin-bottom:6px;"><strong>Messages:</strong> '+ stats.totalMessages +'</div>'+
        '<div style="margin-bottom:6px;"><strong>Reactions:</strong> '+ stats.totalReactions +'</div>'+
        '<div style="margin-bottom:6px;"><strong>Participants:</strong> '+ stats.participants +'</div>'+
        '<div style="margin-bottom:6px;"><strong>Data Quality:</strong> '+ stats.dataQuality +'%</div>'+
        (stats.totalMessages ? '' : '<div style="margin-top:6px;color:#777;">No data yet. Scroll your chat to load messages.</div>')+
        '<div style="margin-top:12px;padding-top:8px;border-top:1px solid #eee;">'+
        '<a href="'+ linkUrl +'" target="_blank" style="color:#25d366;text-decoration:none;font-weight:600;">📊 Open Full Dashboard</a>'+
        '</div>'+
        '</div>';
      document.body.appendChild(popup);
      const closeBtn = document.getElementById('qs-close');
      if (closeBtn) closeBtn.addEventListener('click', () => popup.remove());
      setTimeout(() => { if (popup.parentNode) popup.remove(); }, 10000);
    } catch (e) {
      console.error("What's That!?: Error rendering quick stats:", e);
    }
  }

  calculateQuickStats() {
    // Safety check for reactionData
    if (!this.reactionData) {
      return {
        totalMessages: 0,
        totalReactions: 0,
        participants: 0,
        dataQuality: 0
      };
    }

    const totalMessages = this.reactionData.size;
    let totalReactions = 0;
    const participants = new Set();
    let messagesWithReactions = 0;
    
    this.reactionData.forEach((messageData) => {
      if (messageData && messageData.sender) {
        participants.add(messageData.sender);
      }
      
      if (messageData && messageData.reactions) {
        // Check if reactions exist (handle both Map and plain objects)
        const hasReactions = messageData.reactions instanceof Map 
          ? messageData.reactions.size > 0 
          : Object.keys(messageData.reactions).length > 0;
          
        if (hasReactions) {
          messagesWithReactions++;
          
          // Handle both Map and plain object reactions
          if (messageData.reactions instanceof Map) {
            messageData.reactions.forEach(reactors => {
              if (reactors && typeof reactors.forEach === 'function') {
                // Handle Map objects
                reactors.forEach(count => totalReactions += count);
              } else if (reactors && typeof reactors === 'object') {
                // Handle plain objects (serialized Maps)
                if (reactors instanceof Map) {
                  reactors.forEach(count => totalReactions += count);
                } else {
                  Object.values(reactors).forEach(count => totalReactions += count);
                }
              }
            });
          } else {
            // Handle plain object reactions
            Object.values(messageData.reactions).forEach(reactors => {
              if (reactors && typeof reactors.forEach === 'function') {
                // Handle Map objects
                reactors.forEach(count => totalReactions += count);
              } else if (reactors && typeof reactors === 'object') {
                // Handle plain objects (serialized Maps)
                if (reactors instanceof Map) {
                  reactors.forEach(count => totalReactions += count);
                } else {
                  Object.values(reactors).forEach(count => totalReactions += count);
                }
              }
            });
          }
        }
      }
    });
    
    const dataQuality = totalMessages > 0 ? Math.round((messagesWithReactions / totalMessages) * 100) : 0;
    
    return {
      totalMessages,
      totalReactions,
      participants: participants.size,
      dataQuality
    };
  }

  startDataQualityMonitoring() {
    // Monitor data quality and provide feedback
    setInterval(() => {
      try {
        const stats = this.calculateQuickStats();
        
        if (stats && stats.dataQuality < 10 && stats.totalMessages > 10) {
          console.warn("What's That!?: Low data quality detected. Consider scrolling through more messages.");
        }
        
        if (stats && stats.totalMessages > 0 && stats.totalReactions === 0) {
          console.warn("What's That!?: No reactions detected. Make sure reactions are being used in the chat.");
        }
      } catch (error) {
        console.error("What's That!?: Error in data quality monitoring:", error);
      }
    }, 30000); // Check every 30 seconds
  }

  startPeriodicRefresh() {
    // Periodically refresh data to catch new messages
    setInterval(() => {
      try {
        if (document.visibilityState === 'visible') {
          this.scanMessages();
        }
      } catch (error) {
        console.error("What's That!?: Error in periodic refresh:", error);
      }
    }, 10000); // Refresh every 10 seconds when page is visible
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Enhanced sender name extraction with multiple strategies
  extractSenderName(messageElement, prePlainText) {
    let sender = null;
    
    // Strategy 1: Extract from data-pre-plain-text attribute
    if (prePlainText) {
      // Pattern: [time, date] Sender:
      const match1 = prePlainText.match(/\[.*?\]\s([^:]+):/);
      if (match1 && match1[1]) {
        sender = match1[1].trim();
        console.log(`What's That!?: Extracted sender from prePlainText: "${sender}"`);
      }
      
      // Pattern: Sender: (without brackets)
      if (!sender) {
        const match2 = prePlainText.match(/^([^:]+):/);
        if (match2 && match2[1]) {
          sender = match2[1].trim();
          console.log(`What's That!?: Extracted sender from prePlainText (no brackets): "${sender}"`);
        }
      }
    }
    
    // Strategy 2: Extract from aria-label
    if (!sender) {
      const ariaLabel = messageElement.getAttribute('aria-label') || '';
      if (ariaLabel) {
        // Pattern: "Message from Sender" or "Sender: message"
        const match1 = ariaLabel.match(/Message from\s+([^,]+)/i);
        if (match1 && match1[1]) {
          sender = match1[1].trim();
          console.log(`What's That!?: Extracted sender from aria-label (from): "${sender}"`);
        }
        
        if (!sender) {
          const match2 = ariaLabel.match(/^([^:]+):/);
          if (match2 && match2[1]) {
            sender = match2[1].trim();
            console.log(`What's That!?: Extracted sender from aria-label: "${sender}"`);
          }
        }
      }
    }
    
    // Strategy 3: Extract from title attribute
    if (!sender) {
      const title = messageElement.getAttribute('title') || '';
      if (title) {
        const match = title.match(/^([^:]+):/);
        if (match && match[1]) {
          sender = match[1].trim();
          console.log(`What's That!?: Extracted sender from title: "${sender}"`);
        }
      }
    }
    
    // Strategy 4: Look for sender in parent elements
    if (!sender) {
      let parent = messageElement.parentElement;
      let attempts = 0;
      while (parent && attempts < 5) {
        const parentAriaLabel = parent.getAttribute('aria-label') || '';
        const parentTitle = parent.getAttribute('title') || '';
        const parentText = parent.textContent || '';
        
        // Check aria-label
        if (parentAriaLabel) {
          const match = parentAriaLabel.match(/Message from\s+([^,]+)/i);
          if (match && match[1]) {
            sender = match[1].trim();
            console.log(`What's That!?: Extracted sender from parent aria-label: "${sender}"`);
            break;
          }
        }
        
        // Check title
        if (!sender && parentTitle) {
          const match = parentTitle.match(/^([^:]+):/);
          if (match && match[1]) {
            sender = match[1].trim();
            console.log(`What's That!?: Extracted sender from parent title: "${sender}"`);
            break;
          }
        }
        
        // Check for sender patterns in text content
        if (!sender && parentText) {
          const match = parentText.match(/^([^:]+):/);
          if (match && match[1] && match[1].length < 50) { // Reasonable name length
            sender = match[1].trim();
            console.log(`What's That!?: Extracted sender from parent text: "${sender}"`);
            break;
          }
        }
        
        parent = parent.parentElement;
        attempts++;
      }
    }
    
    // Strategy 5: Look for sender in sibling elements
    if (!sender) {
      const siblings = messageElement.parentElement?.children || [];
      for (const sibling of siblings) {
        const siblingText = sibling.textContent || '';
        const match = siblingText.match(/^([^:]+):/);
        if (match && match[1] && match[1].length < 50) {
          sender = match[1].trim();
          console.log(`What's That!?: Extracted sender from sibling: "${sender}"`);
          break;
        }
      }
    }
    
    // Strategy 6: Phone number fallback
    if (!sender) {
      const phoneMatch = prePlainText.match(/\[.*?\]\s(\+?[1-9]\d{6,14}):/);
      if (phoneMatch && phoneMatch[1]) {
        const potentialPhone = phoneMatch[1].trim();
        if (this.isValidPhoneNumber(potentialPhone)) {
          sender = this.sanitizePhone(potentialPhone);
          console.log(`What's That!?: Using phone number as sender: ${sender} from "${prePlainText}"`);
        }
      }
    }
    
    // Clean up the sender name
    if (sender) {
      sender = this.cleanSenderName(sender);
      console.log(`What's That!?: Final sender name: "${sender}"`);
    }
    
    return sender;
  }
  
  // Clean and validate sender names
  cleanSenderName(name) {
    if (!name) return null;
    
    let cleaned = name.trim();
    // If it looks like a phone number, keep full number
    try {
      if (/^[\d\s().\-+]+$/.test(cleaned)) {
        const phone = this.sanitizePhone(cleaned.replace(/[^\d+]/g, ''));
        if (phone) return phone;
      }
    } catch {}
    
    // Remove common prefixes/suffixes
    cleaned = cleaned.replace(/^(Message from|From|Sent by|By)\s+/i, '');
    cleaned = cleaned.replace(/\s+(sent|message|chat)$/i, '');
    
    // Remove timestamps and dates
    cleaned = cleaned.replace(/^\d{1,2}[:\.]\d{2}(\s*[AP]M)?\s*/i, '');
    cleaned = cleaned.replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*/i, '');
    
    // Remove brackets and parentheses content
    cleaned = cleaned.replace(/\[.*?\]/g, '');
    // Keep parentheses unless they are known UI noise; phone numbers handled earlier
    cleaned = cleaned.replace(/\((?:\s*reply\s*|\s*edited\s*).*?\)/ig, '');
    
    // Clean up whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Validate name length and content
    if (cleaned.length < 1 || cleaned.length > 50) return null;
    if (/^[\d\s\-\(\)]+$/.test(cleaned)) return null; // Only numbers and symbols
    if (/^(you|me|unknown|sender)$/i.test(cleaned)) return null; // Generic names
    
    return cleaned;
  }

  slugify(s) {
    return String(s).toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'unknown';
  }

  // Extract actual message timestamp from WhatsApp DOM
  extractMessageTimestamp(messageElement, prePlainText) {
    try {
      // Strategy 1: Extract from data-pre-plain-text attribute
      if (prePlainText) {
        // Pattern: [time, date] Sender: or [time] Sender:
        const timestampMatch = prePlainText.match(/\[([^\]]+)\]/);
        if (timestampMatch && timestampMatch[1]) {
          const timestampStr = timestampMatch[1].trim();
          const parsedTime = this.parseWhatsAppTimestamp(timestampStr);
          if (parsedTime) {
            console.log(`What's That!?: Extracted timestamp from prePlainText: "${timestampStr}" -> ${parsedTime}`);
            return parsedTime;
          }
        }
      }

      // Strategy 2: Look for timestamp in aria-label
      const ariaLabel = messageElement.getAttribute('aria-label') || '';
      if (ariaLabel) {
        const timestampMatch = ariaLabel.match(/\[([^\]]+)\]/);
        if (timestampMatch && timestampMatch[1]) {
          const timestampStr = timestampMatch[1].trim();
          const parsedTime = this.parseWhatsAppTimestamp(timestampStr);
          if (parsedTime) {
            console.log(`What's That!?: Extracted timestamp from aria-label: "${timestampStr}" -> ${parsedTime}`);
            return parsedTime;
          }
        }
      }

      // Strategy 3: Look for timestamp in title attribute
      const title = messageElement.getAttribute('title') || '';
      if (title) {
        const timestampMatch = title.match(/\[([^\]]+)\]/);
        if (timestampMatch && timestampMatch[1]) {
          const timestampStr = timestampMatch[1].trim();
          const parsedTime = this.parseWhatsAppTimestamp(timestampStr);
          if (parsedTime) {
            console.log(`What's That!?: Extracted timestamp from title: "${timestampStr}" -> ${parsedTime}`);
            return parsedTime;
          }
        }
      }

      // Strategy 4: Look for timestamp in parent elements
      let parent = messageElement.parentElement;
      let attempts = 0;
      while (parent && attempts < 5) {
        const parentAriaLabel = parent.getAttribute('aria-label') || '';
        const parentTitle = parent.getAttribute('title') || '';
        
        for (const text of [parentAriaLabel, parentTitle]) {
          if (text) {
            const timestampMatch = text.match(/\[([^\]]+)\]/);
            if (timestampMatch && timestampMatch[1]) {
              const timestampStr = timestampMatch[1].trim();
              const parsedTime = this.parseWhatsAppTimestamp(timestampStr);
              if (parsedTime) {
                console.log(`What's That!?: Extracted timestamp from parent: "${timestampStr}" -> ${parsedTime}`);
                return parsedTime;
              }
            }
          }
        }
        
        parent = parent.parentElement;
        attempts++;
      }

      // Strategy 5: Look for timestamp elements in the DOM
      const timestampSelectors = [
        '[data-testid*="time"]',
        '[data-testid*="timestamp"]',
        '[class*="time"]',
        '[class*="timestamp"]',
        'time',
        '.time',
        '.timestamp'
      ];

      for (const selector of timestampSelectors) {
        try {
          const timeElements = messageElement.querySelectorAll(selector);
          for (const timeEl of timeElements) {
            const text = timeEl.textContent || timeEl.getAttribute('datetime') || '';
            if (text) {
              const parsedTime = this.parseWhatsAppTimestamp(text);
              if (parsedTime) {
                console.log(`What's That!?: Extracted timestamp from DOM element: "${text}" -> ${parsedTime}`);
                return parsedTime;
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }

      console.log("What's That!?: Could not extract timestamp, using current time");
      return Date.now();
    } catch (error) {
      console.error("What's That!?: Error extracting timestamp:", error);
      return Date.now();
    }
  }

  // Parse WhatsApp timestamp formats
  parseWhatsAppTimestamp(timestampStr) {
    try {
      if (!timestampStr) return null;

      const now = new Date();
      const currentYear = now.getFullYear();
      
      // Pattern 1: "14:30" or "2:30 PM"
      const timeOnlyMatch = timestampStr.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
      if (timeOnlyMatch) {
        let hours = parseInt(timeOnlyMatch[1]);
        const minutes = parseInt(timeOnlyMatch[2]);
        const ampm = timeOnlyMatch[3];
        
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        const date = new Date(currentYear, now.getMonth(), now.getDate(), hours, minutes);
        return date.getTime();
      }

      // Pattern 2: "14:30, 12/25/23" or "2:30 PM, 12/25/2023"
      const timeDateMatch = timestampStr.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/i);
      if (timeDateMatch) {
        let hours = parseInt(timeDateMatch[1]);
        const minutes = parseInt(timeDateMatch[2]);
        const ampm = timeDateMatch[3];
        const month = parseInt(timeDateMatch[4]);
        const day = parseInt(timeDateMatch[5]);
        let year = parseInt(timeDateMatch[6]);
        
        if (year < 100) year += 2000; // Convert 2-digit year to 4-digit
        
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        const date = new Date(year, month - 1, day, hours, minutes);
        return date.getTime();
      }

      // Pattern 3: "12/25/23, 14:30" or "12/25/2023, 2:30 PM"
      const dateTimeMatch = timestampStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
      if (dateTimeMatch) {
        const month = parseInt(dateTimeMatch[1]);
        const day = parseInt(dateTimeMatch[2]);
        let year = parseInt(dateTimeMatch[3]);
        let hours = parseInt(dateTimeMatch[4]);
        const minutes = parseInt(dateTimeMatch[5]);
        const ampm = dateTimeMatch[6];
        
        if (year < 100) year += 2000; // Convert 2-digit year to 4-digit
        
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        const date = new Date(year, month - 1, day, hours, minutes);
        return date.getTime();
      }

      // Pattern 4: "Yesterday, 14:30" or "Today, 2:30 PM"
      const relativeMatch = timestampStr.match(/^(Yesterday|Today),\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
      if (relativeMatch) {
        const relative = relativeMatch[1].toLowerCase();
        let hours = parseInt(relativeMatch[2]);
        const minutes = parseInt(relativeMatch[3]);
        const ampm = relativeMatch[4];
        
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        }
        
        const date = new Date();
        if (relative === 'yesterday') {
          date.setDate(date.getDate() - 1);
        }
        date.setHours(hours, minutes, 0, 0);
        return date.getTime();
      }

      // Pattern 5: Try to parse as ISO date or other standard formats
      const parsedDate = new Date(timestampStr);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.getTime();
      }

      return null;
    } catch (error) {
      console.error('WhatsApp Reaction Analyzer: Error parsing timestamp:', error);
      return null;
    }
  }
}

// Initialize and expose globally for debugging
console.log('About to initialize WhatsAppReactionTracker...');
let tracker = null;
try {
  tracker = new WhatsAppReactionTracker();
  window.tracker = tracker;
  console.log('ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Tracker initialized successfully!');
} catch (error) {
  console.error('ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Error initializing tracker:', error);
  console.error('Stack trace:', error.stack);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.type);
  
  if (!tracker) {
    console.error('Tracker not initialized!');
    sendResponse({ error: 'Tracker not initialized' });
    return true;
  }
  
  if (request.type === 'GET_AVAILABLE_CHATS') {
    const chats = tracker.getAvailableChats();
    sendResponse({ chats: chats });
  } else if (request.type === 'GET_REACTION_DATA') {
    tracker.sendDataToBackground();
    sendResponse({ success: true });
  } else if (request.type === 'START_BACKFILL') {
    (async () => {
      const res = await tracker.startBackfill(request.options || {});
      sendResponse(res);
    })();
    return true;
  }
  
  return true; // Keep the message channel open
});
// (Removed stray top-level debug block that caused syntax errors)

// Enhanced debug function for sender extraction
window.debugSenderExtraction = function() {
  if (!tracker) {
    console.error('❌ Tracker is not initialized!');
    return;
  }
  
  console.log('=== SENDER EXTRACTION DEBUG ===');
  const messages = document.querySelectorAll('[data-pre-plain-text]');
  console.log(`Found ${messages.length} messages to analyze`);
  
  Array.from(messages).slice(0, 10).forEach((msg, index) => {
    console.log(`\n--- Message ${index + 1} ---`);
    const prePlainText = msg.getAttribute('data-pre-plain-text') || '';
    const ariaLabel = msg.getAttribute('aria-label') || '';
    const title = msg.getAttribute('title') || '';
    const textContent = msg.textContent || '';
    
    console.log('prePlainText:', prePlainText);
    console.log('ariaLabel:', ariaLabel);
    console.log('title:', title);
    console.log('textContent (first 100 chars):', textContent.substring(0, 100));
    
    const extractedSender = tracker.extractSenderName(msg, prePlainText);
    console.log('Extracted sender:', extractedSender);
    
    const extractedTimestamp = tracker.extractMessageTimestamp(msg, prePlainText);
    console.log('Extracted timestamp:', extractedTimestamp, new Date(extractedTimestamp));
    
    // Show parent elements
    let parent = msg.parentElement;
    let level = 0;
    while (parent && level < 3) {
      console.log(`Parent ${level}:`, {
        tagName: parent.tagName,
        className: parent.className,
        ariaLabel: parent.getAttribute('aria-label') || '',
        title: parent.getAttribute('title') || '',
        textContent: parent.textContent?.substring(0, 50) || ''
      });
      parent = parent.parentElement;
      level++;
    }
  });
  
  console.log('\n=== CURRENT SENDERS ===');
  const senders = new Set();
  tracker.reactionData.forEach(data => senders.add(data.sender));
  console.log('Unique senders found:', Array.from(senders));
};

// Debug function for timestamp extraction
window.debugTimestampExtraction = function() {
  if (!tracker) {
    console.error('❌ Tracker is not initialized!');
    return;
  }
  
  console.log('=== TIMESTAMP EXTRACTION DEBUG ===');
  const messages = document.querySelectorAll('[data-pre-plain-text]');
  console.log(`Found ${messages.length} messages to analyze`);
  
  Array.from(messages).slice(0, 10).forEach((msg, index) => {
    console.log(`\n--- Message ${index + 1} ---`);
    const prePlainText = msg.getAttribute('data-pre-plain-text') || '';
    const ariaLabel = msg.getAttribute('aria-label') || '';
    const title = msg.getAttribute('title') || '';
    
    console.log('prePlainText:', prePlainText);
    console.log('ariaLabel:', ariaLabel);
    console.log('title:', title);
    
    const extractedTimestamp = tracker.extractMessageTimestamp(msg, prePlainText);
    const timestampDate = new Date(extractedTimestamp);
    console.log('Extracted timestamp:', extractedTimestamp);
    console.log('Parsed date:', timestampDate.toLocaleString());
    console.log('Hour:', timestampDate.getHours());
    console.log('Day of week:', timestampDate.getDay(), '(' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][timestampDate.getDay()] + ')');
  });
};

// Debug functions
window.debugExtension = function() {
  if (!tracker) {
    console.error('❌ Tracker is not initialized!');
    return;
  }
  
  console.log('=== EXTENSION DEBUG ===');
  console.log('Tracker instance:', tracker);
  console.log('Messages tracked:', tracker.reactionData.size);
  console.log('Available chats:', tracker.getAvailableChats());
  
  console.log('\nMessage details:');
  tracker.reactionData.forEach((data, id) => {
    console.log(`  ${data.sender}`);
  });
};

window.debugReactionDetection = function() {
  console.log('=== REACTION DETECTION DEBUG ===');
  
  const messages = document.querySelectorAll('[data-pre-plain-text]');
  console.log(`Found ${messages.length} messages to analyze`);
  
  Array.from(messages).slice(0, 3).forEach((msg, index) => {
    console.log(`\n--- Message ${index + 1} ---`);
    
    // Check for various reaction-related elements
    const reactionSelectors = [
      '[data-testid*="reaction"]',
      '[data-testid*="reaction-"]',
      'button[aria-label*="reaction"]',
      'div[role="button"][aria-label*="reaction"]',
      '.reaction-button',
      '[class*="reaction-button"]',
      '[aria-label*="reacted"]',
      '[title*="reacted"]',
      '[class*="reaction"]',
      '[class*="emoji"]',
      'span[role="img"]',
      'div[role="img"]'
    ];
    
    reactionSelectors.forEach(selector => {
      try {
        const elements = msg.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`Found ${elements.length} elements with selector: ${selector}`);
          elements.forEach((el, i) => {
            console.log(`  Element ${i + 1}:`, {
              tagName: el.tagName,
              className: el.className,
              ariaLabel: el.getAttribute('aria-label'),
              title: el.getAttribute('title'),
              textContent: el.textContent?.substring(0, 50),
              dataTestId: el.getAttribute('data-testid')
            });
          });
        }
      } catch (e) {
        // ignore
      }
    });
    
    // Also check parent elements
    let parent = msg.parentElement;
    let level = 0;
    while (parent && level < 3) {
      const parentReactions = parent.querySelectorAll('[data-testid*="reaction"], [aria-label*="reaction"], [class*="reaction"]');
      if (parentReactions.length > 0) {
        console.log(`Found ${parentReactions.length} reactions in parent level ${level}`);
        parentReactions.forEach((el, i) => {
          console.log(`  Parent reaction ${i + 1}:`, {
            tagName: el.tagName,
            className: el.className,
            ariaLabel: el.getAttribute('aria-label'),
            textContent: el.textContent?.substring(0, 50)
          });
        });
      }
      parent = parent.parentElement;
      level++;
    }
  });
};

console.log("What's That!?: Setup complete!");
console.log('Run window.debugExtension() to see status');
console.log('Run window.debugSenderExtraction() to debug sender extraction');
console.log('Run window.debugTimestampExtraction() to debug timestamp extraction');
console.log('Run window.debugReactionDetection() to debug reaction detection');

// Fix syntax error by removing misplaced code
if (typeof window !== 'undefined') {
  // Clean up any misplaced code
}




