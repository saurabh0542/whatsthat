// What's That!? - Background Script
class ReactionDataProcessor {
  constructor() {
    this.reactionData = new Map();
    this.setupMessageListener();
    this.setupActionClick();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // Keep channel open for async responses when needed
      let willRespondAsync = false;
      switch (request.type) {
        case 'REACTION_DATA_UPDATE':
          this.updateReactionData(request.data);
          break;
        case 'DUMP_CORPUS': {
          try {
            const corpus = this.dumpCorpus();
            sendResponse({ corpus });
          } catch (e) {
            sendResponse({ error: String(e && e.message || e) });
          }
          break;
        }
        case 'IMPORT_CORPUS': {
          try {
            const { corpus } = request;
            if (corpus && typeof corpus === 'object') {
              this.importCorpus(corpus);
              sendResponse({ success: true, total: this.reactionData.size });
            } else {
              sendResponse({ error: 'Invalid corpus' });
            }
          } catch (e) {
            sendResponse({ error: String(e && e.message || e) });
          }
          break;
        }
        case 'OPEN_DASHBOARD': {
          try {
            const url = chrome.runtime.getURL('dashboard.html');
            chrome.tabs.create({ url });
            sendResponse({ success: true });
          } catch (e) {
            sendResponse({ error: String(e && e.message || e) });
          }
          break;
        }
        case 'GET_STATS':
          const stats = this.calculateStats();
          sendResponse({ stats: this.serializeStats(stats) });
          break;
        case 'GET_STATS_FOR_CHAT':
          // Chat-specific filtering is not wired yet since content data lacks chat IDs.
          const chatStats = this.calculateStats({ chatId: request.chatId });
          sendResponse({ stats: this.serializeStats(chatStats) });
          break;
        case 'GET_STORED_CHATS': {
          const chats = this.getStoredChats();
          sendResponse({ chats });
          break;
        }
        case 'GET_AVAILABLE_CHATS': {
          willRespondAsync = true;
          this.forwardToActiveTab(request, sendResponse);
          break;
        }
        case 'START_BACKFILL': {
          willRespondAsync = true;
          this.forwardToActiveTab(request, sendResponse);
          break;
        }
        case 'GET_REACTION_DATA': {
          willRespondAsync = true;
          this.forwardToActiveTab(request, sendResponse);
          break;
        }
        case 'CLEAR_DATA':
          this.clearData();
          sendResponse({ success: true });
          break;
      }
      return willRespondAsync;
    });
  }

  setupActionClick() {
    if (chrome.action && chrome.action.onClicked) {
      chrome.action.onClicked.addListener(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
      });
    }
  }

  forwardToActiveTab(message, sendResponse) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        // Fallback to stored chats if asking for chats
        if (message.type === 'GET_AVAILABLE_CHATS') {
          const chats = this.getStoredChats();
          sendResponse({ chats });
        } else {
          sendResponse({ error: 'No active tab' });
        }
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          if (message.type === 'GET_AVAILABLE_CHATS') {
            // Fallback: return chats from storage
            const chats = this.getStoredChats();
            sendResponse({ chats });
          } else {
            sendResponse({ error: lastErr.message });
          }
        } else {
          sendResponse(response);
        }
      });
    });
  }

  updateReactionData(newData) {
    console.log('Background: Received data update with', Object.keys(newData).length, 'messages');
    
    // Merge new data with existing data
    Object.entries(newData).forEach(([messageId, messageData]) => {
      if (!this.reactionData.has(messageId)) {
        this.reactionData.set(messageId, {
          sender: messageData.sender,
          reactions: new Map(),
          timestamp: messageData.timestamp,
          chatId: messageData.chatId || 'unknown',
          chatName: messageData.chatName || 'Unknown Chat',
          replyTo: messageData.replyTo || null,
          messageLength: typeof messageData.messageLength === 'number' ? messageData.messageLength : 0
        });
      }

      const existingData = this.reactionData.get(messageId);
      existingData.chatId = messageData.chatId || existingData.chatId || 'unknown';
      existingData.chatName = messageData.chatName || existingData.chatName || 'Unknown Chat';
      existingData.replyTo = messageData.replyTo || existingData.replyTo || null;
      if (typeof messageData.messageLength === 'number') existingData.messageLength = messageData.messageLength;
      
      // Update reactions
      Object.entries(messageData.reactions).forEach(([emoji, reactors]) => {
        if (!existingData.reactions.has(emoji)) {
          existingData.reactions.set(emoji, new Map());
        }

        const emojiReactions = existingData.reactions.get(emoji);
        const pairs = reactors instanceof Map
          ? Array.from(reactors.entries())
          : Object.entries(reactors || {});
        pairs.forEach(([reactor, count]) => {
          emojiReactions.set(reactor, count);
        });
      });
    });

    console.log('Background: Total messages stored:', this.reactionData.size);

    // Store in Chrome storage
    this.saveToStorage();
  }

  calculateStats(options = {}) {
    const { chatId } = options;
    console.log('Background: Calculating stats from', this.reactionData.size, 'messages', chatId ? `(chat: ${chatId})` : '');
    
    const stats = {
      bySender: new Map(), // sender -> Map(reactor -> totalReactions)
      byReactor: new Map(), // reactor -> Map(sender -> totalReactions)
      topReactions: new Map(), // sender -> Map(reactor -> count)
      totalMessages: 0,
      totalReactions: 0,
      // Advanced analytics
      messageCount: new Map(), // sender -> total messages sent
      reactionRates: new Map(), // sender -> reactions received per message
      relationships: [], // Array of {from, to, strength, likelihood}
      topPairs: [], // Top reactor-reactee pairs
      reactionMatrix: new Map(), // sender -> reactor -> {reactions, messages, rate}
      // Bias/selectivity analytics (reactions)
      messageShare: new Map(), // sender -> share of messages in chat
      biasedReactors: [],
      selectivity: [], // Array of {reactor, target, reactions, focus, lift, selectivity}
      // Enhanced analytics
      temporalAnalysis: {
        hourlyActivity: new Map(), // hour -> {messages, reactions}
        dailyActivity: new Map(), // date -> {messages, reactions}
        weeklyPatterns: new Map(), // dayOfWeek -> {messages, reactions}
        activityTrends: [], // Array of {date, messages, reactions, participants}
        peakHours: [],
        peakDays: []
      },
      engagementMetrics: {
        responseTime: new Map(), // sender -> avg response time
        conversationThreads: [], // Array of {participants, messages, duration}
        activeParticipants: new Set(),
        lurkers: new Set(),
        influencers: new Map(), // person -> influence score
        networkDensity: 0,
        clusteringCoefficient: 0
      },
      contentAnalysis: {
        emojiUsage: new Map(), // emoji -> count
        reactionTypes: new Map(), // reaction type -> count
        messageLengths: new Map(), // sender -> avg message length
        replyChains: [], // Array of {chainId, participants, length}
        topicClusters: [] // Array of {participants, frequency}
      },
      dataQuality: {
        extractionRate: 0, // percentage of messages with reactions
        completenessScore: 0, // overall data completeness
        confidenceLevel: 0, // confidence in analytics
        lastUpdated: Date.now(),
        sampleSize: 0
      }
    };

    // Filter messages by chat when requested
    const iterMessages = [];
    this.reactionData.forEach((messageData, messageId) => {
      if (!chatId || messageData.chatId === chatId) {
        iterMessages.push([messageId, messageData]);
      }
    });

    iterMessages.forEach(([messageId, messageData]) => {
      const sender = messageData.sender;

      if (!stats.bySender.has(sender)) {
        stats.bySender.set(sender, new Map());
      }

      const senderStats = stats.bySender.get(sender);

      // We care about who reacted to whom, not which emoji.
      // Count each reactor at most once per message, aggregated across emojis.
      const uniqueReactors = new Set();
      if (messageData.reactions && typeof messageData.reactions.forEach === 'function') {
        messageData.reactions.forEach((reactors /* Map or Object */, _emoji) => {
          if (reactors && typeof reactors.forEach === 'function') {
            reactors.forEach((_count, reactor) => uniqueReactors.add(reactor));
          } else if (reactors && typeof reactors === 'object') {
            Object.keys(reactors).forEach(reactor => uniqueReactors.add(reactor));
          }
        });
      }

      uniqueReactors.forEach((reactor) => {
        // Update sender stats (reactor -> +1 per message)
        senderStats.set(reactor, (senderStats.get(reactor) || 0) + 1);

        // Update reactor stats (sender -> +1 per message)
        if (!stats.byReactor.has(reactor)) {
          stats.byReactor.set(reactor, new Map());
        }
        const reactorStats = stats.byReactor.get(reactor);
        reactorStats.set(sender, (reactorStats.get(sender) || 0) + 1);

        stats.totalReactions += 1; // total unique reactor->message interactions
      });
    });

    // Set total messages to filtered set size
    stats.totalMessages = iterMessages.length;

    // Coverage window (earliest/latest timestamps in the filtered set)
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = 0;
    iterMessages.forEach(([_, md]) => {
      const t = md.timestamp || 0;
      if (t && t < minTs) minTs = t;
      if (t && t > maxTs) maxTs = t;
    });
    if (!isFinite(minTs)) minTs = 0;
    stats.dataQuality.coverageStartTs = minTs;
    stats.dataQuality.coverageEndTs = maxTs;

    // Message shares per sender (baseline)
    iterMessages.forEach(([_, messageData]) => {
      const s = messageData.sender;
      stats.messageCount.set(s, (stats.messageCount.get(s) || 0) + 1);
    });
    stats.messageCount.forEach((cnt, s) => {
      stats.messageShare.set(s, (cnt || 0) / (stats.totalMessages || 1));
    });

    // Calculate reaction rates (reactions per message)
    stats.bySender.forEach((reactors, sender) => {
      const totalReactionsReceived = Array.from(reactors.values()).reduce((sum, count) => sum + count, 0);
      const messagesCount = stats.messageCount.get(sender) || 1;
      stats.reactionRates.set(sender, totalReactionsReceived / messagesCount);
    });

    // Calculate relationships and likelihood
    stats.bySender.forEach((reactors, sender) => {
      const senderMessages = stats.messageCount.get(sender) || 1;
      
      reactors.forEach((reactions, reactor) => {
        // Calculate likelihood: reactions / sender's total messages
        const likelihood = reactions / senderMessages;
        
        // Get reactor's total activity
        const reactorTotalReactions = stats.byReactor.get(reactor) 
          ? Array.from(stats.byReactor.get(reactor).values()).reduce((sum, count) => sum + count, 0)
          : 0;
        
        // Calculate relative strength: how much this reactor focuses on this sender
        const focus = reactorTotalReactions > 0 ? reactions / reactorTotalReactions : 0;
        
        // Combined strength score
        const strength = (likelihood + focus) / 2;
        
        stats.relationships.push({
          from: reactor, // Who is reacting
          to: sender,    // Who is being reacted to
          reactions: reactions,
          likelihood: likelihood, // Probability of reaction per message
          focus: focus, // What % of reactor's reactions go to this person
          strength: strength,
          messagesReactedTo: reactions,
          totalMessagesBy: senderMessages
        });
      });
    });

    // Sort relationships by strength
    stats.relationships.sort((a, b) => b.strength - a.strength);

    // Get top 10 strongest pairs
    stats.topPairs = stats.relationships.slice(0, 10);

    // Calculate top reactions for each sender
    stats.bySender.forEach((reactors, sender) => {
      const sortedReactors = Array.from(reactors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 reactors per sender
      
      stats.topReactions.set(sender, new Map(sortedReactors));
    });

    console.log('Background: Calculated relationships:', stats.relationships.length);
    console.log('Background: Top pairs:', stats.topPairs);

    // Compute selectivity/bias metrics
    // - Focus: share of a reactor's reactions going to a specific target
    // - Lift: focus divided by target's share of messages (baseline)
    // - Selectivity score: focus * lift (penalizes low-focus or low-lift pairs)
    const selectivity = [];
    const biasedReactors = [];

    // Pre-compute per-reactor totals
    const reactorTotals = new Map();
    stats.byReactor.forEach((senders, reactor) => {
      const tot = Array.from(senders.values()).reduce((s, n) => s + n, 0);
      reactorTotals.set(reactor, tot);
    });

    // Pairs with scores
    stats.byReactor.forEach((senders, reactor) => {
      const rTot = reactorTotals.get(reactor) || 0;
      if (!rTot) return;
      const pairScores = [];
      let hhi = 0;
      senders.forEach((count, target) => {
        const focus = count / rTot;
        hhi += focus * focus;
        const targetMsgShare = stats.messageShare.get(target) || 0.00001;
        const lift = focus / targetMsgShare;
        const sel = focus * lift;
        const entry = { reactor, target, reactions: count, focus, lift, selectivity: sel, targetMessageShare: targetMsgShare };
        pairScores.push(entry);
        // Include all pairs; UI can sort and you can eyeball noise
        selectivity.push(entry);
      });
      // Reactor-level bias index: concentration (HHI) reported as 0-1
      pairScores.sort((a,b) => b.selectivity - a.selectivity);
      biasedReactors.push({
        reactor,
        biasIndex: hhi, // 0..1, higher = more concentrated
        totalReactions: rTot,
        topTargets: pairScores.slice(0, 5)
      });
    });

    selectivity.sort((a,b) => b.selectivity - a.selectivity);

    // --- Reply-based bias metrics (responds bias) ---
    const respondsByReplier = new Map(); // replier -> Map(target -> count)
    const respondsByTarget = new Map();  // target -> Map(replier -> count)
    iterMessages.forEach(([_, md]) => {
      if (!md.replyTo) return;
      const replier = md.sender;
      const target = md.replyTo;
      if (!respondsByReplier.has(replier)) respondsByReplier.set(replier, new Map());
      if (!respondsByTarget.has(target)) respondsByTarget.set(target, new Map());
      respondsByReplier.get(replier).set(target, (respondsByReplier.get(replier).get(target) || 0) + 1);
      respondsByTarget.get(target).set(replier, (respondsByTarget.get(target).get(replier) || 0) + 1);
    });

    // Reactor-like totals but for repliers
    const replierTotals = new Map();
    respondsByReplier.forEach((targets, replier) => {
      const tot = Array.from(targets.values()).reduce((s, n) => s + n, 0);
      replierTotals.set(replier, tot);
    });

    const respondSelectivity = [];
    const biasedResponders = [];
    respondsByReplier.forEach((targets, replier) => {
      const rTot = replierTotals.get(replier) || 0;
      if (!rTot) return;
      const pairScores = [];
      let hhi = 0;
      targets.forEach((count, target) => {
        const focus = count / rTot;
        hhi += focus * focus;
        const targetMsgShare = stats.messageShare.get(target) || 0.00001;
        const lift = focus / targetMsgShare;
        const sel = focus * lift;
        const entry = { replier, target, replies: count, focus, lift, selectivity: sel, targetMessageShare: targetMsgShare };
        pairScores.push(entry);
        respondSelectivity.push(entry);
      });
      pairScores.sort((a,b) => b.selectivity - a.selectivity);
      biasedResponders.push({
        replier,
        biasIndex: hhi,
        totalReplies: rTot,
        topTargets: pairScores.slice(0, 5)
      });
    });
    respondSelectivity.sort((a,b) => b.selectivity - a.selectivity);

    // --- Simple combined relationships (emoji-agnostic, reactions + replies) ---
    // For each person P, compute:
    //  - mostOutgoing: who P most reacts/replies to (combine byReactor[P] + respondsByReplier[P])
    //  - mostIncoming: who most reacts/replies to P (combine bySender[P] + respondsByTarget[P])
    const people = new Set();
    stats.bySender.forEach((_, sender) => people.add(sender));
    stats.byReactor.forEach((_, reactor) => people.add(reactor));
    respondsByReplier.forEach((_, rep) => people.add(rep));
    respondsByTarget.forEach((_, tgt) => people.add(tgt));
    // Ensure we include participants even if no interactions captured yet
    stats.messageCount.forEach((_, participant) => people.add(participant));

    const simpleRelationships = [];
    people.forEach(person => {
      // Outgoing
      const outMap = new Map();
      const reactOut = stats.byReactor.get(person);
      if (reactOut) {
        reactOut.forEach((cnt, target) => outMap.set(target, (outMap.get(target) || 0) + cnt));
      }
      const replyOut = respondsByReplier.get(person);
      if (replyOut) {
        replyOut.forEach((cnt, target) => outMap.set(target, (outMap.get(target) || 0) + cnt));
      }

      // Incoming
      const inMap = new Map();
      const reactIn = stats.bySender.get(person);
      if (reactIn) {
        reactIn.forEach((cnt, from) => inMap.set(from, (inMap.get(from) || 0) + cnt));
      }
      const replyIn = respondsByTarget.get(person);
      if (replyIn) {
        replyIn.forEach((cnt, from) => inMap.set(from, (inMap.get(from) || 0) + cnt));
      }

      const mostOutgoing = Array.from(outMap.entries()).sort((a,b)=>b[1]-a[1])[0] || null;
      const mostIncoming = Array.from(inMap.entries()).sort((a,b)=>b[1]-a[1])[0] || null;
      const outgoingTotal = Array.from(outMap.values()).reduce((s,n)=>s+n,0);
      const incomingTotal = Array.from(inMap.values()).reduce((s,n)=>s+n,0);

      simpleRelationships.push({
        person,
        mostOutgoing: mostOutgoing ? { target: mostOutgoing[0], count: mostOutgoing[1] } : null,
        mostIncoming: mostIncoming ? { from: mostIncoming[0], count: mostIncoming[1] } : null,
        totals: { outgoing: outgoingTotal, incoming: incomingTotal }
      });
    });
    simpleRelationships.sort((a,b)=> (b.totals.outgoing + b.totals.incoming) - (a.totals.outgoing + a.totals.incoming));

    // Enhanced Analytics Calculations
    
    // 1. Temporal Analysis
    this.calculateTemporalAnalysis(iterMessages, stats);
    
    // 2. Engagement Metrics
    this.calculateEngagementMetrics(iterMessages, stats);
    
    // 3. Content Analysis
    this.calculateContentAnalysis(iterMessages, stats);
    
    // 4. Data Quality Assessment
    this.calculateDataQuality(iterMessages, stats);

    return {
      messageShare: Object.fromEntries(stats.messageShare),
      biasedReactors,
      selectivity,
      // reply bias outputs
      respondsByReplier: Object.fromEntries(
        Array.from(respondsByReplier.entries()).map(([rep, targets]) => [rep, Object.fromEntries(targets)])
      ),
      respondsByTarget: Object.fromEntries(
        Array.from(respondsByTarget.entries()).map(([tgt, reps]) => [tgt, Object.fromEntries(reps)])
      ),
      biasedResponders,
      respondSelectivity,
      simpleRelationships,
      chatId: chatId || null,
      bySender: Object.fromEntries(
        Array.from(stats.bySender.entries()).map(([sender, reactors]) => [
          sender,
          Object.fromEntries(reactors)
        ])
      ),
      byReactor: Object.fromEntries(
        Array.from(stats.byReactor.entries()).map(([reactor, senders]) => [
          reactor,
          Object.fromEntries(senders)
        ])
      ),
      topReactions: Object.fromEntries(
        Array.from(stats.topReactions.entries()).map(([sender, reactors]) => [
          sender,
          Object.fromEntries(reactors)
        ])
      ),
      totalMessages: stats.totalMessages,
      totalReactions: stats.totalReactions,
      messageCount: Object.fromEntries(stats.messageCount),
      reactionRates: Object.fromEntries(stats.reactionRates),
      relationships: stats.relationships,
      topPairs: stats.topPairs,
      // Enhanced analytics
      temporalAnalysis: {
        hourlyActivity: Object.fromEntries(stats.temporalAnalysis.hourlyActivity),
        dailyActivity: Object.fromEntries(stats.temporalAnalysis.dailyActivity),
        weeklyPatterns: Object.fromEntries(stats.temporalAnalysis.weeklyPatterns),
        activityTrends: stats.temporalAnalysis.activityTrends,
        peakHours: stats.temporalAnalysis.peakHours,
        peakDays: stats.temporalAnalysis.peakDays
      },
      engagementMetrics: {
        responseTime: Object.fromEntries(stats.engagementMetrics.responseTime),
        conversationThreads: stats.engagementMetrics.conversationThreads,
        activeParticipants: Array.from(stats.engagementMetrics.activeParticipants),
        lurkers: Array.from(stats.engagementMetrics.lurkers),
        influencers: Object.fromEntries(stats.engagementMetrics.influencers),
        networkDensity: stats.engagementMetrics.networkDensity,
        clusteringCoefficient: stats.engagementMetrics.clusteringCoefficient
      },
      contentAnalysis: {
        emojiUsage: Object.fromEntries(stats.contentAnalysis.emojiUsage),
        reactionTypes: Object.fromEntries(stats.contentAnalysis.reactionTypes),
        messageLengths: Object.fromEntries(stats.contentAnalysis.messageLengths),
        replyChains: stats.contentAnalysis.replyChains,
        topicClusters: stats.contentAnalysis.topicClusters
      },
      dataQuality: stats.dataQuality
    };
  }

  // Enhanced Analytics Methods
  
  calculateTemporalAnalysis(iterMessages, stats) {
    const hourlyActivity = new Map();
    const dailyActivity = new Map();
    const weeklyPatterns = new Map();
    const activityTrends = [];
    
    // Initialize hourly activity (0-23)
    for (let i = 0; i < 24; i++) {
      hourlyActivity.set(i, { messages: 0, reactions: 0 });
    }
    
    // Initialize weekly patterns (0-6, Sunday-Saturday)
    for (let i = 0; i < 7; i++) {
      weeklyPatterns.set(i, { messages: 0, reactions: 0 });
    }
    
    iterMessages.forEach(([messageId, messageData]) => {
      const timestamp = messageData.timestamp;
      const date = new Date(timestamp);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const dateKey = date.toISOString().split('T')[0];
      
      // Hourly activity
      const hourlyData = hourlyActivity.get(hour);
      hourlyData.messages++;
      
      // Count reactions for this message
      let messageReactions = 0;
      if (messageData.reactions) {
        messageData.reactions.forEach(reactors => {
          if (reactors && typeof reactors.forEach === 'function') {
            reactors.forEach(count => messageReactions += count);
          } else if (reactors && typeof reactors === 'object') {
            Object.values(reactors).forEach(count => messageReactions += count);
          }
        });
      }
      hourlyData.reactions += messageReactions;
      
      // Daily activity
      if (!dailyActivity.has(dateKey)) {
        dailyActivity.set(dateKey, { messages: 0, reactions: 0, participants: new Set() });
      }
      const dailyData = dailyActivity.get(dateKey);
      dailyData.messages++;
      dailyData.reactions += messageReactions;
      dailyData.participants.add(messageData.sender);
      
      // Weekly patterns
      const weeklyData = weeklyPatterns.get(dayOfWeek);
      weeklyData.messages++;
      weeklyData.reactions += messageReactions;
    });
    
    // Calculate activity trends (daily aggregation)
    const sortedDates = Array.from(dailyActivity.keys()).sort();
    sortedDates.forEach(dateKey => {
      const dailyData = dailyActivity.get(dateKey);
      activityTrends.push({
        date: dateKey,
        messages: dailyData.messages,
        reactions: dailyData.reactions,
        participants: dailyData.participants.size
      });
    });
    
    // Find peak hours and days
    const peakHours = Array.from(hourlyActivity.entries())
      .sort((a, b) => b[1].messages - a[1].messages)
      .slice(0, 3)
      .map(([hour, data]) => ({ hour, messages: data.messages, reactions: data.reactions }));
    
    const peakDays = Array.from(weeklyPatterns.entries())
      .sort((a, b) => b[1].messages - a[1].messages)
      .slice(0, 3)
      .map(([day, data]) => ({ 
        day, 
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day],
        messages: data.messages, 
        reactions: data.reactions 
      }));
    
    stats.temporalAnalysis.hourlyActivity = hourlyActivity;
    stats.temporalAnalysis.dailyActivity = dailyActivity;
    stats.temporalAnalysis.weeklyPatterns = weeklyPatterns;
    stats.temporalAnalysis.activityTrends = activityTrends;
    stats.temporalAnalysis.peakHours = peakHours;
    stats.temporalAnalysis.peakDays = peakDays;
  }
  
  calculateEngagementMetrics(iterMessages, stats) {
    const responseTime = new Map();
    const conversationThreads = [];
    const activeParticipants = new Set();
    const lurkers = new Set();
    const influencers = new Map();
    
    // Track all participants
    const allParticipants = new Set();
    iterMessages.forEach(([messageId, messageData]) => {
      allParticipants.add(messageData.sender);
    });
    
    // Calculate response times and conversation threads
    const messageTimestamps = new Map();
    iterMessages.forEach(([messageId, messageData]) => {
      messageTimestamps.set(messageId, messageData.timestamp);
    });
    
    // Identify active participants (those who send messages frequently)
    const messageCounts = new Map();
    iterMessages.forEach(([messageId, messageData]) => {
      const count = messageCounts.get(messageData.sender) || 0;
      messageCounts.set(messageData.sender, count + 1);
    });
    
    // Filter out "Unknown" senders for better analytics
    const validParticipants = Array.from(allParticipants).filter(p => p !== 'Unknown');
    
    if (validParticipants.length > 0) {
      const avgMessagesPerPerson = iterMessages.length / validParticipants.length;
      const activeThreshold = Math.max(avgMessagesPerPerson * 0.3, 1); // At least 1 message, or 30% of average
      
      validParticipants.forEach(participant => {
        const messageCount = messageCounts.get(participant) || 0;
        if (messageCount >= activeThreshold) {
          activeParticipants.add(participant);
        } else {
          lurkers.add(participant);
        }
      });
    }
    
    // Calculate influence details per participant (total reactions, per-message rate)
    const influencerDetails = [];
    validParticipants.forEach(participant => {
      let totalReactionsReceived = 0;
      const totalMessages = messageCounts.get(participant) || 0;

      iterMessages.forEach(([_, messageData]) => {
        if (messageData.sender === participant && messageData.reactions) {
          messageData.reactions.forEach(reactors => {
            if (reactors && typeof reactors.forEach === 'function') {
              reactors.forEach(count => { totalReactionsReceived += count; });
            } else if (reactors && typeof reactors === 'object') {
              Object.values(reactors).forEach(count => { totalReactionsReceived += count; });
            }
          });
        }
      });

      const perMessage = totalMessages > 0 ? (totalReactionsReceived / totalMessages) : 0;
      influencerDetails.push({
        participant,
        totalReactions: totalReactionsReceived,
        totalMessages,
        perMessage
      });
    });

    // Normalize into a 0..100 influence score combining rate and volume
    const maxPerMsg = Math.max(0.00001, ...influencerDetails.map(d => d.perMessage));
    const maxTotal = Math.max(1, ...influencerDetails.map(d => d.totalReactions));
    influencerDetails.forEach(d => {
      const perMsgNorm = d.perMessage / maxPerMsg; // 0..1
      const totalNorm = d.totalReactions / maxTotal; // 0..1
      const score = Math.round(100 * (0.6 * perMsgNorm + 0.4 * totalNorm));
      influencers.set(d.participant, {
        score,
        totalReactions: d.totalReactions,
        perMessage: d.perMessage,
        totalMessages: d.totalMessages
      });
    });
    
    // Calculate network density (proportion of possible connections that exist)
    const totalPossibleConnections = allParticipants.size * (allParticipants.size - 1);
    let actualConnections = 0;
    
    allParticipants.forEach(personA => {
      allParticipants.forEach(personB => {
        if (personA !== personB) {
          // Check if there's any interaction between A and B
          let hasInteraction = false;
          iterMessages.forEach(([messageId, messageData]) => {
            if (messageData.sender === personA && messageData.reactions) {
              messageData.reactions.forEach(reactors => {
                if (reactors && typeof reactors.has === 'function') {
                  if (reactors.has(personB)) hasInteraction = true;
                } else if (reactors && typeof reactors === 'object') {
                  if (reactors[personB]) hasInteraction = true;
                }
              });
            }
          });
          if (hasInteraction) actualConnections++;
        }
      });
    });
    
    const networkDensity = totalPossibleConnections > 0 ? actualConnections / totalPossibleConnections : 0;
    
    stats.engagementMetrics.responseTime = responseTime;
    stats.engagementMetrics.conversationThreads = conversationThreads;
    stats.engagementMetrics.activeParticipants = activeParticipants;
    stats.engagementMetrics.lurkers = lurkers;
    stats.engagementMetrics.influencers = influencers;
    stats.engagementMetrics.networkDensity = networkDensity;
    stats.engagementMetrics.clusteringCoefficient = 0; // Simplified for now
  }
  
  calculateContentAnalysis(iterMessages, stats) {
    const emojiUsage = new Map();
    const reactionTypes = new Map();
    const messageLengths = new Map();
    const replyChains = [];
    
    // Track message lengths per sender
    const messageLengthCounts = new Map();
    const messageLengthTotals = new Map();
    
    iterMessages.forEach(([messageId, messageData]) => {
      const sender = messageData.sender;
      
      // Count message lengths using per-message length (if available)
      const length = typeof messageData.messageLength === 'number' ? messageData.messageLength : 0;
      const count = messageLengthCounts.get(sender) || 0;
      const total = messageLengthTotals.get(sender) || 0;
      messageLengthCounts.set(sender, count + 1);
      messageLengthTotals.set(sender, total + length);
      
      // Analyze reactions
      if (messageData.reactions) {
        messageData.reactions.forEach((reactors, emoji) => {
          // Count emoji usage
          const emojiCount = emojiUsage.get(emoji) || 0;
          emojiUsage.set(emoji, emojiCount + 1);
          
          // Count reaction types
          const reactionType = this.categorizeReaction(emoji);
          const typeCount = reactionTypes.get(reactionType) || 0;
          reactionTypes.set(reactionType, typeCount + 1);
        });
      }
    });
    
    // Calculate average message lengths
    messageLengthCounts.forEach((count, sender) => {
      const total = messageLengthTotals.get(sender) || 0;
      const avgLength = count > 0 ? (total / count) : 0;
      messageLengths.set(sender, avgLength);
    });
    
    stats.contentAnalysis.emojiUsage = emojiUsage;
    stats.contentAnalysis.reactionTypes = reactionTypes;
    stats.contentAnalysis.messageLengths = messageLengths;
    stats.contentAnalysis.replyChains = replyChains;
    stats.contentAnalysis.topicClusters = []; // Simplified for now
  }
  
  calculateDataQuality(iterMessages, stats) {
    const totalMessages = iterMessages.length;
    let messagesWithReactions = 0;
    let totalReactions = 0;
    
    iterMessages.forEach(([messageId, messageData]) => {
      if (messageData.reactions && messageData.reactions.size > 0) {
        messagesWithReactions++;
        messageData.reactions.forEach(reactors => {
          if (reactors && typeof reactors.forEach === 'function') {
            reactors.forEach(count => totalReactions += count);
          } else if (reactors && typeof reactors === 'object') {
            Object.values(reactors).forEach(count => totalReactions += count);
          }
        });
      }
    });
    
    const extractionRate = totalMessages > 0 ? (messagesWithReactions / totalMessages) * 100 : 0;
    const completenessScore = Math.min(extractionRate * 1.2, 100); // Boost score slightly
    const confidenceLevel = Math.min(completenessScore * 0.9, 95); // Slightly lower than completeness
    
    stats.dataQuality.extractionRate = extractionRate;
    stats.dataQuality.completenessScore = completenessScore;
    stats.dataQuality.confidenceLevel = confidenceLevel;
    stats.dataQuality.lastUpdated = Date.now();
    stats.dataQuality.sampleSize = totalMessages;
  }
  
  categorizeReaction(emoji) {
    // Categorize emojis into reaction types
    const positiveEmojis = ['👍', '❤️', '😂', '😊', '🎉', '👏', '🔥', '💯', '😍', '🥰'];
    const negativeEmojis = ['👎', '😢', '😡', '😠', '😞', '😔'];
    const neutralEmojis = ['😮', '🤔', '😐', '😑', '🙄'];
    
    if (positiveEmojis.includes(emoji)) return 'positive';
    if (negativeEmojis.includes(emoji)) return 'negative';
    if (neutralEmojis.includes(emoji)) return 'neutral';
    return 'other';
  }

  async saveToStorage() {
    try {
      const dataToStore = {};
      this.reactionData.forEach((value, key) => {
        dataToStore[key] = {
          sender: value.sender,
          reactions: Object.fromEntries(
            Array.from(value.reactions.entries()).map(([emoji, reactors]) => [
              emoji,
              Object.fromEntries(reactors)
            ])
          ),
          timestamp: value.timestamp,
          chatId: value.chatId || 'unknown',
          chatName: value.chatName || 'Unknown Chat',
          messageLength: typeof value.messageLength === 'number' ? value.messageLength : 0
        };
      });

      await chrome.storage.local.set({ reactionData: dataToStore });
    } catch (error) {
      console.error('Error saving reaction data:', error);
    }
  }

  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(['reactionData']);
      if (result.reactionData) {
        Object.entries(result.reactionData).forEach(([messageId, messageData]) => {
          this.reactionData.set(messageId, {
            sender: messageData.sender,
            reactions: new Map(
              Object.entries(messageData.reactions).map(([emoji, reactors]) => [
                emoji,
                new Map(Object.entries(reactors))
              ])
            ),
            timestamp: messageData.timestamp,
            chatId: messageData.chatId || 'unknown',
            chatName: messageData.chatName || 'Unknown Chat',
            messageLength: typeof messageData.messageLength === 'number' ? messageData.messageLength : 0
          });
        });
      }
    } catch (error) {
      console.error('Error loading reaction data:', error);
    }
  }

  clearData() {
    this.reactionData.clear();
    chrome.storage.local.remove(['reactionData']);
  }

  dumpCorpus() {
    const out = {};
    this.reactionData.forEach((msg, id) => {
      out[id] = {
        sender: msg.sender,
        reactions: Object.fromEntries(
          Array.from(msg.reactions.entries()).map(([emoji, reactors]) => [emoji, Object.fromEntries(reactors)])
        ),
        timestamp: msg.timestamp,
        chatId: msg.chatId || 'unknown',
        chatName: msg.chatName || 'Unknown Chat',
        messageLength: typeof msg.messageLength === 'number' ? msg.messageLength : 0,
        replyTo: msg.replyTo || null
      };
    });
    return out;
  }

  importCorpus(corpus) {
    try {
      Object.entries(corpus).forEach(([id, md]) => {
        if (!this.reactionData.has(id)) {
          this.reactionData.set(id, {
            sender: md.sender,
            reactions: new Map(),
            timestamp: md.timestamp,
            chatId: md.chatId || 'unknown',
            chatName: md.chatName || 'Unknown Chat',
            replyTo: md.replyTo || null,
            messageLength: typeof md.messageLength === 'number' ? md.messageLength : 0
          });
        }
        const existing = this.reactionData.get(id);
        existing.sender = md.sender || existing.sender;
        existing.timestamp = md.timestamp || existing.timestamp;
        existing.chatId = md.chatId || existing.chatId;
        existing.chatName = md.chatName || existing.chatName;
        existing.replyTo = md.replyTo || existing.replyTo || null;
        if (typeof md.messageLength === 'number') existing.messageLength = md.messageLength;
        const reactions = md.reactions || {};
        Object.entries(reactions).forEach(([emoji, reactors]) => {
          if (!existing.reactions.has(emoji)) existing.reactions.set(emoji, new Map());
          const map = existing.reactions.get(emoji);
          Object.entries(reactors || {}).forEach(([reactor, count]) => {
            map.set(reactor, count);
          });
        });
      });
      this.saveToStorage();
    } catch (e) {
      console.error('Error importing corpus:', e);
      throw e;
    }
  }

  getStoredChats() {
    const map = new Map();
    this.reactionData.forEach((msg) => {
      if (msg.chatId) {
        map.set(msg.chatId, msg.chatName || msg.chatId);
      }
    });
    return Array.from(map.entries()).map(([id, name], index) => ({ id, name, type: 'stored' }));
  }

  // Serialize stats object to convert Maps to plain objects for message passing
  serializeStats(stats) {
    if (!stats) return null;

    const serialized = JSON.parse(JSON.stringify(stats, (key, value) => {
      if (value instanceof Map) {
        return Object.fromEntries(value);
      } else if (value instanceof Set) {
        return Array.from(value);
      }
      return value;
    }));

    return serialized;
  }
}

// Initialize the processor
const processor = new ReactionDataProcessor();

// Load existing data on startup
processor.loadFromStorage();
