/**
 * ArchiCore OSS - Core Types
 */

// ===== CODE INDEX TYPES =====

export interface ASTNode {
  id: string;
  type: string;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  children: ASTNode[];
  metadata: Record<string, unknown>;
}

export interface Symbol {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  location: Location;
  references: Reference[];
  exports?: boolean;
  imports?: Import[];
}

export enum SymbolKind {
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Variable = 'variable',
  Constant = 'constant',
  Type = 'type',
  Module = 'module',
  Namespace = 'namespace'
}

export interface Location {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface Reference {
  location: Location;
  kind: 'read' | 'write' | 'call' | 'type';
}

export interface Import {
  source: string;
  specifiers: string[];
  location: Location;
}

// ===== DEPENDENCY GRAPH TYPES =====

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge[]>;
}

export interface GraphNode {
  id: string;
  type: 'file' | 'module' | 'function' | 'class';
  filePath: string;
  name: string;
  metadata: {
    linesOfCode?: number;
    complexity?: number;
    domain?: string;
  };
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
}

export enum EdgeType {
  Import = 'import',
  Call = 'call',
  Inheritance = 'inheritance',
  Composition = 'composition',
  DataFlow = 'data_flow',
  Uses = 'uses'
}

// ===== SEMANTIC CHUNK TYPES =====

export interface SemanticChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  filePath: string;
  startLine: number;
  endLine: number;
  type: 'module' | 'function' | 'class' | 'comment' | 'documentation';
  symbols: string[];
  purpose?: string;
  domain?: string;
  tags: string[];
}

export interface SemanticSearchResult {
  chunk: SemanticChunk;
  score: number;
  context: string;
}

// ===== ARCHITECTURE MODEL TYPES =====

export interface ArchitectureModel {
  boundedContexts: BoundedContext[];
  entities: DomainEntity[];
  rules: ArchitecturalRule[];
  invariants: Invariant[];
}

export interface BoundedContext {
  id: string;
  name: string;
  description: string;
  modules: string[];
  dependencies: string[];
  prohibitedDependencies: string[];
}

export interface DomainEntity {
  id: string;
  name: string;
  context: string;
  properties: EntityProperty[];
  relationships: EntityRelationship[];
  invariants: string[];
}

export interface EntityProperty {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface EntityRelationship {
  target: string;
  type: 'owns' | 'references' | 'aggregates' | 'depends_on';
  cardinality: '1:1' | '1:N' | 'N:M';
}

export interface ArchitecturalRule {
  id: string;
  description: string;
  type: 'dependency' | 'naming' | 'structure' | 'pattern';
  severity: 'error' | 'warning' | 'info';
  pattern?: string;
  validator: (context: ValidationContext) => RuleViolation[];
}

export interface Invariant {
  id: string;
  description: string;
  expression: string;
  entities: string[];
}

export interface ValidationContext {
  graph: DependencyGraph;
  architecture: ArchitectureModel;
  changedFiles: string[];
}

export interface RuleViolation {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  location?: Location;
  suggestion?: string;
}

// ===== IMPACT ANALYSIS TYPES =====

export interface ChangeImpact {
  change: Change;
  affectedNodes: AffectedNode[];
  risks: Risk[];
  recommendations: Recommendation[];
  impactGraph: ImpactGraph;
}

export interface Change {
  type: 'add' | 'modify' | 'delete' | 'refactor';
  description: string;
  files: string[];
  symbols: string[];
}

export interface AffectedNode {
  id: string;
  name: string;
  type: string;
  filePath: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  distance: number;
}

export interface Risk {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'breaking_change' | 'data_migration' | 'performance' | 'security' | 'compatibility';
  description: string;
  affectedComponents: string[];
  mitigation?: string;
}

export interface Recommendation {
  type: 'check' | 'test' | 'refactor' | 'review';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  details?: string;
}

export interface ImpactGraph {
  nodes: Map<string, ImpactNode>;
  edges: ImpactEdge[];
}

export interface ImpactNode {
  id: string;
  name: string;
  impactLevel: 'critical' | 'high' | 'medium' | 'low';
  metadata: Record<string, unknown>;
}

export interface ImpactEdge {
  from: string;
  to: string;
  reason: string;
}

// ===== PROJECT METADATA =====

export interface ProjectMetadata {
  framework?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  buildTool?: string;
  backend?: string;
  database?: string;
}

// ===== REFACTORING TYPES =====

export interface RefactoringTask {
  id: string;
  type: RefactoringType;
  description: string;
  targetFiles: string[];
  validation: RefactoringValidation;
}

export enum RefactoringType {
  ExtractFunction = 'extract_function',
  RenameSymbol = 'rename_symbol',
  MoveFile = 'move_file',
  InlineVariable = 'inline_variable',
  ExtractInterface = 'extract_interface',
  OptimizeImports = 'optimize_imports'
}

export interface RefactoringValidation {
  preservesBehavior: boolean;
  testsPass: boolean;
  noBreakingChanges: boolean;
  violations: RuleViolation[];
}

// ===== DOCUMENTATION TYPES =====

export interface DocumentationNode {
  id: string;
  type: 'architecture' | 'module' | 'flow' | 'decision';
  title: string;
  content: string;
  linkedCode: string[];
  updatedAt: number;
}
