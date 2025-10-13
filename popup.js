// What's That!? - Popup Script
class PopupController {
  constructor() {
    this.currentTab = 'relationships';
    this.stats = null;
    this.availableChats = [];
    this.selectedChat = null;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadAvailableChats();
    this.loadStats();
    this.checkWhatsAppStatus();
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Action buttons
    document.getElementById('refreshBtn').addEventListener('click', () => {
      this.loadStats();
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
      this.clearData();
    });

    // Chat selector
    document.getElementById('chatSelect').addEventListener('change', (e) => {
      this.selectChat(e.target.value);
    });

    document.getElementById('refreshChatsBtn').addEventListener('click', () => {
      this.loadAvailableChats();
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');

    this.currentTab = tabName;
    this.renderCurrentTab();
  }

  async loadStats() {
    try {
      this.showLoading();
      
      // Request stats from background script
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      
      if (response && response.stats) {
        this.stats = response.stats;
        this.updateOverview();
        this.renderCurrentTab();
        this.updateStatus('Data loaded successfully', 'success');
      } else {
        this.updateStatus('No data available', 'warning');
        this.showNoData();
      }
    } catch (error) {
      console.error('Error loading stats:', error);
      this.updateStatus('Error loading data', 'error');
      this.showError();
    }
  }

  updateOverview() {
    if (!this.stats) return;

    document.getElementById('totalMessages').textContent = this.stats.totalMessages || 0;
    document.getElementById('totalReactions').textContent = this.stats.totalReactions || 0;
  }

  renderCurrentTab() {
    if (!this.stats) return;

    switch (this.currentTab) {
      case 'relationships':
        this.renderRelationships();
        break;
      case 'by-sender':
        this.renderBySender();
        break;
      case 'by-reactor':
        this.renderByReactor();
        break;
      case 'top-reactions':
        this.renderTopReactions();
        break;
    }
  }

  renderRelationships() {
    const container = document.querySelector('.relationships-content');
    
    if (!this.stats.relationships || this.stats.relationships.length === 0) {
      container.innerHTML = '<div class="no-data">No relationship data available</div>';
      return;
    }

    let html = '';
    
    // Show top 20 relationships
    this.stats.relationships.slice(0, 20).forEach((rel, index) => {
      const strengthPercent = (rel.strength * 100).toFixed(1);
      const likelihoodPercent = (rel.likelihood * 100).toFixed(1);
      const focusPercent = (rel.focus * 100).toFixed(1);
      
      html += `
        <div class="relationship-card">
          <div class="relationship-header">
            <div class="relationship-pair">
              <span class="reactor-name-rel">${this.escapeHtml(rel.from)}</span>
              <span class="arrow">→</span>
              <span class="sender-name-rel">${this.escapeHtml(rel.to)}</span>
            </div>
            <div class="strength-badge">${strengthPercent}% strength</div>
          </div>
          
          <div class="relationship-metrics">
            <div class="metric">
              <div class="metric-label">Reactions</div>
              <div class="metric-value">${rel.reactions}</div>
              <div class="metric-subtext">total</div>
            </div>
            
            <div class="metric">
              <div class="metric-label">Likelihood</div>
              <div class="metric-value">${likelihoodPercent}%</div>
              <div class="metric-subtext">${rel.reactions}/${rel.totalMessagesBy} msgs</div>
            </div>
            
            <div class="metric">
              <div class="metric-label">Focus</div>
              <div class="metric-value">${focusPercent}%</div>
              <div class="metric-subtext">of their reactions</div>
            </div>
          </div>
          
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${strengthPercent}%"></div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  renderBySender() {
    const container = document.getElementById('bySenderResults');
    
    if (!this.stats.bySender || Object.keys(this.stats.bySender).length === 0) {
      container.innerHTML = '<div class="no-data">No sender data available</div>';
      return;
    }

    const html = Object.entries(this.stats.bySender)
      .sort((a, b) => {
        const aTotal = Object.values(a[1]).reduce((sum, count) => sum + count, 0);
        const bTotal = Object.values(b[1]).reduce((sum, count) => sum + count, 0);
        return bTotal - aTotal;
      })
      .map(([sender, reactors]) => {
        const totalReactions = Object.values(reactors).reduce((sum, count) => sum + count, 0);
        const topReactor = Object.entries(reactors)
          .sort((a, b) => b[1] - a[1])[0];

        return `
          <div class="sender-card">
            <div class="sender-header">
              <span class="sender-name">${this.escapeHtml(sender)}</span>
              <span class="reaction-count">${totalReactions} reactions</span>
            </div>
            <div class="reactors-list">
              ${Object.entries(reactors)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([reactor, count]) => `
                  <div class="reactor-item">
                    <span class="reactor-name">${this.escapeHtml(reactor)}</span>
                    <span class="reactor-count">${count}</span>
                  </div>
                `).join('')}
            </div>
            ${topReactor ? `
              <div class="top-reactor">
                Most reactions from: <strong>${this.escapeHtml(topReactor[0])}</strong> (${topReactor[1]})
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

    container.innerHTML = html;
  }

  renderByReactor() {
    const container = document.getElementById('byReactorResults');
    
    if (!this.stats.byReactor || Object.keys(this.stats.byReactor).length === 0) {
      container.innerHTML = '<div class="no-data">No reactor data available</div>';
      return;
    }

    const html = Object.entries(this.stats.byReactor)
      .sort((a, b) => {
        const aTotal = Object.values(a[1]).reduce((sum, count) => sum + count, 0);
        const bTotal = Object.values(b[1]).reduce((sum, count) => sum + count, 0);
        return bTotal - aTotal;
      })
      .map(([reactor, senders]) => {
        const totalReactions = Object.values(senders).reduce((sum, count) => sum + count, 0);
        const topSender = Object.entries(senders)
          .sort((a, b) => b[1] - a[1])[0];

        return `
          <div class="reactor-card">
            <div class="reactor-header">
              <span class="reactor-name">${this.escapeHtml(reactor)}</span>
              <span class="reaction-count">${totalReactions} reactions given</span>
            </div>
            <div class="senders-list">
              ${Object.entries(senders)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([sender, count]) => `
                  <div class="sender-item">
                    <span class="sender-name">${this.escapeHtml(sender)}</span>
                    <span class="sender-count">${count}</span>
                  </div>
                `).join('')}
            </div>
            ${topSender ? `
              <div class="top-sender">
                Reacts most to: <strong>${this.escapeHtml(topSender[0])}</strong> (${topSender[1]})
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

    container.innerHTML = html;
  }

  renderTopReactions() {
    const container = document.getElementById('topReactionsResults');
    
    if (!this.stats.topReactions || Object.keys(this.stats.topReactions).length === 0) {
      container.innerHTML = '<div class="no-data">No top reactions data available</div>';
      return;
    }

    const html = Object.entries(this.stats.topReactions)
      .map(([sender, reactors]) => `
        <div class="top-reactions-card">
          <div class="sender-name">${this.escapeHtml(sender)}</div>
          <div class="top-reactors">
            ${Object.entries(reactors)
              .map(([reactor, count]) => `
                <div class="top-reactor-item">
                  <span class="reactor-name">${this.escapeHtml(reactor)}</span>
                  <span class="reaction-count">${count}</span>
                </div>
              `).join('')}
          </div>
        </div>
      `).join('');

    container.innerHTML = html;
  }

  async clearData() {
    if (confirm('Are you sure you want to clear all reaction data?')) {
      try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
        this.stats = null;
        this.updateOverview();
        this.showNoData();
        this.updateStatus('Data cleared', 'success');
      } catch (error) {
        console.error('Error clearing data:', error);
        this.updateStatus('Error clearing data', 'error');
      }
    }
  }

  checkWhatsAppStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url.includes('web.whatsapp.com')) {
        this.updateStatus('WhatsApp Web detected', 'success');
      } else {
        this.updateStatus('Open WhatsApp Web to start tracking', 'warning');
      }
    });
  }

  updateStatus(message, type) {
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-dot');
    
    statusText.textContent = message;
    statusDot.className = `status-dot ${type}`;
  }

  showLoading() {
    document.querySelectorAll('.results-container').forEach(container => {
      container.innerHTML = '<div class="loading">Loading data...</div>';
    });
  }

  showNoData() {
    document.querySelectorAll('.results-container').forEach(container => {
      container.innerHTML = '<div class="no-data">No reaction data available yet. Start chatting on WhatsApp Web!</div>';
    });
  }

  showError() {
    document.querySelectorAll('.results-container').forEach(container => {
      container.innerHTML = '<div class="error">Error loading data. Please try refreshing.</div>';
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async loadAvailableChats() {
    try {
      // Request available chats from content script
      const response = await chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_CHATS' });
      
      if (response && response.chats) {
        this.availableChats = response.chats;
        this.populateChatSelector();
      } else {
        this.showChatSelectorError('No chats found');
      }
    } catch (error) {
      console.error('Error loading chats:', error);
      this.showChatSelectorError('Error loading chats');
    }
  }

  populateChatSelector() {
    const chatSelect = document.getElementById('chatSelect');
    chatSelect.innerHTML = '';
    
    if (this.availableChats.length === 0) {
      chatSelect.innerHTML = '<option value="">No chats available</option>';
      return;
    }

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a chat/group...';
    chatSelect.appendChild(defaultOption);

    // Add chat options
    this.availableChats.forEach(chat => {
      const option = document.createElement('option');
      option.value = chat.id;
      option.textContent = chat.name;
      chatSelect.appendChild(option);
    });
  }

  showChatSelectorError(message) {
    const chatSelect = document.getElementById('chatSelect');
    chatSelect.innerHTML = `<option value="">${message}</option>`;
  }

  async selectChat(chatId) {
    if (!chatId) {
      this.selectedChat = null;
      this.stats = null;
      this.updateOverview();
      this.showNoData();
      return;
    }

    this.selectedChat = chatId;
    
    try {
      // Request stats for the selected chat
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_STATS_FOR_CHAT', 
        chatId: chatId 
      });
      
      if (response && response.stats) {
        this.stats = response.stats;
        this.updateOverview();
        this.renderCurrentTab();
        this.updateStatus(`Data loaded for ${this.getChatName(chatId)}`, 'success');
      } else {
        this.updateStatus('No data available for this chat', 'warning');
        this.showNoData();
      }
    } catch (error) {
      console.error('Error loading chat stats:', error);
      this.updateStatus('Error loading chat data', 'error');
      this.showError();
    }
  }

  getChatName(chatId) {
    const chat = this.availableChats.find(c => c.id === chatId);
    return chat ? chat.name : 'Unknown Chat';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
