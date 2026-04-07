import { NodeData } from "../types";
import { THEME_COLORS } from "../constants";

export function ensureIds(node: NodeData): NodeData {
  if (!node.id) {
    node.id = `node-${Math.random().toString(36).substr(2, 9)}`;
  }
  if (node.children) {
    node.children.forEach(ensureIds);
  }
  return node;
}

/**
 * Parses markdown (headings or lists) into NodeData.
 * Supports:
 * # Root
 * ## Child [color: #ff0000] [metadata: notes]
 *   - Subchild
 */
export function parseMarkdown(md: string): NodeData {
  const lines = md.split("\n").filter(line => line.trim().length > 0);
  if (lines.length === 0) return { id: "root", name: "Empty Map" };

  const nodes: { level: number; data: NodeData }[] = [];

  lines.forEach((line, index) => {
    let level = 0;
    let content = "";
    
    // Check for headings
    const headingMatch = line.match(/^(#+)\s+(.*)/);
    if (headingMatch) {
      level = headingMatch[1].length;
      content = headingMatch[2];
    } else {
      // Check for lists
      const listMatch = line.match(/^(\s*)([-*])\s+(.*)/);
      if (listMatch) {
        // Use indentation for level, assuming 2 spaces per level
        level = Math.floor(listMatch[1].length / 2) + 2; // +2 to start below # root
        content = listMatch[3];
      } else if (index === 0) {
        // First line as root if no prefix
        level = 1;
        content = line.trim();
      } else {
        return; // Skip invalid lines
      }
    }

    // Extract metadata/color hints: [key: value]
    let color: string | undefined;
    let metadata: string | undefined;
    let collapsed: boolean | undefined;
    
    const colorMatch = content.match(/\[color:\s*(#[a-fA-F0-9]{6})\]/);
    if (colorMatch) {
      color = colorMatch[1];
      content = content.replace(colorMatch[0], "").trim();
    }
    
    const metaMatch = content.match(/\[metadata:\s*(.*?)\]/);
    if (metaMatch) {
      metadata = metaMatch[1];
      content = content.replace(metaMatch[0], "").trim();
    }

    const collapsedMatch = content.match(/\[collapsed:\s*(true|false)\]/);
    if (collapsedMatch) {
      collapsed = collapsedMatch[1] === "true";
      content = content.replace(collapsedMatch[0], "").trim();
    }

    // Limit text length to 100 characters
    content = content.substring(0, 100);

    nodes.push({
      level,
      data: {
        id: `node-${index}-${Date.now()}`,
        name: content,
        color,
        metadata,
        collapsed,
        children: []
      }
    });
  });

  if (nodes.length === 0) return { id: "root", name: "Empty Map" };

  // Normalize levels (ensure no skipping and starts at 1)
  let currentLevel = 0;
  let lastLevel = 0;
  nodes.forEach((n, i) => {
    if (i === 0) {
      n.level = 1;
    } else {
      if (n.level > lastLevel + 1) {
        n.level = lastLevel + 1;
      }
    }
    lastLevel = n.level;
  });

  const root = nodes[0].data;
  const stack: { level: number; data: NodeData }[] = [{ level: 1, data: root }];

  for (let i = 1; i < nodes.length; i++) {
    const current = nodes[i];
    
    while (stack.length > 0 && stack[stack.length - 1].level >= current.level) {
      stack.pop();
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1].data;
      if (!parent.children) parent.children = [];
      parent.children.push(current.data);
      stack.push(current);
      
      // Auto-color top level if not specified
      if (current.level === 2 && !current.data.color) {
        current.data.color = THEME_COLORS[(parent.children.length - 1) % THEME_COLORS.length];
      }
    }
  }

  return root;
}

/**
 * Generates markdown from NodeData.
 */
export function generateMarkdown(node: NodeData, level = 1): string {
  let md = `${"#".repeat(level)} ${node.name}`;
  if (node.color) md += ` [color: ${node.color}]`;
  if (node.metadata) md += ` [metadata: ${node.metadata}]`;
  if (node.collapsed) md += ` [collapsed: true]`;
  md += "\n";

  if (node.children) {
    node.children.forEach(child => {
      md += generateMarkdown(child, level + 1);
    });
  }

  return md;
}
