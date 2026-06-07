import { PortManager } from "@rox/port-scanner";
import { treeKillWithEscalation } from "../tree-kill";

export const portManager = new PortManager({
	killFn: treeKillWithEscalation,
});
