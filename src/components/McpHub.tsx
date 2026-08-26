import React, { useState, useEffect } from 'react';
import {
  Server,
  Terminal,
  Database,
  Globe,
  FileText,
  Activity,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Play,
  Code,
  Layers,
  Cpu,
  ArrowRight,
  Clock,
  BookOpen
} from 'lucide-react';

interface McpServer {
  id: string;
  name: string;
  type: string;
  urlOrCommand?: string;
  description: string;
  icon?: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  errorMessage?: string;
  toolCount: number;
  lastPing?: string;
}

interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  fullName: string;
  description: string;
  inputSchema: any;
}

interface McpResource {
  serverId: string;
  serverName: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface McpPrompt {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface McpCallLog {
  id: string;
  timestamp: string;
  serverId: string;
  serverName: string;
  toolName: string;
  args: any;
  result: any;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
}

export const McpHub: React.FC = () => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [resources, setResources] = useState<McpResource[]>([]);
  const [prompts, setPrompts] = useState<McpPrompt[]>([]);
  const [logs, setLogs] = useState<McpCallLog[]>([]);
  
  const [activeTab, setActiveTab] = useState<'tools' | 'servers' | 'resources' | 'prompts' | 'logs'>('tools');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [testArgsJson, setTestArgsJson] = useState('{}');
  const [testOutput, setTestOutput] = useState<any>(null);
  const [testExecuting, setTestExecuting] = useState(false);

  // New Server Form state
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServerId, setNewServerId] = useState('');
  const [newServerName, setNewServerName] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [newServerDesc, setNewServerDesc] = useState('');
  const [connectingServer, setConnectingServer] = useState(false);

  // Resource viewer state
  const [viewingResource, setViewingResource] = useState<{ uri: string; content: any } | null>(null);

  const fetchMcpData = async () => {
    setLoading(true);
    try {
      const [serversRes, toolsRes, resRes, promptsRes, logsRes] = await Promise.all([
        fetch('/api/mcp/servers').then(r => r.json()),
        fetch('/api/mcp/tools').then(r => r.json()),
        fetch('/api/mcp/resources').then(r => r.json()),
        fetch('/api/mcp/prompts').then(r => r.json()),
        fetch('/api/mcp/logs').then(r => r.json())
      ]);

      if (serversRes.success) setServers(serversRes.servers || []);
      if (toolsRes.success) setTools(toolsRes.tools || []);
      if (resRes.success) setResources(resRes.resources || []);
      if (promptsRes.success) setPrompts(promptsRes.prompts || []);
      if (logsRes.success) setLogs(logsRes.logs || []);
    } catch (err) {
      console.error('Error loading MCP Hub data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMcpData();
    const interval = setInterval(() => {
      fetch('/api/mcp/logs')
        .then(r => r.json())
        .then(data => {
          if (data.success) setLogs(data.logs || []);
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerId || !newServerName || !newServerUrl) return;

    setConnectingServer(true);
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newServerId.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          name: newServerName,
          url: newServerUrl,
          description: newServerDesc || 'Remote SSE Model Context Protocol Server'
        })
      }).then(r => r.json());

      if (res.success) {
        setShowAddServer(false);
        setNewServerId('');
        setNewServerName('');
        setNewServerUrl('');
        setNewServerDesc('');
        await fetchMcpData();
      } else {
        alert(`Failed to connect server: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error connecting server: ${err?.message || err}`);
    } finally {
      setConnectingServer(false);
    }
  };

  const handleDisconnectServer = async (serverId: string) => {
    if (!confirm(`Are you sure you want to disconnect MCP server '${serverId}'?`)) return;

    try {
      const res = await fetch(`/api/mcp/servers/${serverId}`, { method: 'DELETE' }).then(r => r.json());
      if (res.success) {
        await fetchMcpData();
      } else {
        alert(res.error || 'Failed to disconnect server');
      }
    } catch (err: any) {
      alert(err?.message || err);
    }
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;
    setTestExecuting(true);
    setTestOutput(null);

    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(testArgsJson);
      } catch {
        alert('Invalid JSON in tool arguments input.');
        setTestExecuting(false);
        return;
      }

      const res = await fetch('/api/mcp/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: selectedTool.fullName,
          args: parsedArgs
        })
      }).then(r => r.json());

      setTestOutput(res);
      // Refresh logs
      const logsRes = await fetch('/api/mcp/logs').then(r => r.json());
      if (logsRes.success) setLogs(logsRes.logs || []);
    } catch (err: any) {
      setTestOutput({ success: false, error: err?.message || String(err) });
    } finally {
      setTestExecuting(false);
    }
  };

  const handleReadResource = async (resource: McpResource) => {
    try {
      const res = await fetch('/api/mcp/resources/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: resource.serverId,
          uri: resource.uri
        })
      }).then(r => r.json());

      if (res.success) {
        setViewingResource({ uri: resource.uri, content: res.content });
      } else {
        alert(`Error reading resource: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    }
  };

  const filteredTools = tools.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.serverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getServerIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Database': return <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'Globe': return <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'FileText': return <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />;
      case 'Activity': return <Activity className="w-5 h-5 text-rose-600 dark:text-rose-400" />;
      default: return <Server className="w-5 h-5 text-slate-600 dark:text-slate-400" />;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                Protocol Engine
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Real-time JSON-RPC Active
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Model Context Protocol (MCP) Hub
            </h1>
            <p className="text-slate-300 text-sm max-w-2xl">
              Connects SANA Agent seamlessly to local & remote tools, clinical databases, knowledge servers, and prompt templates over standard client-server interfaces.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchMcpData()}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowAddServer(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/20 transition"
            >
              <Plus className="w-4 h-4" />
              Connect MCP Server
            </button>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Active Servers</div>
            <div className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
              {servers.filter(s => s.status === 'connected').length}
              <span className="text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Online</span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Exposed MCP Tools</div>
            <div className="text-2xl font-bold text-indigo-400 mt-1">{tools.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Resource Feeds</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{resources.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Recorded Tool Trace Calls</div>
            <div className="text-2xl font-bold text-indigo-400 mt-1">{logs.length}</div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('tools')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            activeTab === 'tools'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Code className="w-4 h-4" />
          Tools ({tools.length})
        </button>
        <button
          onClick={() => setActiveTab('servers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            activeTab === 'servers'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          Servers ({servers.length})
        </button>
        <button
          onClick={() => setActiveTab('resources')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            activeTab === 'resources'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          Resources ({resources.length})
        </button>
        <button
          onClick={() => setActiveTab('prompts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            activeTab === 'prompts'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Prompts ({prompts.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Terminal className="w-4 h-4" />
          Trace & Thought Logs ({logs.length})
        </button>
      </div>

      {/* Tab 1: Tools Explorer */}
      {activeTab === 'tools' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Tool List */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search MCP tools by name, server, or function..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {filteredTools.map((t) => (
                <div
                  key={t.fullName}
                  onClick={() => {
                    setSelectedTool(t);
                    setTestArgsJson(JSON.stringify(t.inputSchema?.properties ? Object.keys(t.inputSchema.properties).reduce((acc: any, k) => { acc[k] = ''; return acc; }, {}) : {}, null, 2));
                    setTestOutput(null);
                  }}
                  className={`p-4 rounded-xl border transition cursor-pointer ${
                    selectedTool?.fullName === t.fullName
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-800">
                          {t.fullName}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">{t.serverName}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {t.description}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                  </div>
                </div>
              ))}

              {filteredTools.length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                  No MCP tools matched your search filter.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Tool Inspector & Direct Tester */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            {selectedTool ? (
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    MCP Tool Inspector & Tester
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-1">
                    {selectedTool.fullName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Provided by: <span className="font-medium text-slate-700 dark:text-slate-300">{selectedTool.serverName}</span>
                  </p>
                </div>

                {/* Schema properties preview */}
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300">Tool Description</div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-700 dark:text-slate-300">
                    {selectedTool.description}
                  </div>
                </div>

                {/* Input Arguments JSON Editor */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                    <span>Input Parameters (JSON)</span>
                    <span className="text-[10px] text-slate-400">Editable Test Payload</span>
                  </div>
                  <textarea
                    rows={5}
                    value={testArgsJson}
                    onChange={(e) => setTestArgsJson(e.target.value)}
                    className="w-full font-mono text-xs p-3 bg-slate-950 text-emerald-400 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  onClick={handleExecuteTool}
                  disabled={testExecuting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-md transition disabled:opacity-50"
                >
                  <Play className={`w-4 h-4 ${testExecuting ? 'animate-spin' : ''}`} />
                  {testExecuting ? 'Executing MCP Tool...' : 'Execute Tool via MCP'}
                </button>

                {/* Test Output Viewer */}
                {testOutput && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-700 dark:text-slate-300">MCP Response Output</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${testOutput.success ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                        {testOutput.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </div>
                    <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-48">
                      {JSON.stringify(testOutput, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Cpu className="w-10 h-10 mb-2 opacity-50 text-indigo-500" />
                <p className="text-sm font-medium">Select any MCP tool from the left panel to inspect parameters and run live execution tests.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Servers List */}
      {activeTab === 'servers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servers.map((s) => (
            <div
              key={s.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    {getServerIcon(s.icon)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {s.name}
                      {s.type === 'builtin' && (
                        <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                          Built-in Core
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">ID: {s.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    s.status === 'connected'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                  }`}>
                    {s.status === 'connected' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {s.status}
                  </span>
                  {s.type !== 'builtin' && (
                    <button
                      onClick={() => handleDisconnectServer(s.id)}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">{s.description}</p>

              <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800 text-slate-500">
                <span>Tools Exposed: <strong className="text-slate-800 dark:text-slate-200">{s.toolCount}</strong></span>
                {s.urlOrCommand && <span className="font-mono text-[11px] truncate max-w-[200px]">{s.urlOrCommand}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Resources */}
      {activeTab === 'resources' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {resources.map((r) => (
              <div key={r.uri} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    {r.uri}
                  </span>
                  <span className="text-xs text-slate-400">{r.serverName}</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.name}</h4>
                <p className="text-xs text-slate-500">{r.description || 'No description provided.'}</p>
                <div className="pt-2">
                  <button
                    onClick={() => handleReadResource(r)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition"
                  >
                    Read Resource Contents
                  </button>
                </div>
              </div>
            ))}
          </div>

          {viewingResource && (
            <div className="mt-6 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">{viewingResource.uri}</span>
                <button onClick={() => setViewingResource(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
              </div>
              <pre className="p-3 bg-slate-950 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto max-h-64">
                {JSON.stringify(viewingResource.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Prompts */}
      {activeTab === 'prompts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prompts.map((p) => (
            <div key={p.name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  {p.name}
                </span>
                <span className="text-xs text-slate-400">{p.serverName}</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">{p.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab 5: Execution Trace & Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-500" />
              Live MCP Tool Call Execution Trace & Thought Chain
            </h3>
            <span className="text-xs text-slate-500">Auto-refreshing every 4s</span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {logs.map((log) => (
              <div key={log.id} className="p-3.5 bg-slate-950 text-slate-200 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${log.status === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                      {log.status.toUpperCase()}
                    </span>
                    <span className="text-indigo-400 font-semibold">{log.serverName}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-amber-300 font-bold">{log.toolName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                    <span>{log.durationMs}ms</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-500 font-sans block mb-1">Parameters:</span>
                    <pre className="p-2 bg-slate-900 rounded text-[11px] text-slate-300 overflow-x-auto">
                      {JSON.stringify(log.args, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-sans block mb-1">Execution Payload:</span>
                    <pre className="p-2 bg-slate-900 rounded text-[11px] text-emerald-400 overflow-x-auto max-h-32">
                      {typeof log.result === 'string' ? log.result : JSON.stringify(log.result, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">
                No MCP tool calls recorded yet. Interact with SANA Agent or execute tools in the Tools tab to view real-time traces here.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Add External MCP Server */}
      {showAddServer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-500" />
              Connect External MCP Server (SSE)
            </h3>
            <p className="text-xs text-slate-500">
              Provide the HTTP/SSE endpoint of an external Model Context Protocol server (e.g. SQLite MCP server, GitHub MCP server, Custom SSE server).
            </p>

            <form onSubmit={handleConnectServer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Server Identifier (ID)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. sqlite_db_server"
                  value={newServerId}
                  onChange={(e) => setNewServerId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Local SQLite Database Server"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">SSE Server URL</label>
                <input
                  type="url"
                  required
                  placeholder="http://localhost:8080/sse"
                  value={newServerUrl}
                  onChange={(e) => setNewServerUrl(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Optional server description"
                  value={newServerDesc}
                  onChange={(e) => setNewServerDesc(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddServer(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectingServer}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-md disabled:opacity-50"
                >
                  {connectingServer ? 'Connecting...' : 'Connect Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
