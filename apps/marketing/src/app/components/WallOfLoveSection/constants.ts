export interface Testimonial {
	id: string;
	content: string;
	originalContent?: string;
	author: string;
	handle: string;
	role?: string;
	avatar: string;
	url: string;
}

export const TESTIMONIALS: Testimonial[] = [
	{
		id: "1",
		content: "Только что понял, что с 26 декабря делаю всю работу в Rox.",
		author: "Abhi Aiyer",
		handle: "@abhiaiyer",
		role: "Сооснователь и CTO в Mastra",
		avatar: "https://unavatar.io/twitter/abhiaiyer",
		url: "https://x.com/abhiaiyer/status/2013782002332283180",
	},
	{
		id: "2",
		content:
			"Ого, Rox настолько хорош!\n\nВот именно такого опыта я и хотел для CLI-агентов!",
		author: "Chris Laupama",
		handle: "@chrislaupama",
		role: "TS Lead в Webflow",
		avatar: "https://unavatar.io/twitter/chrislaupama",
		url: "https://x.com/chrislaupama/status/2011148329443607037",
	},
	{
		id: "3",
		content:
			"Черт, Rox реально классный. Попробуйте.\n\nworktree работают легко\ncmd + t автоматически открывает Claude Code\nможно смотреть git-изменения прямо внутри\nзакрытие ноутбука не убивает сессии",
		author: "Gregor Zunic",
		handle: "@gregpr07",
		role: "Сооснователь и CTO в Browser Use",
		avatar: "https://unavatar.io/twitter/gregpr07",
		url: "https://x.com/gregpr07/status/2013038355630432742",
	},
	{
		id: "4",
		content: "если вы не используете Rox, в 2026 году вы отстаете",
		author: "Zach Dive",
		handle: "@zachdive",
		role: "Сооснователь и CEO в Adam",
		avatar: "https://unavatar.io/twitter/zachdive",
		url: "https://x.com/zachdive/status/2014038312508424597",
	},
	{
		id: "5",
		content:
			"Раньше пользовался Warp, но теперь Rox стал моим основным Терминалом",
		author: "Eric Clemmons",
		handle: "@ericclemmons",
		role: "Principal Engineer в Cloudflare",
		avatar: "https://unavatar.io/twitter/ericclemmons",
		url: "https://x.com/ericclemmons/status/2013413118467056004",
	},
	{
		id: "6",
		content:
			"Если вам нужен более GUI-ориентированный подход к нескольким агентам параллельно, похоже, Rox отлично с этим справляется.",
		author: "Felipe Coury",
		handle: "@fcoury",
		role: "Codex в OpenAI",
		avatar: "https://unavatar.io/twitter/fcoury",
		url: "https://x.com/fcoury/status/2010477904472281220",
	},
	{
		id: "8",
		content:
			"Rox — мощный продукт. Люблю open source, потому что не нужно ждать, пока кто-то другой исправит баги",
		author: "Chase McDougall",
		handle: "@ChaseMcDou",
		role: "Founding Engineer в Decoda Health",
		avatar: "https://unavatar.io/twitter/ChaseMcDou",
		url: "https://x.com/ChaseMcDou/status/2013458004977373643",
	},
	{
		id: "9",
		content:
			"с онбординга не было ни дня, чтобы я не пользовался Rox\n\nполный сдвиг парадигмы в том, как я использую AI для кода",
		author: "Leo",
		handle: "@LeosReal",
		role: "Сооснователь и CTO в Outlit",
		avatar: "https://unavatar.io/twitter/LeosReal",
		url: "https://x.com/LeosReal/status/2027306293858586745",
	},
	{
		id: "10",
		content:
			"Пробовал разные GUI-инструменты для git worktree и агентов — Conductor, Vibe Kanban, Agentastic, Crystal, FleetCode, Emdash, Sculptor, — но Rox больше всего подходит моему вкусу",
		originalContent:
			"试了各种 GUI 的 git worktree + agent 工具，Conductor、Vibe Kanban、Agentastic、Crystal、FleetCode、Emdash、Sculptor，还是 Rox 最合我的胃口",
		author: "Iven",
		handle: "@ivenvd",
		role: "Engineer в Paraflow",
		avatar: "https://unavatar.io/twitter/ivenvd",
		url: "https://x.com/ivenvd/status/2011738469610242559",
	},
	{
		id: "11",
		content:
			"Rox теперь стал моим основным инструментом, продолжайте в том же духе",
		author: "Vlad Arbatov",
		handle: "@vladzima",
		role: "Founding Engineer в Loyal",
		avatar: "https://unavatar.io/twitter/vladzima",
		url: "https://x.com/vladzima/status/2032306550073610246",
	},
	{
		id: "12",
		content:
			"только что начал использовать remote desktop вместо ssh, просто чтобы пользоваться Rox на mac mini с macbook pro\n\nрождается продукт поколения, запомните мои слова",
		author: "Elias Ståvik",
		handle: "@eliasstravik",
		role: "Founder в Cleanroom",
		avatar: "https://unavatar.io/twitter/eliasstravik",
		url: "https://x.com/eliasstravik/status/2020580091449708978",
	},
];
