import type { MosaicNode } from "react-mosaic-component";

/**
 * Returns a copy of a Mosaic layout tree with every leaf pane id rewritten
 * through `idMap`. Leaves missing from the map are left unchanged.
 *
 * Pure: it neither mutates the input node nor the map. Extracted from
 * `reopenClosedTab`, which restores a closed tab under fresh pane ids and must
 * remap the persisted layout's leaves to those new ids.
 */
export const remapLayout = (
	node: MosaicNode<string>,
	idMap: ReadonlyMap<string, string>,
): MosaicNode<string> => {
	if (typeof node === "string") {
		return idMap.get(node) ?? node;
	}
	return {
		...node,
		first: remapLayout(node.first, idMap),
		second: remapLayout(node.second, idMap),
	};
};
