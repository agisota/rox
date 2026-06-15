import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { HiOutlinePlus } from "react-icons/hi2";

export interface CandidateRow {
	userId: string;
	name: string;
	email: string;
}

interface AddMemberDropdownProps {
	candidates: CandidateRow[];
	onPick: (candidate: CandidateRow) => void;
	pendingUserId?: string | null;
}

export function AddMemberDropdown({
	candidates,
	onPick,
	pendingUserId = null,
}: AddMemberDropdownProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="sm" variant="outline" disabled={pendingUserId !== null}>
					<HiOutlinePlus className="h-4 w-4 mr-1" />
					{pendingUserId ? "Добавляем..." : "Добавить участника"}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				{candidates.length === 0 ? (
					<div className="px-2 py-6 text-center text-xs text-muted-foreground">
						Все участники организации уже добавлены к этому хосту.
					</div>
				) : (
					candidates.map((candidate) => {
						const isPending = pendingUserId === candidate.userId;
						return (
							<DropdownMenuItem
								key={candidate.userId}
								disabled={isPending}
								onSelect={() => onPick(candidate)}
							>
								<div className="flex flex-col">
									<span className="text-sm">
										{isPending ? "Добавляем..." : candidate.name}
									</span>
									<span className="text-xs text-muted-foreground">
										{candidate.email}
									</span>
								</div>
							</DropdownMenuItem>
						);
					})
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/settings/organization">
						<HiOutlinePlus className="h-4 w-4" />
						<span>Пригласить в организацию...</span>
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
