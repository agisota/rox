"use client";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@rox/ui/breadcrumb";
import { Fragment } from "react";
import { breadcrumbPath, type FolderCrumb } from "../../utils/breadcrumbPath";

interface BreadcrumbsProps {
	stack: FolderCrumb[];
	onNavigate: (folderId: string | null) => void;
}

/** Drive folder breadcrumb trail (root → … → current). */
export function Breadcrumbs({ stack, onNavigate }: BreadcrumbsProps) {
	const segments = breadcrumbPath(stack);

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{segments.map((segment, index) => (
					<Fragment key={segment.id ?? "__root__"}>
						{index > 0 ? <BreadcrumbSeparator /> : null}
						<BreadcrumbItem>
							{segment.isCurrent ? (
								<BreadcrumbPage className="max-w-[12rem] truncate">
									{segment.label}
								</BreadcrumbPage>
							) : (
								<BreadcrumbLink
									asChild
									className="max-w-[12rem] cursor-pointer truncate"
								>
									<button type="button" onClick={() => onNavigate(segment.id)}>
										{segment.label}
									</button>
								</BreadcrumbLink>
							)}
						</BreadcrumbItem>
					</Fragment>
				))}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
