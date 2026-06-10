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
		content:
			"Только что понял, что с 26 декабря всю свою работу делаю в @rox_sh.",
		originalContent:
			"Just realized that I have done all my work in @rox_sh since Dec 26.",
		author: "Abhi Aiyer",
		handle: "@abhiaiyer",
		role: "Сооснователь и CTO в Mastra",
		avatar: "https://unavatar.io/twitter/abhiaiyer",
		url: "https://x.com/abhiaiyer/status/2013782002332283180",
	},
	{
		id: "2",
		content:
			"Ого, @rox_sh просто невероятно хорош!\n\nВот такого опыта с CLI-агентами я и ждал.",
		originalContent:
			"Oh snap @rox_sh is soooooo damn good!\n\nNow THIS is the experience I've been wanting for CLI agents!",
		author: "Chris Laupama",
		handle: "@chrislaupama",
		role: "Руководитель TypeScript-направления в Webflow",
		avatar: "https://unavatar.io/twitter/chrislaupama",
		url: "https://x.com/chrislaupama/status/2011148329443607037",
	},
	{
		id: "3",
		content:
			"Черт, @rox_sh правда очень крут. Стоит попробовать.\n\nworktree работают без боли\ncmd + t автоматически открывает Claude Code\nизменения в git видно прямо внутри\nзакрытие ноутбука не убивает сессии",
		originalContent:
			"Damn @rox_sh is really cool. You should try it.\n\nworktrees are a breeze\ncmd + t auto opens Claude Code\nyou can view git changes within itself\nclosing a laptop doesn't kill the sessions",
		author: "Gregor Zunic",
		handle: "@gregpr07",
		role: "Сооснователь и CTO в Browser Use",
		avatar: "https://unavatar.io/twitter/gregpr07",
		url: "https://x.com/gregpr07/status/2013038355630432742",
	},
	{
		id: "4",
		content: "Если вы не пользуетесь @rox_sh, в 2026 году вы уже отстаете.",
		originalContent:
			"if you're not using @rox_sh, you're getting left behind in 2026",
		author: "Zach Dive",
		handle: "@zachdive",
		role: "Сооснователь и CEO в Adam",
		avatar: "https://unavatar.io/twitter/zachdive",
		url: "https://x.com/zachdive/status/2014038312508424597",
	},
	{
		id: "5",
		content:
			"Раньше пользовался Warp, но теперь @rox_sh стал моим основным терминалом.",
		originalContent:
			"Was using Warp, but now @rox_sh has become my primary terminal",
		author: "Eric Clemmons",
		handle: "@ericclemmons",
		role: "Ведущий инженер в Cloudflare",
		avatar: "https://unavatar.io/twitter/ericclemmons",
		url: "https://x.com/ericclemmons/status/2013413118467056004",
	},
	{
		id: "6",
		content:
			"Если вам ближе GUI-подход к параллельной работе нескольких агентов, похоже, @rox_sh отлично с этим справляется.",
		originalContent:
			"If you prefer a more GUI-oriented approach to multiple agents in parallel, it seems like @rox_sh is doing a tremendous job.",
		author: "Felipe Coury",
		handle: "@fcoury",
		role: "Codex в OpenAI",
		avatar: "https://unavatar.io/twitter/fcoury",
		url: "https://x.com/fcoury/status/2010477904472281220",
	},
	{
		id: "8",
		content:
			"@rox_sh - мощный продукт. Люблю открытый исходный код, потому что мне не нужно ждать, пока кто-то другой исправит баги.",
		originalContent:
			"@rox_sh is a sick product - love OS since I don't have to wait for someone else to fix bugs",
		author: "Chase McDougall",
		handle: "@ChaseMcDou",
		role: "Инженер-основатель в Decoda Health",
		avatar: "https://unavatar.io/twitter/ChaseMcDou",
		url: "https://x.com/ChaseMcDou/status/2013458004977373643",
	},
	{
		id: "9",
		content:
			"С онбординга не было ни дня, чтобы я не пользовался Rox.\n\nПолная смена парадигмы того, как я использую ИИ для кода.",
		originalContent:
			"hasn't been a day i haven't used rox since onboarding\n\ncomplete paradigm shift on how i use ai to code",
		author: "Leo",
		handle: "@LeosReal",
		role: "Сооснователь и CTO в Outlit",
		avatar: "https://unavatar.io/twitter/LeosReal",
		url: "https://x.com/LeosReal/status/2027306293858586745",
	},
	{
		id: "10",
		content:
			"Пробовал разные GUI-инструменты для git worktree и агентов - Conductor, Vibe Kanban, Agentastic, Crystal, FleetCode, Emdash, Sculptor, но Rox лучше всего совпал с моим вкусом.",
		originalContent:
			"试了各种 GUI 的 git worktree + agent 工具，Conductor、Vibe Kanban、Agentastic、Crystal、FleetCode、Emdash、Sculptor，还是 Rox 最合我的胃口",
		author: "Iven",
		handle: "@ivenvd",
		role: "Инженер в Paraflow",
		avatar: "https://unavatar.io/twitter/ivenvd",
		url: "https://x.com/ivenvd/status/2011738469610242559",
	},
	{
		id: "11",
		content:
			"Rox теперь стал моим инструментом по умолчанию, так что продолжайте в том же духе.",
		originalContent:
			"rox became my default tools now so keep the great work folks",
		author: "Vlad Arbatov",
		handle: "@vladzima",
		role: "Инженер-основатель в Loyal",
		avatar: "https://unavatar.io/twitter/vladzima",
		url: "https://x.com/vladzima/status/2032306550073610246",
	},
	{
		id: "12",
		content:
			"Только что начал пользоваться удаленным рабочим столом вместо ssh, просто чтобы запускать @rox_sh на своем Mac mini с MacBook Pro.\n\nНа наших глазах рождается продукт поколения, запомните мои слова.",
		originalContent:
			"just started using remote desktop instead of ssh just to be able to use @rox_sh on my mac mini from my macbook pro\n\ngenerational product in the making, mark my words",
		author: "Elias Ståvik",
		handle: "@eliasstravik",
		role: "Основатель Cleanroom",
		avatar: "https://unavatar.io/twitter/eliasstravik",
		url: "https://x.com/eliasstravik/status/2020580091449708978",
	},
];
