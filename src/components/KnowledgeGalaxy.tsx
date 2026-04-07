import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import * as d3 from "d3";
import { HierarchyNode, HierarchyLink, NodeData, FocusSettings, FocusAction, SearchResult, LayoutSettings } from "../types";
import { cn } from "../lib/utils";

interface KnowledgeGalaxyProps {
  data: NodeData;
  focusMode: boolean;
  focusSettings: FocusSettings;
  layoutSettings: LayoutSettings;
  onDataChange: (data: NodeData) => void;
  selectedNodeIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export interface KnowledgeGalaxyRef {
  expandAll: () => void;
  collapseAll: () => void;
  fitToScreen: () => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  copyVisibleOutline: () => string;
  searchNodes: (query: string) => SearchResult[];
  highlightNodes: (ids: string[]) => void;
  findAndZoom: (nodeIdOrQuery: string) => boolean;
  exportToMarkdown: () => string;
  exportToSVG: () => string;
  exportToInteractiveHTML: () => string;
  deleteSelectedNodes: () => void;
  addChildToSelected: () => void;
  groupSelectedNodes: () => void;
}

const COLOR_PALETTE = [
  "#00d2ff", "#ff00d2", "#d2ff00", "#ffffff", 
  "#ff4d4d", "#4dff4d", "#4d4dff", "#ff9f43"
];

const KnowledgeGalaxy = forwardRef<KnowledgeGalaxyRef, KnowledgeGalaxyProps>(({ 
  data, 
  focusMode, 
  focusSettings,
  layoutSettings,
  onDataChange,
  selectedNodeIds,
  onSelectionChange
}, ref) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [root, setRoot] = useState<HierarchyNode | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [editingNode, setEditingNode] = useState<{ 
    id: string; 
    x: number; 
    y: number; 
    value: string; 
    color: string;
    metadata: string;
    d: HierarchyNode 
  } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{
    x: number;
    y: number;
    name: string;
    metadata?: string;
  } | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [searchHighlightIds, setSearchHighlightIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const tree = d3.tree<NodeData>().nodeSize([layoutSettings.verticalSpacing, layoutSettings.horizontalSpacing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingNode) return;

      // Find selected node (for now we use the one being hovered or just focus on the root if none)
      // For simplicity, let's allow adding to the root if nothing else is selected, 
      // but a better way is to track "selectedNode"
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingNode]);

  useEffect(() => {
    if (editingNode && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingNode]);

  const handleStartEdit = (d: HierarchyNode) => {
    if (!svgRef.current) return;
    const transform = d3.zoomTransform(svgRef.current);
    const screenX = transform.x + d.y * transform.k;
    const screenY = transform.y + d.x * transform.k;

    setEditingNode({
      id: d.id!,
      x: screenX,
      y: screenY,
      value: d.data.name,
      color: d.data.color || "#ffffff",
      metadata: d.data.metadata || "",
      d: d
    });
  };

  const handleFinishEdit = () => {
    if (editingNode) {
      editingNode.d.data.name = editingNode.value;
      editingNode.d.data.color = editingNode.color;
      editingNode.d.data.metadata = editingNode.metadata;
      setEditingNode(null);
      if (root) {
        update(root);
        onDataChange({ ...data });
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingNode(null);
  };

  const addChild = (parent: HierarchyNode) => {
    const newNode: NodeData = { 
      id: `node-${Math.random().toString(36).substr(2, 9)}`,
      name: "New Node", 
      children: [] 
    };
    if (!parent.data.children) parent.data.children = [];
    parent.data.children.push(newNode);
    
    // If collapsed, expand it
    if (parent._children) {
      parent.children = parent._children;
      parent._children = null;
    }
    parent.data.collapsed = false;
    
    onDataChange({ ...data });
    // Re-hierarchy to pick up new node
    const newRoot = d3.hierarchy(data) as HierarchyNode;
    setRoot(newRoot);
    
    // Find the new node in the new hierarchy and start editing it
    setTimeout(() => {
      const descendants = newRoot.descendants();
      const added = descendants.find(d => d.data === newNode);
      if (added) handleStartEdit(added as HierarchyNode);
    }, 100);
  };

  const deleteNode = (node: HierarchyNode) => {
    if (node.depth === 0) return; // Can't delete root
    const parent = node.parent;
    if (parent && parent.data.children) {
      parent.data.children = parent.data.children.filter(c => c !== node.data);
      onDataChange({ ...data });
      setRoot(d3.hierarchy(data) as HierarchyNode);
    }
  };

  useEffect(() => {
    if (!data) return;
    const hierarchyRoot = d3.hierarchy(data) as HierarchyNode;
    hierarchyRoot.x0 = window.innerHeight / 2;
    hierarchyRoot.y0 = 0;

    // Respect the collapsed property from data
    const applyCollapse = (d: HierarchyNode) => {
      if (d.data.collapsed && d.children) {
        d._children = d.children;
        d.children = null;
      }
      if (d.children) d.children.forEach(applyCollapse);
      if (d._children) d._children.forEach(applyCollapse);
    };
    
    applyCollapse(hierarchyRoot);

    setRoot(hierarchyRoot);
  }, [data]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current || !root) return;

    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);

    if (!zoomRef.current) {
      zoomRef.current = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        });
      svg.call(zoomRef.current);
      
      // Initial position
      svg.call(zoomRef.current.transform, d3.zoomIdentity.translate(80, window.innerHeight / 2).scale(0.7));
    }

    // Clear focus classes if focus mode is turned off
    if (!focusMode) {
      g.selectAll(".node, .link").classed("dimmed", false).classed("focused", false).classed("hidden-node", false);
    }

    update(root);
    
    let targetId = focusedNodeId;
    if (focusMode && !targetId && selectedNodeIds.length === 1) {
      targetId = selectedNodeIds[0];
      setFocusedNodeId(targetId);
    }

    if (focusMode && targetId) {
      const target = root.descendants().find(n => n.data.id === targetId);
      if (target) applyFocus(target as HierarchyNode);
    }
  }, [root, focusMode, focusSettings, selectedNodeIds]);

  const getHue = (d: HierarchyNode) => {
    if (d.depth === 0) return "#fff";
    let p = d;
    while (p.depth > 1 && p.parent) p = p.parent as HierarchyNode;
    return p.data.color || "#fff";
  };

  const diagonal = (s: { x: number; y: number }, d: { x: number; y: number }) => {
    return `M ${s.y} ${s.x} C ${(s.y + d.y) / 2} ${s.x}, ${(s.y + d.y) / 2} ${d.x}, ${d.y} ${d.x}`;
  };

  const update = (source: HierarchyNode) => {
    if (!gRef.current || !root) return;
    const g = d3.select(gRef.current);

    const nodes = root.descendants() as HierarchyNode[];
    const links = root.links() as HierarchyLink[];

    tree(root);

    nodes.forEach((d) => (d.y = d.depth * layoutSettings.horizontalSpacing));

    // Nodes
    const node = g.selectAll<SVGGElement, HierarchyNode>(".node")
      .data(nodes, (d: any) => d.data.id);

    const nodeEnter = node.enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", () => `translate(${source.y0 || 0},${source.x0 || 0})`)
      .on("dblclick", function (event, d) {
        event.stopPropagation();
        handleStartEdit(d);
      })
      .on("contextmenu", function(event, d) {
        event.preventDefault();
        addChild(d);
      })
      .on("mouseover", function(event, d) {
        const transform = d3.zoomTransform(svgRef.current!);
        setHoveredNode({
          x: transform.x + d.y * transform.k,
          y: transform.y + d.x * transform.k,
          name: d.data.name,
          metadata: d.data.metadata
        });
      })
      .on("mouseout", () => setHoveredNode(null))
      .on("click", function (event, d) {
        if (event.target.tagName === "text") return;
        
        if (event.shiftKey) {
          if (selectedNodeIds.includes(d.data.id)) {
            onSelectionChange(selectedNodeIds.filter(id => id !== d.data.id));
          } else {
            onSelectionChange([...selectedNodeIds, d.data.id]);
          }
        } else {
          onSelectionChange([d.data.id]);
          if (focusMode) {
            setFocusedNodeId(d.data.id);
            applyFocus(d);
          }
          
          // Toggle expand/collapse
          if (d.children) {
            d._children = d.children;
            d.children = null;
            d.data.collapsed = true;
          } else if (d._children) {
            d.children = d._children;
            d._children = null;
            d.data.collapsed = false;
          }
          
          update(d);
          onDataChange({ ...data });
        }
      });

    // Invisible hit area
    nodeEnter.append("circle")
      .attr("r", 30)
      .style("fill", "transparent")
      .style("cursor", "pointer");

    // The actual node circle
    nodeEnter.append("circle")
      .attr("class", (d) => `node-main-circle ${d.children || d._children ? "node-parent" : "node-leaf"}`)
      .attr("r", 1e-6)
      .style("fill", (d) => (d.children || d._children ? getHue(d) : "transparent"))
      .style("stroke", (d) => getHue(d))
      .each(function (d) {
        d.el = this.parentNode as SVGGElement;
      });

    // Selection highlight
    nodeEnter.append("circle")
      .attr("class", "selection-ring opacity-0")
      .attr("r", 15)
      .style("fill", "none")
      .style("stroke", "var(--color-accent)")
      .style("stroke-width", "2px")
      .style("stroke-dasharray", "4,2");

    // Add/Delete buttons on hover
    const controls = nodeEnter.append("g")
      .attr("class", "node-controls opacity-0 transition-opacity duration-200")
      .attr("transform", "translate(0, -25)");

    controls.append("circle")
      .attr("r", 8)
      .attr("cx", -12)
      .attr("class", "fill-green-500 cursor-pointer hover:fill-green-400")
      .on("click", (event, d) => {
        event.stopPropagation();
        addChild(d);
      });
    
    controls.append("text")
      .attr("x", -12)
      .attr("dy", "0.3em")
      .attr("text-anchor", "middle")
      .attr("class", "fill-white text-[10px] pointer-events-none font-bold")
      .text("+");

    if (source.depth !== 0) {
      controls.append("circle")
        .attr("r", 8)
        .attr("cx", 12)
        .attr("class", "fill-red-500 cursor-pointer hover:fill-red-400")
        .on("click", (event, d) => {
          event.stopPropagation();
          deleteNode(d);
        });
      
      controls.append("text")
        .attr("x", 12)
        .attr("dy", "0.3em")
        .attr("text-anchor", "middle")
        .attr("class", "fill-white text-[10px] pointer-events-none font-bold")
        .text("×");
    }

    nodeEnter.append("text")
      .attr("class", "node-label text-sm font-medium transition-all duration-300")
      .attr("dy", "-0.5em")
      .attr("x", (d) => (d.children || d._children ? -22 : 22))
      .attr("text-anchor", (d) => (d.children || d._children ? "end" : "start"))
      .attr("fill", "white")
      .text((d) => d.data.name || "Untitled Node");

    const nodeUpdate = nodeEnter.merge(node);

    nodeUpdate.transition()
      .duration(800)
      .ease(d3.easeCubicInOut)
      .attr("transform", (d) => `translate(${d.y},${d.x})`)
      .style("opacity", (d) => {
        if (searchHighlightIds.length > 0) {
          return searchHighlightIds.includes(d.data.id) ? 1 : 0.1;
        }
        return 1;
      });

    nodeUpdate.select(".node-main-circle")
      .attr("r", (d) => (d.depth === 0 ? 12 : 7))
      .style("fill", (d) => (d.children || d._children ? getHue(d) : "transparent"))
      .style("stroke", (d) => d.data.color || getHue(d));

    nodeUpdate.select(".selection-ring")
      .attr("r", (d) => (d.depth === 0 ? 18 : 13))
      .classed("opacity-100", (d) => selectedNodeIds.includes(d.data.id))
      .classed("opacity-0", (d) => !selectedNodeIds.includes(d.data.id));

    nodeUpdate.select(".node-label")
      .attr("opacity", 1)
      .attr("fill", "white")
      .attr("x", (d) => (d.children || d._children ? -22 : 22))
      .attr("text-anchor", (d) => (d.children || d._children ? "end" : "start"))
      .text(d => d.data.name || "Untitled Node");

    node.exit().transition().duration(600).attr("transform", `translate(${source.y},${source.x})`).remove();

    // Links
    const link = g.selectAll<SVGPathElement, HierarchyLink>(".link")
      .data(links, (d: any) => d.target.data.id);

    const linkEnter = link.enter()
      .insert("path", "g")
      .attr("class", "link")
      .style("stroke", (d) => getHue(d.target))
      .attr("d", () => {
        const o = { x: source.x0 || 0, y: source.y0 || 0 };
        return diagonal(o, o);
      });

    linkEnter.merge(link)
      .transition()
      .duration(800)
      .attr("d", (d) => diagonal(d.source, d.target))
      .style("opacity", (d) => {
        if (searchHighlightIds.length > 0) {
          return searchHighlightIds.includes(d.target.data.id) ? 1 : 0.1;
        }
        return 1;
      });

    link.exit().transition().duration(600).attr("d", () => diagonal(source, source)).remove();

    nodes.forEach((d) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  };

  const applyFocus = (targetData: HierarchyNode) => {
    if (!gRef.current || !root) return;
    const g = d3.select(gRef.current);
    
    // Reset all
    g.selectAll(".node, .link")
      .classed("dimmed", false)
      .classed("hidden-node", false)
      .classed("focused", false);

    if (!focusMode) return;

    const ancestors = targetData.ancestors();
    const descendants = targetData.descendants();
    const focusedNodeIds = new Set([...ancestors, ...descendants].map(n => n.data.id));

    // Nodes
    g.selectAll<SVGGElement, HierarchyNode>(".node").each(function(d) {
      const selection = d3.select(this);
      if (focusedNodeIds.has(d.data.id)) {
        selection.classed("focused", true);
      } else {
        const isAncestor = ancestors.some(a => a.data.id === d.data.id) && d.data.id !== targetData.data.id;
        const isSibling = targetData.parent && d.parent && d.parent.data.id === targetData.parent.data.id && d.data.id !== targetData.data.id;
        
        let action: FocusAction = focusSettings.unrelated;
        if (isAncestor) action = focusSettings.parents;
        else if (isSibling) action = focusSettings.siblings;

        if (action === 'dim') selection.classed("dimmed", true);
        else if (action === 'hide') selection.classed("hidden-node", true);
      }
    });

    // Links
    g.selectAll<SVGPathElement, HierarchyLink>(".link").each(function(d) {
      const selection = d3.select(this);
      const isFocused = focusedNodeIds.has(d.source.data.id) && focusedNodeIds.has(d.target.data.id);
      
      if (isFocused) {
        selection.classed("focused", true);
      } else {
        // Link action based on target node
        const target = d.target;
        const isAncestor = ancestors.some(a => a.data.id === target.data.id) && target.data.id !== targetData.data.id;
        const isSibling = targetData.parent && target.parent && target.parent.data.id === targetData.parent.data.id && target.data.id !== targetData.data.id;
        
        let action: FocusAction = focusSettings.unrelated;
        if (isAncestor) action = focusSettings.parents;
        else if (isSibling) action = focusSettings.siblings;

        if (action === 'dim') selection.classed("dimmed", true);
        else if (action === 'hide') selection.classed("hidden-node", true);
      }
    });
  };

  const fitToScreen = () => {
    if (!gRef.current || !svgRef.current || !zoomRef.current) return;
    const g = d3.select(gRef.current);
    const svg = d3.select(svgRef.current);
    const bounds = (g.node() as SVGGElement).getBBox();
    const fullWidth = window.innerWidth;
    const fullHeight = window.innerHeight;
    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;
    if (bounds.width === 0) return;
    const scale = 0.8 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
    
    svg.transition().duration(1000).call(
      zoomRef.current.transform,
      d3.zoomIdentity
        .translate(fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY)
        .scale(scale)
    );
  };

  const resetView = () => {
    if (!svgRef.current || !zoomRef.current || !gRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = d3.select(gRef.current);
    g.selectAll(".node, .link").classed("dimmed", false).classed("focused", false).classed("hidden-node", false);
    svg.transition().duration(1000).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(80, window.innerHeight / 2).scale(0.7)
    );
  };

  useImperativeHandle(ref, () => ({
    expandAll: () => {
      if (!root) return;
      const exp = (d: HierarchyNode) => {
        d.data.collapsed = false;
        if (d._children) {
          d.children = d._children;
          d._children = null;
        }
        if (d.children) d.children.forEach(exp);
      };
      exp(root);
      update(root);
      onDataChange({ ...data });
      setTimeout(() => fitToScreen(), 850);
    },
    collapseAll: () => {
      if (!root || !root.children) return;
      const col = (d: HierarchyNode) => {
        if (d.children) {
          d.data.collapsed = true;
          d._children = d.children;
          d._children.forEach(col);
          d.children = null;
        }
      };
      root.children.forEach(col);
      update(root);
      onDataChange({ ...data });
      resetView();
    },
    fitToScreen,
    resetView,
    zoomIn: () => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.4);
    },
    zoomOut: () => {
      if (!svgRef.current || !zoomRef.current) return;
      d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 0.7);
    },
    deleteSelectedNodes: () => {
      if (selectedNodeIds.length === 0 || !root) return;
      const nodesToDelete = root.descendants().filter(n => selectedNodeIds.includes(n.id!));
      nodesToDelete.forEach(n => {
        if (n.depth === 0) return;
        const parent = n.parent;
        if (parent && parent.data.children) {
          parent.data.children = parent.data.children.filter(c => c !== n.data);
        }
      });
      onDataChange({ ...data });
      onSelectionChange([]);
    },
    addChildToSelected: () => {
      if (selectedNodeIds.length !== 1 || !root) return;
      const parent = root.descendants().find(n => n.data.id === selectedNodeIds[0]);
      if (parent) addChild(parent as HierarchyNode);
    },
    groupSelectedNodes: () => {
      if (selectedNodeIds.length < 2 || !root) return;
      // Find common parent or just use root
      const nodes = root.descendants().filter(n => selectedNodeIds.includes(n.data.id));
      const firstParent = nodes[0].parent;
      
      const groupNode: NodeData = {
        id: `group-${Date.now()}`,
        name: "New Group",
        color: "#ffd700",
        collapsed: false,
        children: nodes.map(n => n.data)
      };

      // Remove nodes from their current parents
      nodes.forEach(n => {
        if (n.parent && n.parent.data.children) {
          n.parent.data.children = n.parent.data.children.filter(c => c !== n.data);
        }
      });

      // Add group to the first parent or root
      if (firstParent && firstParent.data.children) {
        firstParent.data.children.push(groupNode);
      } else {
        data.children?.push(groupNode);
      }

      onDataChange({ ...data });
      onSelectionChange([]);
    },
    copyVisibleOutline: () => {
      if (!root) return "";
      let output = "";
      const traverse = (node: HierarchyNode, level: number) => {
        const indent = "  ".repeat(level);
        output += `${indent}• ${node.data.name}\n`;
        if (node.children) {
          node.children.forEach((child) => traverse(child, level + 1));
        }
      };
      traverse(root, 0);
      return output;
    },
    searchNodes: (query: string) => {
      if (!root) return [];
      const q = query.toLowerCase().trim();
      if (!q) return [];

      const results: SearchResult[] = [];
      const nodes = root.descendants();
      
      const fuzzyMatch = (text: string, query: string) => {
        let score = 0;
        const t = text.toLowerCase();
        const q = query.toLowerCase();
        
        if (t === q) return 100;
        if (t.startsWith(q)) return 80;
        if (t.includes(q)) return 60;
        
        // Character sequence match (fuzzy)
        let queryIdx = 0;
        for (let i = 0; i < t.length && queryIdx < q.length; i++) {
          if (t[i] === q[queryIdx]) {
            queryIdx++;
            score += 5;
          }
        }
        
        return queryIdx === q.length ? score : 0;
      };

      nodes.forEach(n => {
        const nameScore = fuzzyMatch(n.data.name, q);
        const metaScore = n.data.metadata ? fuzzyMatch(n.data.metadata, q) * 0.5 : 0;
        const totalScore = Math.max(nameScore, metaScore);
        
        if (totalScore > 0) {
          const path = n.ancestors()
            .reverse()
            .map(a => a.data.name)
            .join(" > ");
            
          results.push({
            id: n.data.id,
            name: n.data.name,
            metadata: n.data.metadata,
            path,
            score: totalScore
          });
        }
      });
      
      return results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
    },
    highlightNodes: (ids: string[]) => {
      setSearchHighlightIds(ids);
      if (root) update(root);
    },
    findAndZoom: (nodeIdOrQuery: string) => {
      if (!root || !svgRef.current || !zoomRef.current) return false;
      const nodes = root.descendants();
      
      // Try to find by ID first, then by name query
      let match = nodes.find(n => n.data.id === nodeIdOrQuery);
      if (!match) {
        match = nodes.find(n => n.data.name.toLowerCase().includes(nodeIdOrQuery.toLowerCase()));
      }
      
      if (match) {
        // Expand path to match
        let curr = match.parent;
        while (curr) {
          curr.data.collapsed = false;
          if (curr._children) {
            curr.children = curr._children;
            curr._children = null;
          }
          curr = curr.parent;
        }
        update(root);
        onDataChange({ ...data });

        const svg = d3.select(svgRef.current);
        const fullWidth = window.innerWidth;
        const fullHeight = window.innerHeight;
        const scale = 1.2;

        svg.transition().duration(1000).call(
          zoomRef.current.transform,
          d3.zoomIdentity
            .translate(fullWidth / 2 - scale * match.y, fullHeight / 2 - scale * match.x)
            .scale(scale)
        );
        
        applyFocus(match as HierarchyNode);
        setFocusedNodeId(match.data.id);
        onSelectionChange([match.data.id]);
        setSearchHighlightIds([]); // Clear highlight on focus
        return true;
      }
      return false;
    },
    exportToMarkdown: () => {
      if (!root) return "";
      let md = "";
      const traverse = (node: HierarchyNode, level: number) => {
        md += `${"#".repeat(level + 1)} ${node.data.name}\n`;
        const children = node.children || node._children;
        if (children) {
          children.forEach(c => traverse(c, level + 1));
        }
      };
      traverse(root, 0);
      return md;
    },
    exportToSVG: () => {
      if (!svgRef.current) return "";
      const svg = svgRef.current.cloneNode(true) as SVGSVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      
      // Add styles
      const style = document.createElement("style");
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&display=swap');
        svg { background: #05070a; font-family: 'Barlow', sans-serif; }
        .node circle { transition: all 0.4s; }
        .node text { fill: white; font-size: 14px; paint-order: stroke; stroke: #05070a; stroke-width: 4px; stroke-linecap: round; stroke-linejoin: round; }
        .link { fill: none; stroke: rgba(255,255,255,0.2); stroke-width: 2px; }
        .node-main-circle { stroke-width: 2px; }
      `;
      svg.prepend(style);
      
      // Remove UI elements like controls
      const d3Svg = d3.select(svg);
      d3Svg.selectAll(".node-controls").remove();
      d3Svg.selectAll(".selection-ring").remove();
      
      const serializer = new XMLSerializer();
      return serializer.serializeToString(svg);
    },
    exportToInteractiveHTML: () => {
      if (!root) return "";
      
      const jsonData = JSON.stringify(data);
      const layoutData = JSON.stringify(layoutSettings);
      
      return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Galaxy Export</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #05070a; color: white; font-family: 'Barlow', sans-serif; }
        #galaxy { width: 100%; height: 100%; cursor: grab; }
        #galaxy:active { cursor: grabbing; }
        .node circle { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
        .node text { pointer-events: none; fill: white; font-size: 14px; paint-order: stroke; stroke: #05070a; stroke-width: 4px; stroke-linecap: round; stroke-linejoin: round; }
        .link { fill: none; stroke: rgba(255,255,255,0.2); stroke-width: 2px; transition: all 0.4s; }
        .node-main-circle { stroke-width: 2px; }
        #controls { position: fixed; bottom: 20px; left: 20px; display: flex; gap: 10px; z-index: 100; }
        .btn { background: rgba(255,255,255,0.1); border: 1px border rgba(255,255,255,0.2); color: white; padding: 8px 15px; border-radius: 20px; cursor: pointer; font-size: 12px; text-transform: uppercase; font-weight: bold; transition: all 0.2s; }
        .btn:hover { background: rgba(255,255,255,0.2); }
    </style>
</head>
<body>
    <svg id="galaxy"><g id="container"></g></svg>
    <div id="controls">
        <button class="btn" onclick="resetView()">Reset View</button>
        <button class="btn" onclick="expandAll()">Expand All</button>
        <button class="btn" onclick="collapseAll()">Collapse All</button>
    </div>
    <script>
        const data = ${jsonData};
        const layoutSettings = ${layoutData};
        
        const svg = d3.select("#galaxy");
        const g = d3.select("#container");
        
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => g.attr("transform", event.transform));
            
        svg.call(zoom);
        
        const tree = d3.tree().nodeSize([layoutSettings.verticalSpacing, layoutSettings.horizontalSpacing]);
        let root = d3.hierarchy(data);
        
        function update(source) {
            const nodes = root.descendants();
            const links = root.links();
            
            tree(root);
            nodes.forEach(d => d.y = d.depth * layoutSettings.horizontalSpacing);
            
            const node = g.selectAll(".node").data(nodes, d => d.data.id);
            
            const nodeEnter = node.enter().append("g")
                .attr("class", "node")
                .attr("transform", d => \`translate(\${source.y || 0},\${source.x || 0})\`)
                .on("click", (event, d) => {
                    if (d.children) {
                        d._children = d.children;
                        d.children = null;
                    } else if (d._children) {
                        d.children = d._children;
                        d._children = null;
                    }
                    update(d);
                });
                
            nodeEnter.append("circle")
                .attr("class", "node-main-circle")
                .attr("r", d => d.depth === 0 ? 12 : 7)
                .style("fill", d => (d.children || d._children) ? (d.data.color || "#fff") : "transparent")
                .style("stroke", d => d.data.color || "#fff");
                
            nodeEnter.append("text")
                .attr("dy", "-0.5em")
                .attr("x", d => (d.children || d._children) ? -22 : 22)
                .attr("text-anchor", d => (d.children || d._children) ? "end" : "start")
                .text(d => d.data.name);
                
            const nodeUpdate = nodeEnter.merge(node);
            nodeUpdate.transition().duration(800)
                .attr("transform", d => \`translate(\${d.y},\${d.x})\`);
                
            nodeUpdate.select("circle")
                .style("fill", d => (d.children || d._children) ? (d.data.color || "#fff") : "transparent");
                
            node.exit().transition().duration(600)
                .attr("transform", d => \`translate(\${source.y},\${source.x})\`)
                .remove();
                
            const link = g.selectAll(".link").data(links, d => d.target.data.id);
            
            const linkEnter = link.enter().insert("path", "g")
                .attr("class", "link")
                .attr("d", d => {
                    const o = { x: source.x, y: source.y };
                    return diagonal(o, o);
                });
                
            linkEnter.merge(link).transition().duration(800)
                .attr("d", d => diagonal(d.source, d.target));
                
            link.exit().transition().duration(600)
                .attr("d", d => diagonal(source, source))
                .remove();
        }
        
        function diagonal(s, d) {
            return \`M \${s.y} \${s.x} C \${(s.y + d.y) / 2} \${s.x}, \${(s.y + d.y) / 2} \${d.x}, \${d.y} \${d.x}\`;
        }
        
        function resetView() {
            svg.transition().duration(1000).call(
                zoom.transform,
                d3.zoomIdentity.translate(80, window.innerHeight / 2).scale(0.7)
            );
        }
        
        function expandAll() {
            root.descendants().forEach(d => {
                if (d._children) {
                    d.children = d._children;
                    d._children = null;
                }
            });
            update(root);
        }
        
        function collapseAll() {
            root.descendants().forEach(d => {
                if (d.depth > 0 && d.children) {
                    d._children = d.children;
                    d.children = null;
                }
            });
            update(root);
        }
        
        update(root);
        resetView();
    </script>
</body>
</html>`;
    }
  }));

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing">
        <g ref={gRef} />
      </svg>
      
      {editingNode && (
        <div 
          className="absolute z-50 pointer-events-none"
          style={{ 
            left: editingNode.x, 
            top: editingNode.y,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="pointer-events-auto bg-bg border-2 border-accent p-3 rounded-xl shadow-2xl flex flex-col gap-3 min-w-[200px]">
            <input
              ref={inputRef}
              type="text"
              maxLength={100}
              className="bg-white/5 border border-white/10 text-white px-3 py-2 rounded outline-none text-sm font-medium w-full focus:border-accent"
              value={editingNode.value}
              onChange={(e) => setEditingNode({ ...editingNode, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishEdit();
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
            
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase font-bold opacity-40">Metadata / Description</span>
              <textarea
                placeholder="Add notes or details..."
                className="bg-white/5 border border-white/10 text-white px-3 py-2 rounded outline-none text-[10px] w-full focus:border-accent resize-none h-16"
                value={editingNode.metadata}
                onChange={(e) => setEditingNode({ ...editingNode, metadata: e.target.value })}
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase font-bold opacity-40">Node Color</span>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    onClick={() => setEditingNode({ ...editingNode, color: c })}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${editingNode.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <input 
                type="text" 
                placeholder="#HEX"
                className="bg-white/5 border border-white/10 text-[10px] px-2 py-1 rounded outline-none w-full"
                value={editingNode.color}
                onChange={(e) => setEditingNode({ ...editingNode, color: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={handleCancelEdit} className="text-[10px] uppercase font-bold opacity-50 hover:opacity-100">Cancel</button>
              <button onClick={handleFinishEdit} className="text-[10px] uppercase font-bold text-accent">Save</button>
            </div>
          </div>
        </div>
      )}

      {hoveredNode && (
        <div 
          className="absolute z-40 pointer-events-none bg-black/80 backdrop-blur-md border border-white/20 px-3 py-2 rounded-lg shadow-xl text-xs max-w-[200px]"
          style={{ 
            left: hoveredNode.x + 20, 
            top: hoveredNode.y - 20,
          }}
        >
          <div className="font-bold text-accent mb-1">{hoveredNode.name}</div>
          {hoveredNode.metadata && (
            <div className="opacity-80 text-[10px] mb-2 border-t border-white/10 pt-1 leading-relaxed">
              {hoveredNode.metadata}
            </div>
          )}
          <div className="opacity-40 text-[9px] uppercase font-bold">Double-click to edit</div>
        </div>
      )}
    </div>
  );
});

KnowledgeGalaxy.displayName = "KnowledgeGalaxy";

export default KnowledgeGalaxy;
