"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

export function LegalContactsSpoiler() {
	const [open, setOpen] = useState(false);

	return (
		<section className="border-t border-border pt-10">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="group flex w-full items-center justify-between gap-4 text-left"
				aria-expanded={open}
			>
				<span className="text-lg font-medium text-foreground">
					Контакты и реквизиты
				</span>
				<ChevronDown
					className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
						open ? "rotate-180" : ""
					}`}
					aria-hidden="true"
				/>
			</button>

			{open ? (
				<div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
					<div>
						<p className="text-xs uppercase tracking-wider text-muted-foreground/70">
							Название
						</p>
						<p className="mt-1 text-foreground">ИП Барчук Игорь Вадимович</p>
					</div>
					<div>
						<p className="text-xs uppercase tracking-wider text-muted-foreground/70">
							ИНН
						</p>
						<p className="mt-1 font-mono text-foreground">772415014590</p>
					</div>
					<div>
						<p className="text-xs uppercase tracking-wider text-muted-foreground/70">
							ОГРН
						</p>
						<p className="mt-1 font-mono text-foreground">326774600421177</p>
					</div>
					<div>
						<p className="text-xs uppercase tracking-wider text-muted-foreground/70">
							E-mail
						</p>
						<a
							href="mailto:ask@rox.one"
							className="mt-1 inline-block text-foreground underline-offset-4 transition-colors hover:underline"
						>
							ask@rox.one
						</a>
					</div>
				</div>
			) : null}
		</section>
	);
}
