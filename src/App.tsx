/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import KnowledgeGalaxy, { KnowledgeGalaxyRef } from "./components/KnowledgeGalaxy";
import { parseMarkdown, ensureIds, generateMarkdown } from "./lib/parser";
import { INITIAL_MARKDOWN } from "./constants";
import { motion, AnimatePresence } from "motion/react";
import { Maximize2, RotateCcw, Plus, Minus, Copy, Search, Download, Trash2, Save, LayoutPanelLeft, LayoutPanelTop, FileText, X, Settings2, FileCode, Image } from "lucide-react";
import { NodeData, FocusSettings, FocusAction, SearchResult, LayoutSettings } from "./types";

const STORAGE_KEY = "knowledge-galaxy-data";
const LAYOUT_STORAGE_KEY = "knowledge-galaxy-layout";

export default function App() {
  const [data, setData] = useState<NodeData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return ensureIds(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
    return ensureIds(parseMarkdown(INITIAL_MARKDOWN));
  });

  const [layoutSettings, setLayoutSettings] = useState<LayoutSettings>(() => {
    const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved layout settings", e);
      }
    }
    return {
      verticalSpacing: 45,
      horizontalSpacing: 250
    };
  });

  const [history, setHistory] = useState<NodeData[]>([]);
  const [redoStack, setRedoStack] = useState<NodeData[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>({
    parents: 'dim',
    siblings: 'dim',
    unrelated: 'dim'
  });
  const [showFocusSettings, setShowFocusSettings] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; visible: boolean }>({ message: "", visible: false });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [markdown, setMarkdown] = useState(() => generateMarkdown(data));
  const galaxyRef = useRef<KnowledgeGalaxyRef>(null);

  const updateData = useCallback((newData: NodeData, skipHistory = false) => {
    const dataWithIds = ensureIds({ ...newData });
    if (!skipHistory) {
      setHistory(prev => [...prev, data]);
      setRedoStack([]);
    }
    setData(dataWithIds);
    setMarkdown(generateMarkdown(dataWithIds));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataWithIds));
  }, [data]);

  const handleMarkdownChange = (newMd: string) => {
    setMarkdown(newMd);
    try {
      const newData = parseMarkdown(newMd);
      // We don't call updateData here to avoid circular updates and history bloat
      // but we do want to update the visual state
      setData(ensureIds(newData));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.error("Failed to parse markdown", e);
    }
  };

  const handleFormatMarkdown = () => {
    setMarkdown(generateMarkdown(data));
    triggerToast("MARKDOWN FORMATTED");
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack(prevRedo => [...prevRedo, data]);
    setHistory(prevHistory => prevHistory.slice(0, -1));
    setData(prev);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
    triggerToast("UNDO");
  }, [history, data]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prevHistory => [...prevHistory, data]);
    setRedoStack(prevRedo => prevRedo.slice(0, -1));
    setData(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    triggerToast("REDO");
  }, [redoStack, data]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.length > 0 && galaxyRef.current) {
          galaxyRef.current.deleteSelectedNodes();
        }
      }
      if (e.altKey && e.key === 'a') {
        if (selectedNodeIds.length === 1 && galaxyRef.current) {
          galaxyRef.current.addChildToSelected();
        }
      }
      if (e.altKey && e.key === 'g') {
        if (selectedNodeIds.length >= 2 && galaxyRef.current) {
          galaxyRef.current.groupSelectedNodes();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedNodeIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim() && galaxyRef.current) {
        const results = galaxyRef.current.searchNodes(searchQuery);
        setSearchResults(results);
        setSearchIndex(-1);
        galaxyRef.current.highlightNodes(results.map(r => r.id));
      } else {
        setSearchResults([]);
        setSearchIndex(-1);
        galaxyRef.current?.highlightNodes([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const triggerToast = (message: string) => {
    setShowToast({ message, visible: true });
    setTimeout(() => setShowToast({ message: "", visible: false }), 2000);
  };

  const handleCopy = () => {
    if (galaxyRef.current) {
      const text = galaxyRef.current.copyVisibleOutline();
      navigator.clipboard.writeText(text).then(() => {
        triggerToast("OUTLINE COPIED TO CLIPBOARD!");
      });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const targetIndex = searchIndex >= 0 ? searchIndex : 0;
    if (searchResults.length > targetIndex && galaxyRef.current) {
      galaxyRef.current.findAndZoom(searchResults[targetIndex].id);
      setSearchQuery("");
      setSearchResults([]);
      setSearchIndex(-1);
    } else if (searchQuery.trim()) {
      triggerToast("NODE NOT FOUND");
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Escape") {
      setSearchQuery("");
      setSearchResults([]);
      setSearchIndex(-1);
    }
  };

  const handleExportMarkdown = () => {
    if (galaxyRef.current) {
      const markdown = galaxyRef.current.exportToMarkdown();
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.toLowerCase().replace(/\s+/g, "-")}.md`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast("MARKDOWN EXPORTED!");
    }
  };

  const handleExportSVG = () => {
    if (galaxyRef.current) {
      const svg = galaxyRef.current.exportToSVG();
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.toLowerCase().replace(/\s+/g, "-")}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast("SVG EXPORTED!");
    }
  };

  const handleExportInteractiveHTML = () => {
    if (galaxyRef.current) {
      const html = galaxyRef.current.exportToInteractiveHTML();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.name.toLowerCase().replace(/\s+/g, "-")}-interactive.html`;
      a.click();
      URL.revokeObjectURL(url);
      triggerToast("INTERACTIVE HTML EXPORTED!");
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset the galaxy to its initial state? All edits will be lost.")) {
      const initial = parseMarkdown(INITIAL_MARKDOWN);
      setData(initial);
      localStorage.removeItem(STORAGE_KEY);
      triggerToast("GALAXY RESET");
    }
  };

  return (
    <div className="relative w-full h-screen bg-bg overflow-hidden select-none text-white">
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast.visible && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-20 left-1/2 z-50 bg-accent text-black px-6 py-2 rounded-full font-bold text-xs shadow-lg"
          >
            {showToast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="fixed top-5 left-5 border-l-4 border-white pl-4 z-10 pointer-events-none">
        <h1 className="text-xl font-bold tracking-tight m-0">{data.name}</h1>
        <p className="text-[10px] uppercase opacity-50 font-semibold mt-1">
          DBL CLICK: EDIT • ALT+A: ADD • DEL: REMOVE • CTRL+Z: UNDO
        </p>
      </div>

      {/* Top Controls */}
      <div className="fixed top-5 right-5 flex items-center gap-3 z-20">
        <div className="flex items-center gap-1 bg-white/10 border border-white/20 rounded-lg p-1">
          <button
            onClick={handleUndo}
            disabled={history.length === 0}
            className="p-2 hover:bg-white/10 rounded disabled:opacity-20 transition-all"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw size={14} className="scale-x-[-1]" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-2 hover:bg-white/10 rounded disabled:opacity-20 transition-all"
            title="Redo (Ctrl+Shift+Z)"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <form onSubmit={handleSearch} className="relative group">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 pl-10 text-xs outline-none focus:border-accent/50 transition-all w-40 focus:w-64"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity" />
          
          {/* Search Results Dropdown */}
          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-64 overflow-y-auto"
              >
                {searchResults.map((result, idx) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      galaxyRef.current?.findAndZoom(result.id);
                      setSearchQuery("");
                      setSearchResults([]);
                      setSearchIndex(-1);
                    }}
                    className={`w-full text-left px-4 py-3 transition-colors border-b border-white/5 last:border-none ${searchIndex === idx ? "bg-accent/20" : "hover:bg-white/10"}`}
                  >
                    <div className="text-xs font-bold text-accent">{result.name}</div>
                    <div className="text-[9px] opacity-40 truncate mt-0.5">{result.path}</div>
                    {result.metadata && (
                      <div className="text-[9px] opacity-60 italic mt-1 line-clamp-1">
                        "{result.metadata}"
                      </div>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase font-bold opacity-30 px-1">Navigation</span>
          <button
            onClick={() => setShowMarkdown(!showMarkdown)}
            className={`flex items-center gap-2 border px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all active:scale-95 ${showMarkdown ? "bg-accent text-black border-accent" : "bg-white/10 border-white/20 text-white hover:bg-white/20"}`}
            title="Toggle Markdown Editor"
          >
            <FileText size={14} />
            Editor
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase font-bold opacity-30 px-1">Clipboard</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-white/20 active:scale-95"
            title="Copy as Outline"
          >
            <Copy size={14} />
            Copy Outline
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase font-bold opacity-30 px-1">Export</span>
          <div className="flex gap-1">
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all hover:bg-white/20 active:scale-95"
              title="Download as Markdown"
            >
              <Download size={12} />
              MD
            </button>
            <button
              onClick={handleExportSVG}
              className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all hover:bg-white/20 active:scale-95"
              title="Download as SVG"
            >
              <Image size={12} />
              SVG
            </button>
            <button
              onClick={handleExportInteractiveHTML}
              className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all hover:bg-white/20 active:scale-95"
              title="Download Interactive HTML"
            >
              <FileCode size={12} />
              HTML
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase font-bold opacity-30 px-1">Tools</span>
          <button
            onClick={() => galaxyRef.current?.groupSelectedNodes()}
            disabled={selectedNodeIds.length < 2}
            className="flex items-center gap-2 bg-gold/20 border border-gold/40 text-gold px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-gold/30 active:scale-95 disabled:opacity-20"
            title="Group Selected Nodes (Alt+G)"
          >
            <LayoutPanelTop size={14} />
            Group
          </button>
        </div>

        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-full">
          <span className={focusMode ? "text-accent text-[10px] font-extrabold uppercase" : "text-white/40 text-[10px] font-extrabold uppercase"}>
            Focus
          </span>
          <button
            onClick={() => setFocusMode(!focusMode)}
            className={`relative w-9 h-5 rounded-full transition-colors duration-300 ${focusMode ? "bg-accent" : "bg-white/20"}`}
          >
            <motion.div
              animate={{ x: focusMode ? 16 : 2 }}
              className="absolute top-1 left-0 w-3 h-3 bg-white rounded-full shadow-sm"
            />
          </button>
          <button 
            onClick={() => setShowFocusSettings(!showFocusSettings)}
            className={`p-1 rounded hover:bg-white/10 transition-colors ${showFocusSettings ? "text-accent" : "text-white/40"}`}
            title="Focus Settings"
          >
            <Settings2 size={12} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase font-bold opacity-30 px-1">System</span>
          <button
            onClick={handleReset}
            className="bg-red-500/20 border border-red-500/40 text-red-200 px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-red-500/30 active:scale-95"
            title="Reset to Initial State"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-3 z-20">
        <button
          onClick={() => galaxyRef.current?.expandAll()}
          className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
          title="Expand All"
        >
          <LayoutPanelTop size={20} />
        </button>
        <button
          onClick={() => galaxyRef.current?.collapseAll()}
          className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
          title="Collapse All"
        >
          <LayoutPanelLeft size={20} />
        </button>
        <div className="h-px bg-white/10 mx-2" />
        <button
          onClick={() => galaxyRef.current?.fitToScreen()}
          className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
          title="Fit to Screen"
        >
          <Maximize2 size={20} />
        </button>
        <button
          onClick={() => galaxyRef.current?.resetView()}
          className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
          title="Center View"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={() => galaxyRef.current?.zoomIn()}
          className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
          title="Zoom In"
        >
          <Plus size={20} />
        </button>
        <button
          onClick={() => galaxyRef.current?.zoomOut()}
          className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-90"
          title="Zoom Out"
        >
          <Minus size={20} />
        </button>
      </div>

      {/* Visualization */}
      <div className={`flex w-full h-full transition-all duration-500 ${showMarkdown ? "pl-[400px]" : ""}`}>
        <KnowledgeGalaxy 
          ref={galaxyRef} 
          data={data} 
          focusMode={focusMode} 
          focusSettings={focusSettings}
          layoutSettings={layoutSettings}
          onDataChange={updateData}
          selectedNodeIds={selectedNodeIds}
          onSelectionChange={setSelectedNodeIds}
        />
      </div>

      {/* Settings Popover */}
      <AnimatePresence>
        {showFocusSettings && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="fixed top-20 right-5 z-40 bg-black/80 backdrop-blur-xl border border-white/10 p-4 rounded-xl shadow-2xl w-64"
          >
            <div className="mb-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-accent mb-4">Layout Settings</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold opacity-60">
                    <span>Vertical Spacing</span>
                    <span>{layoutSettings.verticalSpacing}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="20" 
                    max="150" 
                    value={layoutSettings.verticalSpacing}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      const newSettings = { ...layoutSettings, verticalSpacing: val };
                      setLayoutSettings(newSettings);
                      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newSettings));
                    }}
                    className="w-full accent-accent"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold opacity-60">
                    <span>Horizontal Spacing</span>
                    <span>{layoutSettings.horizontalSpacing}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="100" 
                    max="500" 
                    value={layoutSettings.horizontalSpacing}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      const newSettings = { ...layoutSettings, horizontalSpacing: val };
                      setLayoutSettings(newSettings);
                      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(newSettings));
                    }}
                    className="w-full accent-accent"
                  />
                </div>
              </div>
            </div>

            <h3 className="text-[10px] font-bold uppercase tracking-widest text-accent mb-4">Focus Mode Settings</h3>
            
            <div className="space-y-4">
              {(['parents', 'siblings', 'unrelated'] as const).map((group) => (
                <div key={group} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold opacity-60">{group}</span>
                    <div className="flex bg-white/5 rounded-lg p-0.5">
                      {(['none', 'dim', 'hide'] as const).map((action) => (
                        <button
                          key={action}
                          onClick={() => setFocusSettings(prev => ({ ...prev, [group]: action }))}
                          className={`px-2 py-1 rounded text-[8px] font-bold uppercase transition-all ${focusSettings[group] === action ? "bg-accent text-black" : "text-white/40 hover:text-white"}`}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Markdown Sidebar */}
      <AnimatePresence>
        {showMarkdown && (
          <motion.div
            initial={{ x: -400 }}
            animate={{ x: 0 }}
            exit={{ x: -400 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 w-[400px] h-full bg-black/40 backdrop-blur-xl border-r border-white/10 z-30 flex flex-col pt-24 pb-10 px-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-sm font-bold tracking-widest uppercase text-accent">Markdown Editor</h2>
                <p className="text-[10px] opacity-40 font-bold uppercase mt-1">Real-time Bidirectional Sync</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFormatMarkdown}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
                  title="Format Markdown"
                >
                  <RotateCcw size={14} />
                </button>
                <button 
                  onClick={() => setShowMarkdown(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 relative">
              <textarea
                value={markdown}
                onChange={(e) => handleMarkdownChange(e.target.value)}
                spellCheck={false}
                className="w-full h-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-mono leading-relaxed outline-none focus:border-accent/30 transition-all resize-none"
                placeholder="# Root Topic&#10;## Subtopic 1&#10;### Detail A&#10;## Subtopic 2"
              />
              <div className="absolute bottom-4 right-4 pointer-events-none opacity-20">
                <FileText size={40} />
              </div>
            </div>

            <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/5">
              <h3 className="text-[10px] font-bold uppercase opacity-40 mb-3">Quick Guide</h3>
              <ul className="space-y-2 text-[10px] opacity-60">
                <li className="flex items-center gap-2">
                  <code className="bg-white/10 px-1 rounded text-accent">#</code> Root Node
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white/10 px-1 rounded text-accent">##</code> Level 1 Nodes
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white/10 px-1 rounded text-accent">-</code> List items (indented)
                </li>
                <li className="flex items-center gap-2">
                  <code className="bg-white/10 px-1 rounded text-accent">[color: #hex]</code> Custom Color
                </li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
