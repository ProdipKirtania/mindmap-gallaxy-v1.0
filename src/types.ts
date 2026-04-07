import * as d3 from "d3";

export type FocusAction = 'none' | 'dim' | 'hide';

export interface FocusSettings {
  parents: FocusAction;
  siblings: FocusAction;
  unrelated: FocusAction;
}

export interface NodeData {
  id: string;
  name: string;
  children?: NodeData[];
  color?: string;
  metadata?: string;
  collapsed?: boolean;
}

export interface HierarchyNode extends d3.HierarchyNode<NodeData> {
  x0?: number;
  y0?: number;
  x: number;
  y: number;
  id?: string;
  _children?: HierarchyNode[] | null;
  el?: SVGGElement;
  parentLink?: SVGPathElement;
  children: HierarchyNode[] | null;
  parent: HierarchyNode | null;
  depth: number;
  data: NodeData;
  descendants(): HierarchyNode[];
  ancestors(): HierarchyNode[];
  links(): HierarchyLink[];
}

export interface HierarchyLink extends d3.HierarchyLink<NodeData> {
  source: HierarchyNode;
  target: HierarchyNode;
}
