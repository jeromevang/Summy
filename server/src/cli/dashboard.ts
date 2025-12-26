/**
 * Summy CLI Dashboard
 * Real-time ASCII dashboard for monitoring the dual-model proxy
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// blessed and blessed-contrib are CommonJS modules
const blessed = require('blessed');
const contrib = require('blessed-contrib');
import axios from 'axios';

// Create axios instance with dashboard header (to suppress logging on server)
const api = axios.create({
  headers: { 'X-Dashboard-Request': 'true' }
});

// ============================================================
// TYPES
// ============================================================

interface ServiceStatus {
  name: string;
  port: number;
  status: 'online' | 'offline' | 'error';
  latency?: number;
}

interface RequestLog {
  timestamp: string;
  action: string;
  tool?: string;
  query: string;
  status: 'success' | 'error' | 'blocked';
  latencyMs: number;
  error?: string;
}

interface DashboardStats {
  totalRequests: number;
  toolCalls: number;
  avgLatency: number;
  errors: number;
  lastRequest?: RequestLog;
}

interface ModelInfo {
  id: string;
  loaded: boolean;
  score?: number;
  error?: string;
}

// ============================================================
// DASHBOARD
// ============================================================

class SummyDashboard {
  private screen!: any; // blessed.Widgets.Screen
  private grid!: any;
  
  // Widgets (using any since blessed is loaded via require)
  private titleBox!: any;
  private servicesTable!: any;
  private cpuGauge!: any;
  private gpuGauge!: any;
  private vramGauge!: any;
  private modelsBox!: any;
  private statsBox!: any;
  private lastRequestBox!: any;
  private activityLog!: any;
  private errorBox!: any;
  private helpBox!: any;

  // State
  private stats: DashboardStats = {
    totalRequests: 0,
    toolCalls: 0,
    avgLatency: 0,
    errors: 0
  };
  private services: ServiceStatus[] = [];
  private logs: RequestLog[] = [];
  private mainModel: ModelInfo = { id: 'Not configured', loaded: false };
  private executorModel: ModelInfo = { id: 'Not configured', loaded: false };
  private systemMetrics = { cpu: 0, gpu: 0, vram: 0, vramTotal: 8 };
  private criticalError: string | null = null;
  private metricsWarningShown = false;

  constructor() {
    this.initScreen();
    this.initWidgets();
    this.bindKeys();
    this.startPolling();
  }

  private initScreen(): void {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Summy Dashboard',
      cursor: { artificial: true, shape: 'line', blink: true, color: 'white' }
    });

    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });
  }

  private initWidgets(): void {
    // Title bar (row 0, full width)
    this.titleBox = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}✨ SUMMY - Dual Model Router{/bold}                                              v1.0.0{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        bold: true
      }
    });
    this.screen.append(this.titleBox);

    // Services table (left side)
    this.servicesTable = this.grid.set(1, 0, 3, 4, contrib.table, {
      keys: true,
      fg: 'white',
      label: ' Services ',
      columnSpacing: 2,
      columnWidth: [14, 6, 8]
    });

    // System gauges (right side of services)
    this.cpuGauge = this.grid.set(1, 4, 1, 4, contrib.gauge, {
      label: ' CPU ',
      stroke: 'cyan',
      fill: 'white'
    });

    this.gpuGauge = this.grid.set(2, 4, 1, 4, contrib.gauge, {
      label: ' GPU ',
      stroke: 'magenta',
      fill: 'white'
    });

    this.vramGauge = this.grid.set(3, 4, 1, 4, contrib.gauge, {
      label: ' VRAM ',
      stroke: 'yellow',
      fill: 'white'
    });

    // Dual-Model Routing box
    this.modelsBox = this.grid.set(1, 8, 3, 4, blessed.box, {
      label: ' Dual-Model Routing ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } }
    });

    // Live Stats
    this.statsBox = this.grid.set(4, 0, 3, 4, blessed.box, {
      label: ' Live Stats ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'green' } }
    });

    // Last Request
    this.lastRequestBox = this.grid.set(4, 4, 3, 4, blessed.box, {
      label: ' Last Request ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } }
    });

    // Error box (hidden by default)
    this.errorBox = this.grid.set(4, 8, 3, 4, blessed.box, {
      label: ' Errors ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'red' } },
      hidden: false
    });

    // Activity Log
    this.activityLog = this.grid.set(7, 0, 4, 12, contrib.log, {
      fg: 'green',
      label: ' Recent Activity ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'white' } }
    });

    // Help bar
    this.helpBox = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' {bold}[Q]{/bold} Quit  {bold}[R]{/bold} Refresh  {bold}[T]{/bold} Run Tests  {bold}[C]{/bold} Clear Stats  {bold}[E]{/bold} Toggle Errors ',
      tags: true,
      style: { fg: 'white', bg: 'blue' }
    });
    this.screen.append(this.helpBox);
  }

  private bindKeys(): void {
    this.screen.key(['escape', 'q', 'C-c'], () => {
      return process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.refresh();
    });

    this.screen.key(['t'], () => {
      this.runTests();
    });

    this.screen.key(['c'], () => {
      this.clearStats();
    });

    this.screen.key(['e'], () => {
      this.errorBox.toggle();
      this.screen.render();
    });
  }

  private async checkService(name: string, port: number): Promise<ServiceStatus> {
    try {
      const start = Date.now();
      await api.get(`http://localhost:${port}/health`, { timeout: 2000 });
      return { name, port, status: 'online', latency: Date.now() - start };
    } catch (err1: any) {
      try {
        // Try root path for servers without /health endpoint
        const start = Date.now();
        await api.get(`http://localhost:${port}/`, { timeout: 2000 });
        return { name, port, status: 'online', latency: Date.now() - start };
      } catch (err2: any) {
        // Service is offline - this is expected, not an error
        return { name, port, status: 'offline' };
      }
    }
  }

  private async fetchStats(): Promise<void> {
    try {
      // Fetch settings for model info
      const settingsRes = await api.get('http://localhost:3001/api/settings', { timeout: 2000 });
      const settings = settingsRes.data;
      
      this.mainModel = {
        id: settings.mainModelId || 'Not configured',
        loaded: true,
        score: 100
      };
      this.executorModel = {
        id: settings.executorModelId || 'Not configured',
        loaded: true,
        score: 100
      };
      this.criticalError = null; // Clear error if we got settings

      // Fetch system metrics
      try {
        const metricsRes = await api.get('http://localhost:3001/api/tooly/metrics', { timeout: 2000 });
        if (metricsRes.data) {
          this.systemMetrics = {
            cpu: metricsRes.data.cpu || 0,
            gpu: metricsRes.data.gpu || 0,
            vram: metricsRes.data.vram || 0,
            vramTotal: metricsRes.data.vramTotal || 8
          };
        }
      } catch (err: any) {
        // Metrics endpoint may not exist - log only on first failure
        if (!this.metricsWarningShown) {
          console.log('[Dashboard] Metrics endpoint not available:', err?.message);
          this.metricsWarningShown = true;
        }
      }

    } catch (err: any) {
      this.criticalError = `API Server: ${err.message}`;
    }
  }

  private async refresh(): Promise<void> {
    // Check services
    this.services = await Promise.all([
      this.checkService('API Server', 3001),
      this.checkService('RAG Server', 3002),
      this.checkService('WebSocket', 3003),
      this.checkService('MCP Server', 3006)
    ]);

    // Fetch stats
    await this.fetchStats();

    // Update UI
    this.updateUI();
  }

  private updateUI(): void {
    // Update title with critical error if any
    if (this.criticalError) {
      this.titleBox.setContent(`{center}{bold}{red-fg}⚠ ERROR: ${this.criticalError}{/red-fg}{/bold}{/center}`);
      this.titleBox.style.bg = 'red';
    } else {
      this.titleBox.setContent('{center}{bold}✨ SUMMY - Dual Model Router{/bold}                                              v1.0.0{/center}');
      this.titleBox.style.bg = 'blue';
    }

    // Update services table
    const serviceRows = this.services.map(s => {
      const icon = s.status === 'online' ? '{green-fg}●{/green-fg}' : '{red-fg}✖{/red-fg}';
      const statusText = s.status === 'online' ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
      return [`${icon} ${s.name}`, `:${s.port}`, statusText];
    });
    this.servicesTable.setData({
      headers: ['Service', 'Port', 'Status'],
      data: serviceRows
    });

    // Update gauges (with safety checks)
    const cpu = this.systemMetrics?.cpu ?? 0;
    const gpu = this.systemMetrics?.gpu ?? 0;
    const vram = this.systemMetrics?.vram ?? 0;
    const vramTotal = this.systemMetrics?.vramTotal ?? 8;
    
    this.cpuGauge.setPercent(cpu);
    this.gpuGauge.setPercent(gpu);
    const vramPercent = vramTotal > 0 ? Math.round((vram / vramTotal) * 100) : 0;
    this.vramGauge.setPercent(vramPercent);
    this.vramGauge.setLabel(` VRAM ${vram.toFixed(1)}/${vramTotal}GB `);

    // Update models box
    const mainStatus = this.mainModel.loaded ? '{green-fg}[LOADED]{/green-fg}' : '{red-fg}[FAILED]{/red-fg}';
    const execStatus = this.executorModel.loaded ? '{green-fg}[LOADED]{/green-fg}' : '{red-fg}[FAILED]{/red-fg}';
    this.modelsBox.setContent(
      `\n {bold}🧠 Main:{/bold}\n  ${this.mainModel.id.slice(0, 25)}\n  ${mainStatus} Score: ${this.mainModel.score || '-'}%\n\n` +
      ` {bold}⚡ Executor:{/bold}\n  ${this.executorModel.id.slice(0, 25)}\n  ${execStatus} Score: ${this.executorModel.score || '-'}%`
    );

    // Update stats box
    this.statsBox.setContent(
      `\n  {bold}Requests:{/bold}     ${this.stats.totalRequests.toLocaleString()}\n` +
      `  {bold}Tool Calls:{/bold}   ${this.stats.toolCalls.toLocaleString()}\n` +
      `  {bold}Avg Latency:{/bold}  ${this.stats.avgLatency}ms\n` +
      `  {bold}Errors:{/bold}       ${this.stats.errors > 0 ? `{red-fg}${this.stats.errors}{/red-fg}` : '0'}`
    );

    // Update last request box
    if (this.stats.lastRequest) {
      const lr = this.stats.lastRequest;
      const statusIcon = lr.status === 'success' ? '{green-fg}✓{/green-fg}' : 
                         lr.status === 'blocked' ? '{yellow-fg}⚠{/yellow-fg}' : '{red-fg}✖{/red-fg}';
      this.lastRequestBox.setContent(
        `\n  {bold}Intent:{/bold}  ${lr.action} → ${lr.tool || 'text'}\n` +
        `  {bold}Latency:{/bold} ${lr.latencyMs}ms\n` +
        `  {bold}Status:{/bold}  ${statusIcon} ${lr.status}\n` +
        `  {bold}Time:{/bold}    ${lr.timestamp}`
      );
    } else {
      this.lastRequestBox.setContent('\n  {gray-fg}No requests yet{/gray-fg}');
    }

    // Update error box
    const recentErrors = this.logs.filter(l => l.status === 'error').slice(-5);
    if (recentErrors.length > 0) {
      const errorLines = recentErrors.map(e => 
        `{red-fg}${e.timestamp}{/red-fg}\n  ${e.error || 'Unknown error'}`
      ).join('\n\n');
      this.errorBox.setContent(`\n${errorLines}`);
      this.errorBox.style.border = { fg: 'red' };
    } else {
      this.errorBox.setContent('\n  {green-fg}No errors{/green-fg}');
      this.errorBox.style.border = { fg: 'green' };
    }

    this.screen.render();
  }

  private addLog(log: RequestLog): void {
    this.logs.unshift(log);
    if (this.logs.length > 100) this.logs.pop();

    // Update stats
    this.stats.totalRequests++;
    if (log.tool) this.stats.toolCalls++;
    if (log.status === 'error') this.stats.errors++;
    this.stats.avgLatency = Math.round(
      this.logs.reduce((sum, l) => sum + l.latencyMs, 0) / this.logs.length
    );
    this.stats.lastRequest = log;

    // Add to activity log widget
    const statusIcon = log.status === 'success' ? '{green-fg}✓{/green-fg}' : 
                       log.status === 'blocked' ? '{yellow-fg}⚠{/yellow-fg}' : '{red-fg}✖{/red-fg}';
    const action = log.tool ? `[${log.tool}]` : `[${log.action}]`;
    const latencyColor = log.latencyMs > 1000 ? 'red' : log.latencyMs > 500 ? 'yellow' : 'green';
    
    this.activityLog.log(
      `${log.timestamp}  ${action.padEnd(15)} "${log.query.slice(0, 35).padEnd(35)}" ${statusIcon} {${latencyColor}-fg}${log.latencyMs}ms{/${latencyColor}-fg}`
    );
  }

  private async runTests(): Promise<void> {
    this.activityLog.log('{yellow-fg}Running combo tests...{/yellow-fg}');
    try {
      await axios.post('http://localhost:3001/api/tooly/combo-test/quick', {
        mainModelId: this.mainModel.id,
        executorModelId: this.executorModel.id
      }, { timeout: 60000 });
      this.activityLog.log('{green-fg}Tests completed!{/green-fg}');
    } catch (err: any) {
      this.activityLog.log(`{red-fg}Test failed: ${err.message}{/red-fg}`);
    }
    this.screen.render();
  }

  private clearStats(): void {
    this.stats = { totalRequests: 0, toolCalls: 0, avgLatency: 0, errors: 0 };
    this.logs = [];
    this.activityLog.log('{cyan-fg}Stats cleared{/cyan-fg}');
    this.updateUI();
  }

  private startPolling(): void {
    // Initial refresh
    this.refresh();

    // Poll every 10 seconds (WebSocket is primary, polling is fallback)
    setInterval(() => this.refresh(), 10000);

    // Connect to WebSocket for real-time updates
    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://localhost:3001');

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'request_log') {
            this.addLog(msg.data);
            this.updateUI();
          } else if (msg.type === 'system_metrics') {
            this.systemMetrics = msg.data;
            this.updateUI();
          } else if (msg.type === 'error') {
            this.activityLog.log(`{red-fg}ERROR: ${msg.message}{/red-fg}`);
            this.screen.render();
          }
        } catch (err: any) {
          // Log parse errors for debugging
          console.error('[Dashboard] Failed to parse WS message:', err?.message);
        }
      });

      ws.on('close', () => {
        this.activityLog.log('{yellow-fg}WebSocket disconnected, reconnecting...{/yellow-fg}');
        setTimeout(() => this.connectWebSocket(), 5000);
      });

      ws.on('error', (err: Error) => {
        console.error('[Dashboard] WebSocket error:', err.message);
        setTimeout(() => this.connectWebSocket(), 5000);
      });

    } catch (err: any) {
      console.error('[Dashboard] Failed to connect WebSocket:', err?.message || err);
      // Will use polling as fallback
    }
  }

  public run(): void {
    this.screen.render();
  }
}

// ============================================================
// MAIN
// ============================================================

const dashboard = new SummyDashboard();
dashboard.run();

