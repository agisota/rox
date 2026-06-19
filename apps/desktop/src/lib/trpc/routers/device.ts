import { getHostId, getHostName } from "@rox/shared/host-info";
import { publicProcedure, router } from "..";

export const createDeviceRouter = () => {
	return router({
		getMachineId: publicProcedure.query(
			(): { machineId: string; hostName: string } => {
				return { machineId: getHostId(), hostName: getHostName() };
			},
		),
	});
};
