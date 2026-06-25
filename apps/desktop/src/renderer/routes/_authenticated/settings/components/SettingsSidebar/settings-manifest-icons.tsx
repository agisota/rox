import {
	HiOutlineBeaker,
	HiOutlineBell,
	HiOutlineBuildingOffice2,
	HiOutlineCommandLine,
	HiOutlineComputerDesktop,
	HiOutlineCpuChip,
	HiOutlineFolder,
	HiOutlineKey,
	HiOutlineLink,
	HiOutlineLockClosed,
	HiOutlinePaintBrush,
	HiOutlinePuzzlePiece,
	HiOutlineShare,
	HiOutlineShieldCheck,
	HiOutlineSparkles,
	HiOutlineUser,
	HiOutlineUserGroup,
	HiOutlineViewColumns,
} from "react-icons/hi2";
import { LuBrain, LuGitBranch, LuKeyboard, LuMic } from "react-icons/lu";
import type { SettingsSection } from "renderer/stores/settings-state";

/**
 * Sidebar icons keyed by section. Kept beside the pure {@link SETTINGS_MANIFEST}
 * data module so the manifest stays JSX-free and unit-testable, while the icons
 * (which pull in the renderer JSX runtime) live here.
 */
export const SETTINGS_SECTION_ICONS: Record<SettingsSection, React.ReactNode> =
	{
		account: <HiOutlineUser className="h-4 w-4" />,
		appearance: <HiOutlinePaintBrush className="h-4 w-4" />,
		surfaces: <HiOutlineViewColumns className="h-4 w-4" />,
		ringtones: <HiOutlineBell className="h-4 w-4" />,
		behavior: <HiOutlineSparkles className="h-4 w-4" />,
		keyboard: <LuKeyboard className="h-4 w-4" />,
		voice: <LuMic className="h-4 w-4" />,
		git: <LuGitBranch className="h-4 w-4" />,
		agents: <HiOutlineCpuChip className="h-4 w-4" />,
		terminal: <HiOutlineCommandLine className="h-4 w-4" />,
		links: <HiOutlineLink className="h-4 w-4" />,
		shares: <HiOutlineShare className="h-4 w-4" />,
		models: <LuBrain className="h-4 w-4" />,
		organization: <HiOutlineBuildingOffice2 className="h-4 w-4" />,
		teams: <HiOutlineUserGroup className="h-4 w-4" />,
		project: <HiOutlineFolder className="h-4 w-4" />,
		hosts: <HiOutlineComputerDesktop className="h-4 w-4" />,
		integrations: <HiOutlinePuzzlePiece className="h-4 w-4" />,
		apikeys: <HiOutlineKey className="h-4 w-4" />,
		security: <HiOutlineLockClosed className="h-4 w-4" />,
		permissions: <HiOutlineShieldCheck className="h-4 w-4" />,
		experimental: <HiOutlineBeaker className="h-4 w-4" />,
	};
