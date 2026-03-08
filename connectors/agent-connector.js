/**
 * Agent Connector
 *
 * Adds conversation memory for agent provider and compresses long context
 * with a rolling summary, to avoid token overflow.
 */

const BaseConnector = require('./base-connector');
const AgentEngine = require('../agents/agent-engine');
const ToolManager = require('../agents/tools/tool-manager');
const { createProvider } = require('../agents/llm-providers');

class AgentConnector extends BaseConnector {
  constructor(options = {}) {
    super(options);

    this.providerType = options.providerType || 'iflow';
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.server = options.server;

    this.maxHistoryMessages = options.maxHistoryMessages || parseInt(process.env.AGENT_MAX_HISTORY_MESSAGES || '24', 10);
    this.maxContextChars = options.maxContextChars || parseInt(process.env.AGENT_MAX_CONTEXT_CHARS || '24000', 10);
    this.summaryTriggerChars = options.summaryTriggerChars || parseInt(process.env.AGENT_SUMMARY_TRIGGER_CHARS || '18000', 10);
    this.minRecentMessages = options.minRecentMessages || parseInt(process.env.AGENT_MIN_RECENT_MESSAGES || '8', 10);

    this.llmProvider = null;
    this.toolManager = null;
    this.agentEngine = null;

    // sessionId -> { startTime, summary, messages: [{ role, content, timestamp }] }
    this.conversationMemory = new Map();
  }

  async _connectInternal(options) {
    try {
      this.llmProvider = createProvider({
        type: this.providerType,
        apiKey: this.apiKey,
        model: this.model
      });

      this.toolManager = new ToolManager(this.workDir);

      if (this.server && this.server.scheduler) {
        const schedulerTools = this.constructor.getSchedulerTools();
        Object.entries(schedulerTools).forEach(([name, toolDef]) => {
          this.toolManager.registerTool({
            ...toolDef,
            handler: async (args) => this.handleSchedulerTool(name, args)
          });
        });
      }

      this.agentEngine = new AgentEngine({
        llmProvider: this.llmProvider,
        toolManager: this.toolManager,
        logger: this.logger || console
      });

      return {
        success: true,
        version: '1.1.0',
        provider: this.providerType,
        model: this.llmProvider.model,
        tools: this.toolManager.getStats().total
      };
    } catch (error) {
      return {
        success: false,
        error: `Agent connect failed: ${error.message}`
      };
    }
  }

  async _startSessionInternal(message, options = {}) {
    const sessionId = this._generateTempId();

    const wrappedOnEvent = options.onEvent
      ? async (event) => {
          try {
            await options.onEvent({ sessionId, ...event });
          } catch (error) {
            console.error('[AgentConnector] wrappedOnEvent error:', error.message);
          }
        }
      : null;

    this._registerSession(sessionId, { startTime: Date.now() });
    this._initMemoryIfMissing(sessionId);
    this._appendMessage(sessionId, 'user', message);

    const prompt = await this._buildContextPrompt(sessionId);

    try {
      const result = await this._executeAgentAsync(prompt, wrappedOnEvent);
      if (result?.success && result.content) {
        this._appendMessage(sessionId, 'assistant', result.content);
      }
      await this._trimHistory(sessionId);
    } catch (error) {
      if (wrappedOnEvent) {
        await wrappedOnEvent({ type: 'error', error: error.message });
      }
    }

    return { sessionId };
  }

  async _continueSessionInternal(sessionId, message, options = {}) {
    const wrappedOnEvent = options.onEvent
      ? async (event) => {
          try {
            await options.onEvent({ sessionId, ...event });
          } catch (error) {
            console.error('[AgentConnector] wrappedOnEvent error:', error.message);
          }
        }
      : null;

    this._registerSession(sessionId, this._getSession(sessionId) || { startTime: Date.now() });
    this._initMemoryIfMissing(sessionId);
    this._appendMessage(sessionId, 'user', message);

    const prompt = await this._buildContextPrompt(sessionId);

    try {
      const result = await this._executeAgentAsync(prompt, wrappedOnEvent);
      if (result?.success && result.content) {
        this._appendMessage(sessionId, 'assistant', result.content);
      }
      await this._trimHistory(sessionId);
    } catch (error) {
      if (wrappedOnEvent) {
        await wrappedOnEvent({ type: 'error', error: error.message });
      }
    }
  }

  _interruptSessionInternal(sessionId) {
    this._unregisterSession(sessionId);
    this.conversationMemory.delete(sessionId);
    return true;
  }

  async _executeAgentAsync(message, onEvent) {
    const result = await this.agentEngine.execute(message, onEvent);

    if (onEvent) {
      await onEvent({
        type: 'done',
        success: result.success,
        content: result.content || result.error,
        iterations: result.iterations,
        duration: result.duration,
        usage: result.usage
      });
    }

    return result;
  }

  _initMemoryIfMissing(sessionId) {
    if (!this.conversationMemory.has(sessionId)) {
      this.conversationMemory.set(sessionId, {
        startTime: Date.now(),
        summary: '',
        messages: []
      });
    }
  }

  _appendMessage(sessionId, role, content) {
    const memory = this.conversationMemory.get(sessionId);
    if (!memory || !content) return;
    memory.messages.push({ role, content, timestamp: Date.now() });
  }

  async _buildContextPrompt(sessionId) {
    const memory = this.conversationMemory.get(sessionId);
    if (!memory || memory.messages.length === 0) return '';

    const totalChars = this._estimateMemoryChars(memory);
    if (totalChars > this.summaryTriggerChars) {
      await this._summarizeOldMessages(sessionId);
    }

    const latest = this.conversationMemory.get(sessionId);
    const blocks = [];

    if (latest.summary) {
      blocks.push(`[Conversation Summary]\n${latest.summary}`);
    }

    for (const item of latest.messages) {
      const speaker = item.role === 'assistant' ? 'Assistant' : 'User';
      blocks.push(`[${speaker}] ${item.content}`);
    }

    blocks.push('Please continue the same conversation and keep consistency with previous context.');

    const prompt = blocks.join('\n\n');
    if (prompt.length <= this.maxContextChars) return prompt;

    await this._summarizeOldMessages(sessionId, true);
    const finalMemory = this.conversationMemory.get(sessionId);
    const secondBlocks = [];

    if (finalMemory.summary) {
      secondBlocks.push(`[Conversation Summary]\n${finalMemory.summary}`);
    }

    for (const item of finalMemory.messages) {
      const speaker = item.role === 'assistant' ? 'Assistant' : 'User';
      secondBlocks.push(`[${speaker}] ${item.content}`);
    }

    secondBlocks.push('Please continue the same conversation and keep consistency with previous context.');
    return secondBlocks.join('\n\n').slice(0, this.maxContextChars);
  }

  _estimateMemoryChars(memory) {
    const messageChars = memory.messages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
    return messageChars + (memory.summary ? memory.summary.length : 0);
  }

  async _summarizeOldMessages(sessionId, force = false) {
    const memory = this.conversationMemory.get(sessionId);
    if (!memory || memory.messages.length <= this.minRecentMessages) return;

    const keepCount = Math.max(this.minRecentMessages, Math.floor(this.maxHistoryMessages / 2));
    const splitIndex = Math.max(0, memory.messages.length - keepCount);

    if (!force && splitIndex <= 0) return;

    const toSummarize = memory.messages.slice(0, splitIndex);
    const toKeep = memory.messages.slice(splitIndex);

    if (toSummarize.length === 0) return;

    const transcript = toSummarize
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n');

    try {
      const summaryResponse = await this.llmProvider.chat(
        [
          {
            role: 'system',
            content: 'You are a summarizer. Preserve key facts, decisions, constraints, file paths, APIs, and pending tasks. Keep it concise and structured.'
          },
          {
            role: 'user',
            content: `Existing summary:\n${memory.summary || '(none)'}\n\nNew transcript:\n${transcript}\n\nReturn updated summary.`
          }
        ],
        {
          temperature: 0.2,
          max_tokens: 600
        }
      );

      const nextSummary = (summaryResponse?.content || '').trim();
      if (nextSummary) {
        memory.summary = nextSummary;
        memory.messages = toKeep;
      }
    } catch (error) {
      // Fallback: keep only recent messages if summarization fails.
      memory.messages = toKeep;
      if (!memory.summary) {
        memory.summary = '[Fallback] Older messages were truncated due to context size.';
      }
    }
  }

  async _trimHistory(sessionId) {
    const memory = this.conversationMemory.get(sessionId);
    if (!memory) return;

    if (memory.messages.length > this.maxHistoryMessages) {
      await this._summarizeOldMessages(sessionId, true);
    }

    const totalChars = this._estimateMemoryChars(memory);
    if (totalChars > this.maxContextChars) {
      await this._summarizeOldMessages(sessionId, true);
      const after = this.conversationMemory.get(sessionId);
      if (this._estimateMemoryChars(after) > this.maxContextChars) {
        after.messages = after.messages.slice(-this.minRecentMessages);
      }
    }
  }

  getStats() {
    if (!this.agentEngine) {
      return {
        connected: this.connected,
        provider: this.providerType
      };
    }

    return {
      connected: this.connected,
      provider: this.providerType,
      model: this.llmProvider.model,
      sessionsWithMemory: this.conversationMemory.size,
      ...this.agentEngine.getStats()
    };
  }
}

module.exports = AgentConnector;
