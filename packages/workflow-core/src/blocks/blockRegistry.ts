import { type BlockDefinition, isSkillCallType } from "./blockDefinition";
import { CORE_BLOCKS } from "./coreBlocks";

/**
 * Registry of known block definitions. Seeded with the core blocks; skill nodes
 * are registered dynamically as they are published.
 */
export class BlockRegistry {
	private readonly defs = new Map<string, BlockDefinition>();

	constructor(initial: BlockDefinition[] = CORE_BLOCKS) {
		for (const def of initial) this.defs.set(def.type, def);
	}

	register(def: BlockDefinition): void {
		this.defs.set(def.type, def);
	}

	get(type: string): BlockDefinition | undefined {
		return this.defs.get(type);
	}

	/** A type is known if it is registered or is a dynamic skill call. */
	has(type: string): boolean {
		return this.defs.has(type) || isSkillCallType(type);
	}

	list(): BlockDefinition[] {
		return [...this.defs.values()];
	}
}

/** Shared registry pre-loaded with the core blocks. */
export const coreBlockRegistry = new BlockRegistry();
