import { createFileRoute } from "@tanstack/react-router";
import { DriveView } from "renderer/screens/suite/DriveView";

export const Route = createFileRoute("/_authenticated/_dashboard/drive/")({
	component: DrivePage,
});

function DrivePage() {
	return <DriveView />;
}
