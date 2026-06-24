import { NODE_CATEGORY_ORDER, type NodeCategory } from "./nodeCategory";
import type { NodeTypeDefinition } from "./nodeTypeDefinition";

/**
 * Data-driven registry of node-type definitions. Mirrors the existing
 * `BlockRegistry` shape (Map-backed, instance + shared default) but carries the
 * richer editor contract (configSchema + field hints + render meta) the canvas,
 * inspector, and validator drive off of.
 */
export class NodeTypeRegistry {
	private readonly defs = new Map<string, NodeTypeDefinition>();

	constructor(initial: NodeTypeDefinition[] = []) {
		for (const def of initial) this.register(def);
	}

	/** Register (or replace) a node-type definition. */
	register(def: NodeTypeDefinition): void {
		this.defs.set(def.id, def);
	}

	/** Look up a definition by its registry id. */
	get(id: string): NodeTypeDefinition | undefined {
		return this.defs.get(id);
	}

	/** Whether a type id is registered. */
	has(id: string): boolean {
		return this.defs.has(id);
	}

	/** All registered definitions (insertion order). */
	list(): NodeTypeDefinition[] {
		return [...this.defs.values()];
	}

	/** Definitions in a single category (insertion order within the category). */
	listByCategory(category: NodeCategory): NodeTypeDefinition[] {
		return this.list().filter((def) => def.category === category);
	}

	/**
	 * Definitions grouped by category, in {@link NODE_CATEGORY_ORDER}. Empty
	 * categories are omitted. Convenience for the palette.
	 */
	listGroupedByCategory(): {
		category: NodeCategory;
		nodes: NodeTypeDefinition[];
	}[] {
		const groups: { category: NodeCategory; nodes: NodeTypeDefinition[] }[] =
			[];
		for (const category of NODE_CATEGORY_ORDER) {
			const nodes = this.listByCategory(category);
			if (nodes.length > 0) groups.push({ category, nodes });
		}
		return groups;
	}
}

/**
 * The shared, app-wide registry. Node-type modules register themselves into this
 * instance via the `registry/index.ts` barrel (imported for side effect). The
 * canvas, inspector, and validator all read from it.
 */
export const nodeTypeRegistry = new NodeTypeRegistry();

/** Register a node type into the shared registry. */
export function registerNodeType(def: NodeTypeDefinition): void {
	nodeTypeRegistry.register(def);
}

/** Look up a node type in the shared registry. */
export function getNodeType(id: string): NodeTypeDefinition | undefined {
	return nodeTypeRegistry.get(id);
}

/** Whether a type id is registered in the shared registry. */
export function isRegisteredNodeType(id: string): boolean {
	return nodeTypeRegistry.has(id);
}

/** All node types in the shared registry. */
export function listNodeTypes(): NodeTypeDefinition[] {
	return nodeTypeRegistry.list();
}

/** Node types in a category from the shared registry. */
export function listByCategory(category: NodeCategory): NodeTypeDefinition[] {
	return nodeTypeRegistry.listByCategory(category);
}
