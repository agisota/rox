"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
	HiOutlineCodeBracket,
	HiOutlineServerStack,
	HiOutlineSignal,
} from "react-icons/hi2";
import { GlossaryText } from "@/components/GlossaryTerm";

const SECURITY_FEATURES: {
	icon: ReactNode;
	title: string;
	description: string;
}[] = [
	{
		icon: <HiOutlineCodeBracket className="w-5 h-5 text-foreground/70" />,
		title: "Исходный код доступен",
		description:
			"Полный исходный код доступен на GitHub под Elastic License 2.0 (ELv2). Изучайте, проверяйте и улучшайте код: никаких черных ящиков и скрытой функциональности.",
	},
	{
		icon: <HiOutlineServerStack className="w-5 h-5 text-foreground/70" />,
		title: "Сначала локальная работа",
		description:
			"Ваш код остается на вашей машине. Работайте без подключения к интернету: вся обработка происходит локально.",
	},
	{
		icon: <HiOutlineSignal className="w-5 h-5 text-foreground/70" />,
		title: "Локальный контроль",
		description:
			"Rox запускается на вашей машине и позволяет самостоятельно выбирать, каких агентов и какие внешние сервисы подключать.",
	},
];

export function SecuritySection() {
	return (
		<section className="relative py-24 px-8 lg:px-[30px]">
			<div className="max-w-7xl mx-auto">
				{/* Heading */}
				<motion.div
					className="mb-16"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
				>
					<div className="space-y-1">
						<h2 className="text-2xl sm:text-3xl font-mono tracking-[-0.01em] text-foreground">
							Приватность по умолчанию
						</h2>
						<h2 className="text-lg sm:text-xl font-light tracking-[-0.03em] text-muted-foreground max-w-[700px]">
							<GlossaryText text="Ваш код по умолчанию остается локальным, а подключенные сервисы всегда находятся под вашим явным контролем." />
						</h2>
					</div>
				</motion.div>

				{/* Features Grid */}
				<motion.div
					className="grid grid-cols-1 md:grid-cols-3 gap-6"
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5, delay: 0.2 }}
				>
					{SECURITY_FEATURES.map((feature, index) => (
						<motion.div
							key={feature.title}
							className="relative p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm"
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: 0.1 * index }}
						>
							<div className="mb-4 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-muted border border-border">
								{feature.icon}
							</div>
							<h3 className="text-lg font-medium text-foreground/90 mb-2">
								{feature.title}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								<GlossaryText text={feature.description} />
							</p>
						</motion.div>
					))}
				</motion.div>
			</div>
		</section>
	);
}
