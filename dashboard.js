class DashboardController {
  constructor() {
    this.stats = null;
    this.availableChats = [];
    this.selectedChat = '';
    this.currentTab = 'overview';
    this.init();
  }

  init() {
    this.bindUI();
    this.refreshChats();
    this.loadStats();
    this.startAutoRefresh();
    this.updateStatus('Open WhatsApp Web for best results', 'warning');
  }

  bindUI() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadStats());
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportData());
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearData());
    const refreshChatsBtn = document.getElementById('refreshChatsBtn');
    if (refreshChatsBtn) refreshChatsBtn.addEventListener('click', () => this.refreshChats());
    const chatSelect = document.getElementById('chatSelect');
    if (chatSelect) chatSelect.addEventListener('change', (e) => this.selectChat(e.target.value));

    // Optional: manual backfill button if present
    const backfillBtn = document.getElementById('backfillBtn');
    if (backfillBtn) backfillBtn.addEventListener('click', () => this.triggerBackfill());

    // Export corpus
    const exportCorpusBtn = document.getElementById('exportCorpusBtn');
    if (exportCorpusBtn) exportCorpusBtn.addEventListener('click', () => this.exportCorpus());
    // Import corpus
    const importCorpusBtn = document.getElementById('importCorpusBtn');
    const importCorpusFile = document.getElementById('importCorpusFile');
    if (importCorpusBtn && importCorpusFile) {
      importCorpusBtn.addEventListener('click', () => importCorpusFile.click());
      importCorpusFile.addEventListener('change', (e) => this.importCorpusFromFile(e.target.files && e.target.files[0]));
    }

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });

    // Relationships controls
    const includeUnknown = document.getElementById('includeUnknown');
    if (includeUnknown) includeUnknown.addEventListener('change', () => this.renderRelationships());
    const showAll = document.getElementById('showAllRelationships');
    if (showAll) showAll.addEventListener('change', () => this.renderRelationships());
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

  renderCurrentTab() {
    if (!this.stats) {
      // Clear all tab content when no data
      this.clearAllTabContent();
      return;
    }

    switch (this.currentTab) {
      case 'overview':
        this.renderOverview();
        break;
      case 'relationships':
        this.renderRelationships();
        break;
      case 'temporal':
        this.renderTemporalAnalysis();
        break;
      case 'engagement':
        this.renderEngagementAnalysis();
        break;
      case 'content':
        this.renderContentAnalysis();
        break;
    }
  }

  clearAllTabContent() {
    // Clear all tab content containers
    const containers = [
      'topInfluencers', 'peakActivity', 'simpleList', 'replyPairs',
      'hourlyChart', 'weeklyChart', 'trendsChart',
      'activeParticipants', 'lurkers', 'influenceScores',
      'reactionTypes', 'emojiUsage', 'messageLengths'
    ];
    
    containers.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.innerHTML = '<div class="no-data">No data available</div>';
      }
    });
  }

  startAutoRefresh() {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Auto-refresh every 5 seconds to show new data
    this.refreshInterval = setInterval(async () => {
      try {
        // Only refresh if the dashboard is visible
        if (document.visibilityState === 'visible') {
          await this.loadStats();
        }
      } catch (error) {
        console.error('Auto-refresh error:', error);
      }
    }, 5000); // Refresh every 5 seconds
    
    console.log('Dashboard: Auto-refresh started (every 5 seconds)');
    this.updateStatus('Auto-refresh active (every 5s)', 'info');
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Dashboard: Auto-refresh stopped');
    }
  }

  // Single-view dashboard; no tab switching

  async refreshChats() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_AVAILABLE_CHATS' });
      if (res && res.chats) {
        this.availableChats = res.chats;
      } else {
        // Fallback to stored chats in background
        const alt = await chrome.runtime.sendMessage({ type: 'GET_STORED_CHATS' });
        this.availableChats = (alt && alt.chats) || [];
      }
      this.populateChatSelector();
    } catch (e) {
      console.warn('refreshChats error', e);
      const alt = await chrome.runtime.sendMessage({ type: 'GET_STORED_CHATS' });
      this.availableChats = (alt && alt.chats) || [];
      this.populateChatSelector();
    }
  }

  populateChatSelector() {
    const sel = document.getElementById('chatSelect');
    if (!sel) return; // Add null check
    const current = this.selectedChat;
    sel.innerHTML = '';
    this.availableChats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  async selectChat(chatId) {
    this.selectedChat = chatId || '';
    await this.loadStats();
  }

  async loadStats() {
    try {
      this.showLoading();
      let res;
      if (this.selectedChat) {
        res = await chrome.runtime.sendMessage({ type: 'GET_STATS_FOR_CHAT', chatId: this.selectedChat });
      } else {
        res = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      }
      if (res && res.stats) {
        this.stats = res.stats;
        this.updateOverview();
        this.render();
        this.updateStatus('Data loaded', 'success');
      } else {
        this.stats = null;
        this.updateOverview();
        this.showNoData();
        this.updateStatus('No data available', 'warning');
      }
    } catch (e) {
      console.error('loadStats error', e);
      this.updateStatus('Error loading data', 'error');
      this.showError();
    }
  }

  updateOverview() {
    const tm = document.getElementById('totalMessages');
    const tr = document.getElementById('totalReactions');
    if (tm) tm.textContent = this.stats?.totalMessages || 0;
    if (tr) tr.textContent = this.stats?.totalReactions || 0;
  }

  render() {
    if (!this.stats) return;
    this.updateDataQuality();
    this.renderCurrentTab();
  }

  updateDataQuality() {
    if (!this.stats.dataQuality) return;

    const qualityScore = document.getElementById('qualityScore');
    const extractionRate = document.getElementById('extractionRate');
    const confidenceLevel = document.getElementById('confidenceLevel');
    const sampleSize = document.getElementById('sampleSize');
    const coverageStart = this.stats.dataQuality.coverageStartTs;
    const coverageEnd = this.stats.dataQuality.coverageEndTs;

    if (qualityScore) qualityScore.textContent = `${Math.round(this.stats.dataQuality.completenessScore)}%`;
    if (extractionRate) extractionRate.textContent = `${Math.round(this.stats.dataQuality.extractionRate)}%`;
    if (confidenceLevel) confidenceLevel.textContent = `${Math.round(this.stats.dataQuality.confidenceLevel)}%`;
    if (sampleSize) sampleSize.textContent = this.stats.dataQuality.sampleSize.toLocaleString();

    // Add title tooltip to indicate coverage window if available
    try {
      const dq = document.getElementById('dataQualitySection');
      if (dq && coverageStart && coverageEnd) {
        const start = new Date(coverageStart).toLocaleString();
        const end = new Date(coverageEnd).toLocaleString();
        dq.title = `Coverage window: ${start} → ${end}`;
      }
    } catch {}
  }

  async triggerBackfill() {
    try {
      this.updateStatus('Backfill starting...', 'info');
      const res = await chrome.runtime.sendMessage({ type: 'START_BACKFILL', options: { steps: 40, stepDelayMs: 900 } });
      if (res && !res.error) {
        this.updateStatus(`Backfill performed ${res.performed || 0} steps`, 'success');
        await this.loadStats();
      } else {
        this.updateStatus(`Backfill error: ${res && res.error ? res.error : 'unknown'}`, 'error');
      }
    } catch (e) {
      this.updateStatus(`Backfill failed: ${e && e.message || e}`, 'error');
    }
  }

  async exportCorpus() {
    try {
      this.updateStatus('Exporting corpus...', 'info');
      const res = await chrome.runtime.sendMessage({ type: 'DUMP_CORPUS' });
      if (!res || res.error) throw new Error(res && res.error || 'Unknown error');
      const blob = new Blob([JSON.stringify(res.corpus, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp-corpus-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.updateStatus('Corpus exported', 'success');
    } catch (e) {
      this.updateStatus(`Export failed: ${e && e.message || e}`, 'error');
    }
  }

  async importCorpusFromFile(file) {
    if (!file) return;
    try {
      this.updateStatus('Importing corpus...', 'info');
      const text = await file.text();
      const corpus = JSON.parse(text);
      const res = await chrome.runtime.sendMessage({ type: 'IMPORT_CORPUS', corpus });
      if (!res || res.error) throw new Error(res && res.error || 'Unknown error');
      this.updateStatus(`Imported ${res.total || 0} messages`, 'success');
      await this.loadStats();
    } catch (e) {
      this.updateStatus(`Import failed: ${e && e.message || e}`, 'error');
    } finally {
      try {
        const input = document.getElementById('importCorpusFile');
        if (input) input.value = '';
      } catch {}
    }
  }

  renderOverview() {
    // Update key metrics
    const totalMessages = document.getElementById('totalMessagesOverview');
    const totalReactions = document.getElementById('totalReactionsOverview');
    const activeParticipants = document.getElementById('activeParticipantsOverview');
    const networkDensity = document.getElementById('networkDensityOverview');

    if (totalMessages) totalMessages.textContent = this.stats.totalMessages || 0;
    if (totalReactions) totalReactions.textContent = this.stats.totalReactions || 0;
    
    // Handle both Set objects and arrays for activeParticipants count
    const activeCount = this.stats.engagementMetrics?.activeParticipants;
    const participantCount = activeCount instanceof Set ? activeCount.size : (activeCount?.length || 0);
    if (activeParticipants) activeParticipants.textContent = participantCount;
    
    if (networkDensity) networkDensity.textContent = `${Math.round((this.stats.engagementMetrics?.networkDensity || 0) * 100)}%`;

    // Render top influencers
    this.renderTopInfluencers();
    
    // Render peak activity
    this.renderPeakActivity();
  }

  renderTopInfluencers() {
    const container = document.getElementById('topInfluencers');
    if (!container || !this.stats.engagementMetrics?.influencers) return;

    // Normalize to array of {name, score, totalReactions, perMessage, totalMessages}
    const raw = this.stats.engagementMetrics.influencers instanceof Map
      ? Array.from(this.stats.engagementMetrics.influencers.entries())
      : Object.entries(this.stats.engagementMetrics.influencers);

    const items = raw.map(([name, val]) => {
      if (typeof val === 'number') {
        return { name, score: Math.round(val * 100), totalReactions: null, perMessage: val, totalMessages: null };
      }
      return { name, score: val.score ?? 0, totalReactions: val.totalReactions ?? 0, perMessage: val.perMessage ?? 0, totalMessages: val.totalMessages ?? 0 };
    });

    // If legacy numeric values are present, derive totals from overall stats
    const msgCount = this.stats.messageCount || {};
    const bySender = this.stats.bySender || {};
    items.forEach(it => {
      const name = it.name;
      const derivedMsgs = typeof msgCount[name] === 'number' ? msgCount[name] : 0;
      const senderMap = bySender[name] || {};
      const derivedReacts = Object.values(senderMap).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
      if (it.totalMessages == null) it.totalMessages = derivedMsgs;
      if (it.totalReactions == null) it.totalReactions = derivedReacts;
      // Recompute per-message from derived data if legacy value was used
      if (derivedMsgs > 0 && (typeof it.perMessage !== 'number' || it.perMessage === 0)) {
        it.perMessage = derivedReacts / derivedMsgs;
      }
    });

    const sorted = items.sort((a, b) => b.score - a.score).slice(0, 5);

    // Use existing styles (.influence-item, .person-name, .influence-score)
    const header = `
      <div class="influence-item" title="Top influencers in this selection">
        <span class="person-name mini">Person</span>
        <span class="influence-score mini">Score</span>
      </div>
    `;

    const rows = sorted.map(it => `
      <div class="influence-item">
        <span class="person-name">${this.escape(it.name)}</span>
        <span class="influence-score" title="Influence score (0–100)">${it.score}</span>
      </div>
      <div class="mini">Reactions: ${it.totalReactions ?? 0} | Reacts/Msg: ${(isFinite(it.perMessage) ? it.perMessage : 0).toFixed(2)}${it.totalMessages ? ` | Msgs: ${it.totalMessages}` : ''}</div>
    `).join('');

    container.innerHTML = (sorted.length ? (header + rows) : '<div class="no-data">No influence data available</div>');
  }

  renderPeakActivity() {
    const container = document.getElementById('peakActivity');
    if (!container || !this.stats.temporalAnalysis?.peakHours) return;

    const peakHours = this.stats.temporalAnalysis.peakHours.slice(0, 3);
    const peakDays = this.stats.temporalAnalysis.peakDays.slice(0, 3);

    let html = '<div class="peak-hours"><strong>Peak Hours:</strong><br>';
    peakHours.forEach(peak => {
      html += `${peak.hour}:00 - ${peak.messages} msgs<br>`;
    });
    html += '</div><div class="peak-days"><strong>Peak Days:</strong><br>';
    peakDays.forEach(peak => {
      html += `${peak.dayName} - ${peak.messages} msgs<br>`;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  renderTemporalAnalysis() {
    this.renderHourlyChart();
    this.renderWeeklyChart();
    this.renderTrendsChart();
  }

  renderHourlyChart() {
    const container = document.getElementById('hourlyChart');
    if (!container || !this.stats.temporalAnalysis?.hourlyActivity) return;

    const hourlyData = this.stats.temporalAnalysis.hourlyActivity;
    const hours = Array.from({length: 24}, (_, i) => i);
    
    // Handle both Map objects and plain objects
    const messages = hours.map(hour => {
      const data = hourlyData instanceof Map ? hourlyData.get(hour) : hourlyData[hour];
      return data?.messages || 0;
    });
    const reactions = hours.map(hour => {
      const data = hourlyData instanceof Map ? hourlyData.get(hour) : hourlyData[hour];
      return data?.reactions || 0;
    });

    const maxMsgs = Math.max(1, ...messages);
    const labelHours = hours.map(h => (h % 3 === 0 ? String(h).padStart(2, '0') : ''));
    container.innerHTML = `
      <div class="chart-placeholder">
        <h5>Hourly Activity</h5>
        <p>Peak: ${hours[messages.indexOf(Math.max(...messages))]}:00 (${Math.max(...messages)} msgs)</p>
        <div class="mini-chart">
          ${hours.map((hour, i) => `
            <div class="bar" style="height: ${(messages[i] / maxMsgs) * 100}%;" title="${hour}:00 - ${messages[i]} msgs"></div>
          `).join('')}
        </div>
        <div class="mini-chart-labels">
          ${labelHours.map(l => `<span class="label">${l}</span>`).join('')}
        </div>
      </div>
    `;
  }

  renderWeeklyChart() {
    const container = document.getElementById('weeklyChart');
    if (!container || !this.stats.temporalAnalysis?.weeklyPatterns) return;

    const weeklyData = this.stats.temporalAnalysis.weeklyPatterns;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Handle both Map objects and plain objects
    const messages = days.map((_, i) => {
      const data = weeklyData instanceof Map ? weeklyData.get(i) : weeklyData[i];
      return data?.messages || 0;
    });

    const maxW = Math.max(1, ...messages);
    container.innerHTML = `
      <div class="chart-placeholder">
        <h5>Weekly Patterns</h5>
        <p>Most active: ${days[messages.indexOf(Math.max(...messages))]} (${Math.max(...messages)} msgs)</p>
        <div class="mini-chart">
          ${days.map((day, i) => `
            <div class="bar" style="height: ${(messages[i] / maxW) * 100}%;" title="${day} - ${messages[i]} msgs"></div>
          `).join('')}
        </div>
        <div class="mini-chart-labels">
          ${days.map(d => `<span class="label">${d}</span>`).join('')}
        </div>
      </div>
    `;
  }

  renderTrendsChart() {
    const container = document.getElementById('trendsChart');
    if (!container || !this.stats.temporalAnalysis?.activityTrends) return;

    const trends = this.stats.temporalAnalysis.activityTrends.slice(-7); // Last 7 days
    const dates = trends.map(t => new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    const messages = trends.map(t => t.messages);
    const reactions = trends.map(t => t.reactions || 0);
    const participants = trends.map(t => t.participants || 0);
    const totalMsgs = messages.reduce((s, n) => s + n, 0);
    const totalReacts = reactions.reduce((s, n) => s + n, 0);
    const maxT = Math.max(1, ...messages);

    container.innerHTML = `
      <div class="chart-placeholder">
        <h5>Recent Trends</h5>
        <p>Last 7 days: ${totalMsgs} msgs, ${totalReacts} reactions</p>
        <div class="mini-chart">
          ${dates.map((date, i) => `
            <div class="bar" style="height: ${(messages[i] / maxT) * 100}%;" title="${date} - ${messages[i]} msgs, ${reactions[i]} reactions, ${participants[i]} participants"></div>
          `).join('')}
        </div>
        <div class="mini-chart-labels">
          ${dates.map(d => `<span class="label">${d}</span>`).join('')}
        </div>
      </div>
    `;
  }

  renderEngagementAnalysis() {
    this.renderActiveParticipants();
    this.renderLurkers();
    this.renderInfluenceScores();
  }

  renderActiveParticipants() {
    const container = document.getElementById('activeParticipants');
    if (!container || !this.stats.engagementMetrics?.activeParticipants) return;

    // Handle both Set objects and arrays
    const active = this.stats.engagementMetrics.activeParticipants instanceof Set
      ? Array.from(this.stats.engagementMetrics.activeParticipants)
      : this.stats.engagementMetrics.activeParticipants;
    
    const html = active.map(name => `
      <div class="participant-item">
        <span class="person-name">${this.escape(name)}</span>
        <span class="status-badge active">Active</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="no-data">No active participants</div>';
  }

  renderLurkers() {
    const container = document.getElementById('lurkers');
    if (!container || !this.stats.engagementMetrics?.lurkers) return;

    // Handle both Set objects and arrays
    const lurkers = this.stats.engagementMetrics.lurkers instanceof Set
      ? Array.from(this.stats.engagementMetrics.lurkers)
      : this.stats.engagementMetrics.lurkers;
    
    const html = lurkers.map(name => `
      <div class="participant-item">
        <span class="person-name">${this.escape(name)}</span>
        <span class="status-badge lurker">Lurker</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="no-data">No lurkers detected</div>';
  }

  renderInfluenceScores() {
    const container = document.getElementById('influenceScores');
    if (!container || !this.stats.engagementMetrics?.influencers) return;

    // Normalize to array of {name, score, totalReactions, perMessage, totalMessages}
    const raw = this.stats.engagementMetrics.influencers instanceof Map
      ? Array.from(this.stats.engagementMetrics.influencers.entries())
      : Object.entries(this.stats.engagementMetrics.influencers);

    const items = raw.map(([name, val]) => {
      if (typeof val === 'number') {
        return { name, score: Math.round(val * 100), totalReactions: null, perMessage: val, totalMessages: null };
      }
        return { name, score: val.score ?? 0, totalReactions: val.totalReactions ?? 0, perMessage: val.perMessage ?? 0, totalMessages: val.totalMessages ?? 0 };
    });
    // Derive totals when legacy numeric values are present
    const msgCount2 = this.stats.messageCount || {};
    const bySender2 = this.stats.bySender || {};
    items.forEach(it => {
      const name = it.name;
      const derivedMsgs = typeof msgCount2[name] === 'number' ? msgCount2[name] : 0;
      const senderMap = bySender2[name] || {};
      const derivedReacts = Object.values(senderMap).reduce((s, n) => s + (typeof n === 'number' ? n : 0), 0);
      if (it.totalMessages == null) it.totalMessages = derivedMsgs;
      if (it.totalReactions == null) it.totalReactions = derivedReacts;
      if (derivedMsgs > 0 && (typeof it.perMessage !== 'number' || it.perMessage === 0)) {
        it.perMessage = derivedReacts / derivedMsgs;
      }
    });

    const sorted = items.sort((a, b) => b.score - a.score);

    const html = sorted.map(it => `
      <div class="influence-item">
        <span class="person-name">${this.escape(it.name)}</span>
        <span class="influence-score">${it.score}</span>
        <span class="mini">${it.totalReactions ?? 0} reactions (${it.perMessage.toFixed(2)}/msg${it.totalMessages ? `, ${it.totalMessages} msgs` : ''})</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="no-data">No influence data</div>';
  }

  renderContentAnalysis() {
    this.renderReactionTypes();
    this.renderEmojiUsage();
    this.renderMessageLengths();
  }

  renderReactionTypes() {
    const container = document.getElementById('reactionTypes');
    if (!container || !this.stats.contentAnalysis?.reactionTypes) return;

    // Handle both Map objects and plain objects
    const types = this.stats.contentAnalysis.reactionTypes instanceof Map
      ? Array.from(this.stats.contentAnalysis.reactionTypes.entries())
      : Object.entries(this.stats.contentAnalysis.reactionTypes);
    
    const sortedTypes = types.sort((a, b) => b[1] - a[1]);

    const html = sortedTypes.map(([type, count]) => `
      <div class="reaction-item">
        <span class="reaction-type">${this.escape(type)}</span>
        <span class="reaction-count">${count}</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="no-data">No reaction data</div>';
  }

  renderEmojiUsage() {
    const container = document.getElementById('emojiUsage');
    if (!container || !this.stats.contentAnalysis?.emojiUsage) return;

    // Handle both Map objects and plain objects
    const emojis = this.stats.contentAnalysis.emojiUsage instanceof Map
      ? Array.from(this.stats.contentAnalysis.emojiUsage.entries())
      : Object.entries(this.stats.contentAnalysis.emojiUsage);
    
    const sortedEmojis = emojis
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const html = sortedEmojis.map(([emoji, count]) => `
      <div class="emoji-item">
        <span class="emoji">${emoji}</span>
        <span class="emoji-count">${count}</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="no-data">No emoji data</div>';
  }

  renderMessageLengths() {
    const container = document.getElementById('messageLengths');
    if (!container || !this.stats.contentAnalysis?.messageLengths) return;

    // Handle both Map objects and plain objects
    const lengths = this.stats.contentAnalysis.messageLengths instanceof Map
      ? Array.from(this.stats.contentAnalysis.messageLengths.entries())
      : Object.entries(this.stats.contentAnalysis.messageLengths);
    
    const sortedLengths = lengths.sort((a, b) => b[1] - a[1]);

    const html = sortedLengths.map(([name, length]) => `
      <div class="length-item">
        <span class="person-name">${this.escape(name)}</span>
        <span class="avg-length">${Math.round(length)} chars</span>
      </div>
    `).join('');

    container.innerHTML = html || '<div class="no-data">No length data</div>';
  }

  renderSimpleRelationships() {
    const el = document.getElementById('simpleList');
    if (!el) return;
    const rows = this.stats.simpleRelationships || [];
    if (!rows.length) { el.innerHTML = '<div class="no-data">No relationships yet. Scroll chats to load data.</div>'; return; }
    const html = rows.map(r => {
      const person = this.escape(r.person);
      const outSentence = r.mostOutgoing
        ? `${person} responds the most to ${this.escape(r.mostOutgoing.target)} (${r.mostOutgoing.count}).`
        : `${person} has not responded to anyone yet.`;
      const inSentence = r.mostIncoming
        ? `${person} receives the most responses from ${this.escape(r.mostIncoming.from)} (${r.mostIncoming.count}).`
        : `${person} has not received responses yet.`;
      return `
        <div class="simple-card">
          <div class="simple-header">
            <span class="person-name">${person}</span>
            <span class="mini">out: ${r.totals.outgoing} | in: ${r.totals.incoming}</span>
          </div>
          <div>${outSentence}</div>
          <div>${inSentence}</div>
        </div>`;
    }).join('');
    el.innerHTML = html;
  }

  renderRelationships() {
    // Match dashboard.html container
    const c = document.getElementById('relationshipsList');
    if (!c) return; // Container not found
    const rels = this.stats.relationships || [];
    if (!rels.length) {
      c.innerHTML = '<div class="no-data">No relationship data yet. Try reacting to messages.</div>';
      return;
    }
    // Filters and limits
    const includeUnknown = !!document.getElementById('includeUnknown')?.checked;
    const showAll = !!document.getElementById('showAllRelationships')?.checked;
    const relsFiltered = includeUnknown ? rels : rels.filter(r => r.from !== 'Unknown' && r.to !== 'Unknown');
    const limit = showAll ? relsFiltered.length : Math.min(100, relsFiltered.length);

    // Summary
    const summary = document.getElementById('relationshipsSummary');
    if (summary) summary.textContent = `${relsFiltered.length} pairs${showAll ? '' : ` (showing ${limit})`}`;

    let html = '';
    relsFiltered.slice(0, limit).forEach(rel => {
      const strengthPercent = (rel.strength * 100).toFixed(1);
      const likelihoodPercent = (rel.likelihood * 100).toFixed(1);
      const focusPercent = (rel.focus * 100).toFixed(1);
      html += `
        <div class="relationship-card">
          <div class="relationship-header">
            <div class="relationship-pair">
              <span class="reactor-name-rel">${this.escape(rel.from)}</span>
              <span class="arrow"></span>
              <span class="sender-name-rel">${this.escape(rel.to)}</span>
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
          <div class="progress-bar"><div class="progress-fill" style="width:${strengthPercent}%"></div></div>
        </div>`;
    });
    c.innerHTML = html;
  }

  renderBySender() {
    const el = document.getElementById('bySenderResults');
    if (!el) return; // Add null check
    const bySender = this.stats.bySender || {};
    const senders = Object.entries(bySender);
    if (!senders.length) { el.innerHTML = '<div class="no-data">No sender data</div>'; return; }
    const html = senders
      .sort((a,b) => (Object.values(b[1]).reduce((s,n)=>s+n,0) - Object.values(a[1]).reduce((s,n)=>s+n,0)))
      .map(([sender, reactors]) => {
        const total = Object.values(reactors).reduce((s,n)=>s+n,0);
        const top = Object.entries(reactors).sort((a,b)=>b[1]-a[1]).slice(0,5)
          .map(([r,c])=>`<div class="reactor-item"><span>${this.escape(r)}</span><span>${c}</span></div>`).join('');
        return `<div class="sender-card">
          <div class="sender-header"><span class="sender-name-rel">${this.escape(sender)}</span><span class="reaction-count">${total} reactions</span></div>
          <div class="reactors-list">${top}</div>
        </div>`;
      }).join('');
    el.innerHTML = html;
  }

  renderByReactor() {
    const el = document.getElementById('byReactorResults');
    if (!el) return; // Add null check
    const byReactor = this.stats.byReactor || {};
    const reactors = Object.entries(byReactor);
    if (!reactors.length) { el.innerHTML = '<div class="no-data">No reactor data</div>'; return; }
    const html = reactors
      .sort((a,b) => (Object.values(b[1]).reduce((s,n)=>s+n,0) - Object.values(a[1]).reduce((s,n)=>s+n,0)))
      .map(([reactor, senders]) => {
        const total = Object.values(senders).reduce((s,n)=>s+n,0);
        const top = Object.entries(senders).sort((a,b)=>b[1]-a[1]).slice(0,5)
          .map(([s,c])=>`<div class="sender-item"><span>${this.escape(s)}</span><span>${c}</span></div>`).join('');
        return `<div class="reactor-card">
          <div class="reactor-header"><span class="reactor-name-rel">${this.escape(reactor)}</span><span class="reaction-count">${total} reactions given</span></div>
          <div class="senders-list">${top}</div>
        </div>`;
      }).join('');
    el.innerHTML = html;
  }

  renderTopReactions() {
    const el = document.getElementById('topReactionsResults');
    if (!el) return; // Add null check
    const tops = this.stats.topReactions || {};
    const entries = Object.entries(tops);
    if (!entries.length) { el.innerHTML = '<div class="no-data">No top reactions data</div>'; return; }
    const html = entries.map(([sender, reactors]) => {
      const items = Object.entries(reactors).map(([r,c])=>`<div class="top-reactor-item"><span>${this.escape(r)}</span><span>${c}</span></div>`).join('');
      return `<div class="top-reactions-card"><div class="sender-name-rel">${this.escape(sender)}</div><div class="top-reactors">${items}</div></div>`;
    }).join('');
    el.innerHTML = html;
  }

  renderSelectivity() {
    const reactorsEl = document.getElementById('biasedReactorsResults');
    const pairsEl = document.getElementById('biasedPairsResults');
    
    if (!reactorsEl || !pairsEl) return; // Add null checks

    const biasedReactors = this.stats.biasedReactors || [];
    const selectivity = this.stats.selectivity || [];

    // Reactors
    if (!biasedReactors.length) {
      reactorsEl.innerHTML = '<div class="no-data">No selective patterns detected yet</div>';
    } else {
      const html = biasedReactors.slice(0, 15).map(br => {
        const top = (br.topTargets || []).slice(0, 3).map(t => `
          <div class="bias-item">
            <span>${this.escape(t.target)}</span>
            <span>${t.reactions} • focus ${(t.focus*100).toFixed(0)}% • lift ${t.lift.toFixed(2)}</span>
          </div>
        `).join('');
        return `
          <div class="bias-card">
            <div class="bias-header">
              <span class="bias-name">${this.escape(br.reactor)}</span>
              <span class="bias-badge">Selectivity ${(br.biasIndex*100).toFixed(0)}%</span>
            </div>
            <div class="bias-subtle">Total reactions: ${br.totalReactions}</div>
            <div class="reactors-list">${top}</div>
          </div>
        `;
      }).join('');
      reactorsEl.innerHTML = html;
    }

    // Pairs
    if (!selectivity.length) {
      pairsEl.innerHTML = '<div class="no-data">No biased pairs detected yet</div>';
    } else {
      const html = selectivity.slice(0, 20).map(p => `
        <div class="bias-card">
          <div class="bias-header">
            <span class="bias-name">${this.escape(p.reactor)} → ${this.escape(p.target)}</span>
            <span class="bias-badge">Score ${(p.selectivity*100).toFixed(0)}%</span>
          </div>
          <div class="bias-metrics">
            <div class="metric"><div class="metric-label">Reactions</div><div class="metric-value">${p.reactions}</div></div>
            <div class="metric"><div class="metric-label">Focus</div><div class="metric-value">${(p.focus*100).toFixed(0)}%</div></div>
            <div class="metric"><div class="metric-label">Lift</div><div class="metric-value">${p.lift.toFixed(2)}</div></div>
          </div>
          <div class="bias-subtle">Baseline msgs by ${this.escape(p.target)}: ${(p.targetMessageShare*100).toFixed(1)}%</div>
        </div>
      `).join('');
      pairsEl.innerHTML = html;
    }
  }

  renderResponses() {
    const respondersEl = document.getElementById('biasedRespondersResults');
    const replyPairsEl = document.getElementById('replyPairsResults');
    
    if (!respondersEl || !replyPairsEl) return; // Add null checks

    const biasedResponders = this.stats.biasedResponders || [];
    const respondSelectivity = this.stats.respondSelectivity || [];

    // Responders
    if (!biasedResponders.length) {
      respondersEl.innerHTML = '<div class="no-data">No selective responders detected yet</div>';
    } else {
      const html = biasedResponders.slice(0, 15).map(br => {
        const top = (br.topTargets || []).slice(0, 3).map(t => `
          <div class="bias-item">
            <span>${this.escape(t.target)}</span>
            <span>${t.replies} • focus ${(t.focus*100).toFixed(0)}% • lift ${t.lift.toFixed(2)}</span>
          </div>
        `).join('');
        return `
          <div class="bias-card">
            <div class="bias-header">
              <span class="bias-name">${this.escape(br.replier)}</span>
              <span class="bias-badge">Selectivity ${(br.biasIndex*100).toFixed(0)}%</span>
            </div>
            <div class="bias-subtle">Total replies: ${br.totalReplies}</div>
            <div class="reactors-list">${top}</div>
          </div>
        `;
      }).join('');
      respondersEl.innerHTML = html;
    }

    // Pair list
    if (!respondSelectivity.length) {
      replyPairsEl.innerHTML = '<div class="no-data">No reply pairs detected yet</div>';
    } else {
      const html = respondSelectivity.slice(0, 20).map(p => `
        <div class="bias-card">
          <div class="bias-header">
            <span class="bias-name">${this.escape(p.replier)} → ${this.escape(p.target)}</span>
            <span class="bias-badge">Score ${(p.selectivity*100).toFixed(0)}%</span>
          </div>
          <div class="bias-metrics">
            <div class="metric"><div class="metric-label">Replies</div><div class="metric-value">${p.replies}</div></div>
            <div class="metric"><div class="metric-label">Focus</div><div class="metric-value">${(p.focus*100).toFixed(0)}%</div></div>
            <div class="metric"><div class="metric-label">Lift</div><div class="metric-value">${p.lift.toFixed(2)}</div></div>
          </div>
          <div class="bias-subtle">Baseline msgs by ${this.escape(p.target)}: ${(p.targetMessageShare*100).toFixed(1)}%</div>
        </div>
      `).join('');
      replyPairsEl.innerHTML = html;
    }
  }

  async clearData() {
    if (!confirm('Clear all reaction data?')) return;
    await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
    this.stats = null;
    this.updateOverview();
    this.showNoData();
    this.renderCurrentTab(); // Refresh current tab content
    this.updateStatus('Data cleared', 'success');
  }

  exportData() {
    if (!this.stats) {
      alert('No data to export');
      return;
    }

    // Handle both Set objects and arrays for participants count
    const activeCount = this.stats.engagementMetrics?.activeParticipants;
    const participantCount = activeCount instanceof Set ? activeCount.size : (activeCount?.length || 0);

    const exportData = {
      exportDate: new Date().toISOString(),
      chatId: this.selectedChat,
      chatName: this.getChatName(this.selectedChat),
      stats: this.stats,
      summary: {
        totalMessages: this.stats.totalMessages,
        totalReactions: this.stats.totalReactions,
        participants: participantCount,
        dataQuality: this.stats.dataQuality?.completenessScore || 0
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-analysis-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.updateStatus('Data exported successfully', 'success');
  }

  getChatName(chatId) {
    const chat = this.availableChats.find(c => c.id === chatId);
    return chat ? chat.name : 'All Chats';
  }

  updateStatus(message, type) {
    const statusText = document.getElementById('statusText');
    const dot = document.getElementById('statusDot');
    
    if (statusText) statusText.textContent = message;
    if (dot) dot.className = `status-dot ${type}`;
  }

  showLoading() {
    document.querySelectorAll('.results-container').forEach(c => {
      if (c) c.innerHTML = '<div class="loading">Loading...</div>';
    });
  }
  showNoData() {
    const simple = document.getElementById('simpleList');
    if (simple) simple.innerHTML = '<div class="no-data">No data available</div>';
  }
  showError() {
    document.querySelectorAll('.results-container').forEach(c => {
      if (c) c.innerHTML = '<div class="error">Error loading data</div>';
    });
  }

  escape(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => new DashboardController());
