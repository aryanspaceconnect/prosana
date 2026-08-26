import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify/react';
import {
  AgentVaultData,
  VaultFolderRecord,
  VaultFileRecord,
  createVaultFile,
  createVaultFolder
} from '../agent/agentVault';

interface VaultFileExplorerProps {
  userId: string;
  vaultData: AgentVaultData;
  onRefreshVault: () => void;
}

export const VaultFileExplorer: React.FC<VaultFileExplorerProps> = ({
  userId,
  vaultData,
  onRefreshVault
}) => {
  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [selectedFile, setSelectedFile] = useState<VaultFileRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // File Editor / Editing State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editContent, setEditContent] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // New File / Folder Modal State
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [newFileFolder, setNewFileFolder] = useState<string>('/');
  const [newFileType, setNewFileType] = useState<string>('application/json');
  const [newFileContent, setNewFileContent] = useState<string>('{\n  "title": "New Portal Data",\n  "status": "active"\n}');
  const [newFileTags, setNewFileTags] = useState<string>('portal, agent');

  const [showNewFolderModal, setShowNewFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [newFolderParent, setNewFolderParent] = useState<string>('/');
  const [newFolderDesc, setNewFolderDesc] = useState<string>('');

  const [saving, setSaving] = useState<boolean>(false);

  // Merge native vault files/folders with synthesized portal records (documents, notes, sessions)
  const aggregatedWorkspace = useMemo(() => {
    const folders: VaultFolderRecord[] = [...(vaultData.folders || [])];
    const files: VaultFileRecord[] = [...(vaultData.files || [])];

    // Helper to ensure a folder exists in list
    const ensureFolder = (path: string, name: string, description: string) => {
      const folderId = `portal_fldr_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
      if (!folders.some(f => f.path === path || f.id === folderId)) {
        folders.push({
          id: folderId,
          name,
          path,
          parentPath: path.substring(0, path.lastIndexOf('/')) || '/',
          description,
          childFolderIds: [],
          fileIds: [],
          hyperlinks: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    };

    // Guarantee core Portal drives
    ensureFolder('/portals', 'Portals Workspace Drive', 'Root directory for agent generated portals and portals data');
    ensureFolder('/portals/skin_analysis', 'Skin Analysis Portal', 'Agent-generated facial scans, diagnostic matrices & barrier reports');
    ensureFolder('/portals/routine_builder', 'Routine & Regimens', 'Custom protocols, product matrices, and scheduled event logs');
    ensureFolder('/portals/documents', 'Agent Documents', 'Generated reports, export matrices & deep summaries');
    ensureFolder('/portals/notes', 'Observation Notes', 'Memory vault notes and observation snapshots');
    ensureFolder('/portals/sessions', 'Session Traces', 'Agent execution logs, prompt memory & tool call traces');

    // Map documents to files inside /portals/documents
    if (vaultData.documents && vaultData.documents.length > 0) {
      vaultData.documents.forEach(doc => {
        const filePath = `/portals/documents/${doc.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
        if (!files.some(f => f.path === filePath || f.id === doc.id)) {
          files.push({
            id: doc.id,
            name: `${doc.title}.md`,
            path: filePath,
            folderPath: '/portals/documents',
            content: doc.content || `# ${doc.title}\n\n${doc.summary || ''}`,
            fileType: doc.fileType || 'text/markdown',
            tags: ['document', 'generated'],
            hyperlinks: [],
            createdAt: doc.date || new Date().toISOString(),
            updatedAt: doc.date || new Date().toISOString(),
            version: doc.version || 1
          });
        }
      });
    }

    // Map notes to files inside /portals/notes
    if (vaultData.notes && vaultData.notes.length > 0) {
      vaultData.notes.forEach(note => {
        const filePath = `/portals/notes/${note.title.replace(/[/\\?%*:|"<>]/g, '_')}.json`;
        if (!files.some(f => f.path === filePath || f.id === note.id)) {
          files.push({
            id: note.id,
            name: `${note.title}.json`,
            path: filePath,
            folderPath: '/portals/notes',
            content: JSON.stringify({
              id: note.id,
              title: note.title,
              category: note.category,
              date: note.date,
              description: note.description,
              tags: note.tags || []
            }, null, 2),
            fileType: 'application/json',
            tags: note.tags || ['note'],
            hyperlinks: [],
            createdAt: note.date || new Date().toISOString(),
            updatedAt: note.date || new Date().toISOString(),
            version: note.version || 1
          });
        }
      });
    }

    // Map sessions to files inside /portals/sessions
    if (vaultData.sessions && vaultData.sessions.length > 0) {
      vaultData.sessions.forEach((sess, idx) => {
        const fileName = `session_${sess.startedAtDate}_${sess.sessionId.slice(-6)}.json`;
        const filePath = `/portals/sessions/${fileName}`;
        if (!files.some(f => f.path === filePath)) {
          files.push({
            id: `sess_file_${sess.sessionId}`,
            name: fileName,
            path: filePath,
            folderPath: '/portals/sessions',
            content: JSON.stringify({
              sessionId: sess.sessionId,
              title: sess.title,
              summary: sess.summary,
              startedAt: sess.startedAt,
              localTime: sess.localTime,
              topics: sess.topics,
              messagesCount: sess.messages?.length || 0,
              toolCallsCount: sess.toolCalls?.length || 0,
              toolCalls: sess.toolCalls,
              intentHistory: sess.intentHistory
            }, null, 2),
            fileType: 'application/json',
            tags: ['session_trace', 'execution'],
            hyperlinks: [],
            createdAt: sess.startedAt || new Date().toISOString(),
            updatedAt: sess.startedAt || new Date().toISOString(),
            version: sess.version || 1
          });
        }
      });
    }

    // Add default initial sample portal file if files is completely empty
    if (files.length === 0) {
      files.push({
        id: 'sample_skin_report',
        name: 'dermatology_matrix.json',
        path: '/portals/skin_analysis/dermatology_matrix.json',
        folderPath: '/portals/skin_analysis',
        content: JSON.stringify({
          portalName: "prosana Diagnostic Matrix",
          generatedAt: new Date().toISOString(),
          barrierStatus: "Slightly Compromised",
          hydrationIndex: 72,
          rednessLevel: "Moderate",
          recommendedActiveIngreds: ["Ceramides", "Hyaluronic Acid", "Centella Asiatica"],
          contraindicated: ["Salicylic Acid > 2%", "High Alcohol Toners"]
        }, null, 2),
        fileType: 'application/json',
        tags: ['skin_analysis', 'portal_data'],
        hyperlinks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      });
    }

    return { folders, files };
  }, [vaultData]);

  // Compute items in current folder or matching search
  const currentItems = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchingFiles = aggregatedWorkspace.files.filter(
        f => f.name.toLowerCase().includes(q) ||
             f.path.toLowerCase().includes(q) ||
             f.tags.some(t => t.toLowerCase().includes(q)) ||
             f.content.toLowerCase().includes(q)
      );
      const matchingFolders = aggregatedWorkspace.folders.filter(
        f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
      );
      return { folders: matchingFolders, files: matchingFiles, isSearch: true };
    }

    // Direct items inside currentPath
    const normPath = currentPath === '/' ? '/' : currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;

    const subfolders = aggregatedWorkspace.folders.filter(f => {
      if (normPath === '/') {
        return f.parentPath === '/' || f.path.split('/').length === 2;
      }
      return f.parentPath === normPath || (f.path.startsWith(`${normPath}/`) && f.path.substring(normPath.length + 1).indexOf('/') === -1);
    });

    const subfiles = aggregatedWorkspace.files.filter(f => {
      if (normPath === '/') {
        return f.folderPath === '/' || !f.folderPath || f.folderPath === '';
      }
      return f.folderPath === normPath;
    });

    return { folders: subfolders, files: subfiles, isSearch: false };
  }, [currentPath, searchQuery, aggregatedWorkspace]);

  // Calculate total drive stats
  const driveStats = useMemo(() => {
    const totalFolders = aggregatedWorkspace.folders.length;
    const totalFiles = aggregatedWorkspace.files.length;
    let totalBytes = 0;
    aggregatedWorkspace.files.forEach(f => {
      totalBytes += (f.content || '').length;
    });
    const formattedSize = totalBytes > 1024 ? `${(totalBytes / 1024).toFixed(1)} KB` : `${totalBytes} B`;
    return { totalFolders, totalFiles, formattedSize };
  }, [aggregatedWorkspace]);

  // Handle Copy file content
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle Download file content
  const handleDownload = (file: VaultFileRecord) => {
    const blob = new Blob([file.content], { type: file.fileType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Save File Edit
  const handleSaveEdit = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await createVaultFile(
        userId,
        selectedFile.name,
        editContent,
        selectedFile.folderPath,
        selectedFile.fileType,
        selectedFile.tags
      );
      setSelectedFile(prev => prev ? { ...prev, content: editContent, version: (prev.version || 1) + 1, updatedAt: new Date().toISOString() } : null);
      setIsEditing(false);
      onRefreshVault();
    } catch (err) {
      console.error('Failed to save file edit:', err);
    } finally {
      setSaving(false);
    }
  };

  // Handle Create New File
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    setSaving(true);
    try {
      const tagsArr = newFileTags.split(',').map(t => t.trim()).filter(Boolean);
      const created = await createVaultFile(
        userId,
        newFileName.trim(),
        newFileContent,
        newFileFolder,
        newFileType,
        tagsArr
      );
      setShowNewFileModal(false);
      setNewFileName('');
      setSelectedFile(created);
      onRefreshVault();
    } catch (err) {
      console.error('Error creating file:', err);
    } finally {
      setSaving(false);
    }
  };

  // Handle Create New Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setSaving(true);
    try {
      await createVaultFolder(
        userId,
        newFolderName.trim(),
        newFolderParent,
        newFolderDesc
      );
      setShowNewFolderModal(false);
      setNewFolderName('');
      onRefreshVault();
    } catch (err) {
      console.error('Error creating folder:', err);
    } finally {
      setSaving(false);
    }
  };

  // Helper for file extension icon styling
  const getFileIcon = (fileType: string, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'json') return { icon: 'solar:code-file-bold-duotone', color: 'text-amber-500' };
    if (ext === 'md' || ext === 'txt') return { icon: 'solar:document-text-bold-duotone', color: 'text-blue-500' };
    if (ext === 'ts' || ext === 'js' || ext === 'jsx' || ext === 'tsx') return { icon: 'solar:code-square-bold-duotone', color: 'text-cyan-500' };
    if (fileType.includes('image')) return { icon: 'solar:gallery-wide-bold-duotone', color: 'text-indigo-500' };
    return { icon: 'solar:file-text-bold-duotone', color: 'text-slate-500' };
  };

  // Breadcrumb path parts
  const pathParts = useMemo(() => {
    if (currentPath === '/') return [];
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  return (
    <div className="space-y-4 text-slate-800">
      {/* Top Banner & Storage Status */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-white/10 text-emerald-400 border border-white/10 shadow-inner">
            <Icon icon="solar:laptop-minimalistic-bold-duotone" className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-bold tracking-tight text-white">prosana-OS // Agent Portal System Drive</h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30">
                ACTIVE PORTALS
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Inspect, read, edit, and export all generated portal files and system directories
            </p>
          </div>
        </div>

        {/* Stats badging */}
        <div className="flex items-center space-x-3 text-xs bg-black/30 px-3 py-2 rounded-xl border border-white/10">
          <div>
            <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Folders</span>
            <span className="font-bold text-white text-sm">{driveStats.totalFolders}</span>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div>
            <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Files</span>
            <span className="font-bold text-white text-sm">{driveStats.totalFiles}</span>
          </div>
          <div className="w-px h-6 bg-white/10" />
          <div>
            <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Data Size</span>
            <span className="font-bold text-emerald-400 font-mono text-xs">{driveStats.formattedSize}</span>
          </div>
        </div>
      </div>

      {/* Path Breadcrumbs & Actions Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-100/80 p-2.5 rounded-2xl border border-slate-200">
        {/* Breadcrumb Path */}
        <div className="flex items-center space-x-1 overflow-x-auto text-xs no-scrollbar py-1 px-2 bg-white rounded-xl border border-slate-200/80 shadow-xs flex-1">
          <button
            onClick={() => { setCurrentPath('/'); setSelectedFile(null); }}
            className={`flex items-center space-x-1 font-semibold hover:text-black transition-colors cursor-pointer ${
              currentPath === '/' ? 'text-slate-900 font-bold' : 'text-slate-500'
            }`}
          >
            <Icon icon="solar:folder-open-bold-duotone" className="w-4 h-4 text-amber-500" />
            <span>Root</span>
          </button>

          {pathParts.map((part, idx) => {
            const buildPath = '/' + pathParts.slice(0, idx + 1).join('/');
            const isLast = idx === pathParts.length - 1;
            return (
              <React.Fragment key={buildPath}>
                <Icon icon="solar:alt-arrow-right-linear" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <button
                  onClick={() => { setCurrentPath(buildPath); setSelectedFile(null); }}
                  className={`font-semibold hover:text-black transition-colors shrink-0 cursor-pointer ${
                    isLast && !selectedFile ? 'text-slate-900 font-bold underline decoration-amber-500 underline-offset-4' : 'text-slate-600'
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}

          {selectedFile && (
            <>
              <Icon icon="solar:alt-arrow-right-linear" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-bold text-slate-900 truncate max-w-[150px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {selectedFile.name}
              </span>
            </>
          )}
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center space-x-2">
          {/* View Mode */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs cursor-pointer ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              title="Grid View"
            >
              <Icon icon="solar:widget-5-linear" className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs cursor-pointer ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
              title="List View"
            >
              <Icon icon="solar:list-cross-bold" className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => { setNewFileFolder(currentPath); setShowNewFileModal(true); }}
            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Icon icon="solar:add-circle-linear" className="w-4 h-4 text-emerald-400" />
            <span>+ File</span>
          </button>

          <button
            onClick={() => { setNewFolderParent(currentPath); setShowNewFolderModal(true); }}
            className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Icon icon="solar:folder-add-linear" className="w-4 h-4 text-amber-600" />
            <span>+ Folder</span>
          </button>
        </div>
      </div>

      {/* Search Input Filter */}
      <div className="relative">
        <Icon icon="solar:magnifier-linear" className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter files, portals, code data, or tags..."
          className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Main Content Area: Selected File Inspector OR Folder Contents Grid */}
      {selectedFile ? (
        /* FILE DATA INSPECTOR */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden flex flex-col space-y-0">
          {/* File Header */}
          <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
                <Icon icon={getFileIcon(selectedFile.fileType, selectedFile.name).icon} className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white font-mono">{selectedFile.name}</h3>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    v{selectedFile.version || 1}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedFile.path}</p>
              </div>
            </div>

            {/* File Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleCopy(isEditing ? editContent : selectedFile.content)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center space-x-1.5 border border-slate-700 cursor-pointer"
              >
                <Icon icon={copied ? 'solar:check-circle-bold' : 'solar:copy-linear'} className="w-3.5 h-3.5 text-emerald-400" />
                <span>{copied ? 'Copied!' : 'Copy Data'}</span>
              </button>

              <button
                onClick={() => handleDownload(selectedFile)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center space-x-1.5 border border-slate-700 cursor-pointer"
              >
                <Icon icon="solar:download-minimalistic-linear" className="w-3.5 h-3.5 text-blue-400" />
                <span>Download</span>
              </button>

              {isEditing ? (
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <Icon icon="solar:diskette-bold" className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              ) : (
                <button
                  onClick={() => { setEditContent(selectedFile.content); setIsEditing(true); }}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <Icon icon="solar:pen-2-linear" className="w-3.5 h-3.5" />
                  <span>Edit File</span>
                </button>
              )}

              <button
                onClick={() => { setSelectedFile(null); setIsEditing(false); }}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                title="Close Inspector"
              >
                <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* File Meta Tags bar */}
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-[11px] text-slate-600 font-mono">
            <div className="flex items-center space-x-3">
              <span>Type: <strong className="text-slate-800">{selectedFile.fileType}</strong></span>
              <span>Lines: <strong className="text-slate-800">{(selectedFile.content || '').split('\n').length}</strong></span>
              <span>Size: <strong className="text-slate-800">{(selectedFile.content || '').length} bytes</strong></span>
            </div>
            {selectedFile.tags && selectedFile.tags.length > 0 && (
              <div className="flex items-center space-x-1">
                {selectedFile.tags.map((tg, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px]">
                    #{tg}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Content Viewer / Editor Body */}
          <div className="p-4 bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-[380px] min-h-[220px]">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={14}
                className="w-full h-full bg-transparent text-emerald-300 font-mono text-xs focus:outline-none resize-y leading-relaxed"
                placeholder="Enter file content..."
              />
            ) : (
              <pre className="text-slate-200 leading-relaxed font-mono whitespace-pre-wrap select-text">
                {selectedFile.content}
              </pre>
            )}
          </div>
        </div>
      ) : (
        /* FOLDER CONTENTS BROWSER */
        <div className="space-y-4">
          {/* Quick Portals Shortcuts Sidebar / Grid if at Root */}
          {currentPath === '/' && !searchQuery && (
            <div className="space-y-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Agent Portal Drives</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { path: '/portals/skin_analysis', name: 'Skin Analysis Portal', icon: 'solar:face-scan-circle-bold-duotone', color: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
                  { path: '/portals/routine_builder', name: 'Routine Protocols', icon: 'solar:calendar-mark-bold-duotone', color: 'bg-blue-50 text-blue-900 border-blue-200' },
                  { path: '/portals/documents', name: 'Agent Documents', icon: 'solar:document-text-bold-duotone', color: 'bg-amber-50 text-amber-900 border-amber-200' },
                  { path: '/portals/notes', name: 'Vault Notes', icon: 'solar:notes-bold-duotone', color: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
                  { path: '/portals/sessions', name: 'Session Traces', icon: 'solar:chat-round-line-bold-duotone', color: 'bg-cyan-50 text-cyan-900 border-cyan-200' },
                ].map(p => (
                  <button
                    key={p.path}
                    onClick={() => setCurrentPath(p.path)}
                    className={`p-3 rounded-2xl border text-left transition-all hover:scale-[1.02] flex items-center space-x-2.5 shadow-2xs cursor-pointer ${p.color}`}
                  >
                    <Icon icon={p.icon} className="w-5 h-5 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold truncate">{p.name}</p>
                      <p className="text-[10px] opacity-75 font-mono">{p.path}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Folder & Files List */}
          {currentItems.folders.length === 0 && currentItems.files.length === 0 ? (
            <div className="py-12 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-2">
              <div className="p-3 rounded-full bg-slate-200 text-slate-500 w-fit mx-auto">
                <Icon icon="solar:folder-open-bold-duotone" className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-700">This directory is empty</p>
              <p className="text-[11px] text-slate-500">
                Use the "+ File" or "+ Folder" buttons above to create new portal data in <span className="font-mono">{currentPath}</span>.
              </p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3' : 'space-y-2'}>
              {/* SUBFOLDERS */}
              {currentItems.folders.map(fldr => (
                <div
                  key={fldr.id}
                  onClick={() => setCurrentPath(fldr.path)}
                  className={`group p-3.5 rounded-2xl bg-slate-50 hover:bg-amber-50/60 border border-slate-200/80 hover:border-amber-300 transition-all cursor-pointer shadow-2xs flex items-center justify-between ${
                    viewMode === 'list' ? 'flex-row' : ''
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="p-2 rounded-xl bg-amber-100 text-amber-700 group-hover:scale-105 transition-transform">
                      <Icon icon="solar:folder-bold-duotone" className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-900">{fldr.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{fldr.path}</p>
                    </div>
                  </div>
                  <Icon icon="solar:alt-arrow-right-linear" className="w-4 h-4 text-slate-400 group-hover:text-amber-700 shrink-0" />
                </div>
              ))}

              {/* FILES */}
              {currentItems.files.map(file => {
                const iconInfo = getFileIcon(file.fileType, file.name);
                return (
                  <div
                    key={file.id}
                    onClick={() => { setSelectedFile(file); setIsEditing(false); }}
                    className={`group p-3.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-400 transition-all cursor-pointer shadow-2xs flex flex-col justify-between space-y-2 ${
                      viewMode === 'list' ? 'sm:flex-row sm:items-center sm:space-y-0' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3 truncate">
                      <div className={`p-2 rounded-xl bg-slate-100 ${iconInfo.color} group-hover:scale-105 transition-transform shrink-0`}>
                        <Icon icon={iconInfo.icon} className="w-5 h-5" />
                      </div>
                      <div className="truncate flex-1">
                        <div className="flex items-center space-x-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate group-hover:text-black font-mono">{file.name}</p>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">
                            v{file.version || 1}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate font-mono mt-0.5">{file.path}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0">
                      <span>{(file.content || '').length} bytes</span>
                      <span className="font-semibold text-emerald-700 group-hover:underline">Inspect Data →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE NEW FILE */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Icon icon="solar:add-circle-bold" className="w-5 h-5 text-emerald-600" />
                <h4 className="text-sm font-bold text-slate-900">Create Portal File</h4>
              </div>
              <button onClick={() => setShowNewFileModal(false)} className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Target Folder Path</label>
                <input
                  type="text"
                  value={newFileFolder}
                  onChange={e => setNewFileFolder(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 font-mono text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">File Name (e.g., report.json, notes.md)</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  placeholder="e.g. skin_analysis_v2.json"
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 font-mono text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">File Type</label>
                  <select
                    value={newFileType}
                    onChange={e => setNewFileType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 cursor-pointer"
                  >
                    <option value="application/json">JSON (.json)</option>
                    <option value="text/markdown">Markdown (.md)</option>
                    <option value="text/plain">Text (.txt)</option>
                    <option value="application/javascript">Code (.js / .ts)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={newFileTags}
                    onChange={e => setNewFileTags(e.target.value)}
                    placeholder="portal, scan"
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Initial Data Content</label>
                <textarea
                  value={newFileContent}
                  onChange={e => setNewFileContent(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 font-mono text-emerald-400 text-xs focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFileModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 cursor-pointer"
                >
                  {saving ? 'Creating...' : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW FOLDER */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Icon icon="solar:folder-add-bold" className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm font-bold text-slate-900">Create Portal Directory</h4>
              </div>
              <button onClick={() => setShowNewFolderModal(false)} className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Parent Folder Path</label>
                <input
                  type="text"
                  value={newFolderParent}
                  onChange={e => setNewFolderParent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 font-mono text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="e.g. routine_reports"
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Description</label>
                <input
                  type="text"
                  value={newFolderDesc}
                  onChange={e => setNewFolderDesc(e.target.value)}
                  placeholder="e.g. Portal folder for daily barrier logs"
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500 cursor-pointer"
                >
                  {saving ? 'Creating...' : 'Create Directory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
