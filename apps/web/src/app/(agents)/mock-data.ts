export type MockSession = {
	id: string;
	workspaceId: string;
	title: string;
	status: "completed" | "running" | "failed";
	repoName: string;
	modelName: string;
	modelProvider: string;
	additions: number;
	deletions: number;
	createdAt: Date;
};

export type MockMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt: Date;
};

export type MockRepo = {
	id: string;
	name: string;
	fullName: string;
};

export type MockModel = {
	id: string;
	name: string;
	provider: string;
};

export type MockWorkspace = {
	id: string;
	name: string;
	repoId: string;
	repoFullName: string;
	branch: string;
};

export type MockDiffFile = {
	filePath: string;
	oldString: string;
	newString: string;
};

export const mockModels: MockModel[] = [
	{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
	{ id: "gpt-4o", name: "GPT-4o", provider: "openai" },
	{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
	{ id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic" },
];

export const mockRepos: MockRepo[] = [
	{ id: "1", name: "superset", fullName: "supersetai/superset" },
	{ id: "2", name: "docs", fullName: "supersetai/docs" },
	{ id: "3", name: "marketing", fullName: "supersetai/marketing" },
	{ id: "4", name: "api-server", fullName: "supersetai/api-server" },
	{ id: "5", name: "mobile-app", fullName: "supersetai/mobile-app" },
];

export const mockBranches = [
	"main",
	"dev",
	"feature/auth",
	"fix/bug-123",
	"staging",
];

export const mockWorkspaces: MockWorkspace[] = [
	{
		id: "workspace-1",
		name: "Основной Rox",
		repoId: "1",
		repoFullName: "supersetai/superset",
		branch: "main",
	},
	{
		id: "workspace-2",
		name: "Обновление маркетинга",
		repoId: "3",
		repoFullName: "supersetai/marketing",
		branch: "feature/auth",
	},
	{
		id: "workspace-3",
		name: "Stripe API",
		repoId: "4",
		repoFullName: "supersetai/api-server",
		branch: "dev",
	},
	{
		id: "workspace-4",
		name: "Доработка документации",
		repoId: "2",
		repoFullName: "supersetai/docs",
		branch: "staging",
	},
	{
		id: "workspace-5",
		name: "Мобильный CI",
		repoId: "5",
		repoFullName: "supersetai/mobile-app",
		branch: "main",
	},
];

export const mockSessions: MockSession[] = [
	{
		id: "session-1",
		workspaceId: "workspace-1",
		title: "Добавить сценарий аутентификации пользователя",
		status: "completed",
		repoName: "supersetai/superset",
		modelName: "Claude Sonnet 4.5",
		modelProvider: "anthropic",
		additions: 342,
		deletions: 28,
		createdAt: new Date(Date.now() - 1000 * 60 * 30),
	},
	{
		id: "session-2",
		workspaceId: "workspace-2",
		title: "Исправить адаптивную верстку навигации",
		status: "running",
		repoName: "supersetai/marketing",
		modelName: "Claude Sonnet 4.5",
		modelProvider: "anthropic",
		additions: 45,
		deletions: 12,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
	},
	{
		id: "session-3",
		workspaceId: "workspace-3",
		title: "Реализовать webhook-обработчики для Stripe",
		status: "completed",
		repoName: "supersetai/api-server",
		modelName: "GPT-4o",
		modelProvider: "openai",
		additions: 567,
		deletions: 89,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
	},
	{
		id: "session-4",
		workspaceId: "workspace-4",
		title: "Обновить README новой API-документацией",
		status: "failed",
		repoName: "supersetai/docs",
		modelName: "Claude Sonnet 4.5",
		modelProvider: "anthropic",
		additions: 23,
		deletions: 5,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
	},
	{
		id: "session-5",
		workspaceId: "workspace-3",
		title: "Отрефакторить пул соединений с базой данных",
		status: "completed",
		repoName: "supersetai/api-server",
		modelName: "Gemini 2.5 Pro",
		modelProvider: "google",
		additions: 234,
		deletions: 178,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
	},
	{
		id: "session-6",
		workspaceId: "workspace-1",
		title: "Добавить компонент переключения темной темы",
		status: "completed",
		repoName: "supersetai/superset",
		modelName: "Claude Opus 4",
		modelProvider: "anthropic",
		additions: 156,
		deletions: 34,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
	},
	{
		id: "session-7",
		workspaceId: "workspace-5",
		title: "Настроить CI/CD-пайплайн с GitHub Actions",
		status: "completed",
		repoName: "supersetai/mobile-app",
		modelName: "GPT-4o",
		modelProvider: "openai",
		additions: 89,
		deletions: 0,
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 35),
	},
];

export function getDefaultMockWorkspace(): MockWorkspace {
	return mockWorkspaces[0] as MockWorkspace;
}

export function getMockWorkspaceById(
	workspaceId: string,
): MockWorkspace | undefined {
	return mockWorkspaces.find((workspace) => workspace.id === workspaceId);
}

export function getMockSessionsByWorkspaceId(
	workspaceId: string,
): MockSession[] {
	return mockSessions.filter((session) => session.workspaceId === workspaceId);
}

export function getLatestMockSessionByWorkspaceId(
	workspaceId: string,
): MockSession | undefined {
	const sessions = getMockSessionsByWorkspaceId(workspaceId);

	return sessions.reduce<MockSession | undefined>((latest, session) => {
		if (!latest || session.createdAt > latest.createdAt) {
			return session;
		}

		return latest;
	}, undefined);
}

export function getMockSessionById(sessionId: string): MockSession | undefined {
	return mockSessions.find((session) => session.id === sessionId);
}

export const mockMessages: MockMessage[] = [
	{
		id: "msg-1",
		role: "user",
		content:
			"Добавь сценарий аутентификации пользователя на better-auth. Включи страницы входа, регистрации и сброса пароля.",
		createdAt: new Date(Date.now() - 1000 * 60 * 35),
	},
	{
		id: "msg-2",
		role: "assistant",
		content:
			"Я реализую полный сценарий аутентификации на better-auth. Начну с настройки auth-конфигурации и создания нужных страниц.\n\n**План:**\n1. Настроить better-auth в API\n2. Создать страницу входа по email/password\n3. Создать страницу регистрации с валидацией\n4. Добавить сценарий сброса пароля\n5. Настроить middleware для защищенных маршрутов\n\nНачну с auth-конфигурации...",
		createdAt: new Date(Date.now() - 1000 * 60 * 34),
	},
	{
		id: "msg-3",
		role: "user",
		content:
			"Выглядит хорошо! Можешь еще добавить поддержку OAuth для GitHub и Google?",
		createdAt: new Date(Date.now() - 1000 * 60 * 31),
	},
	{
		id: "msg-4",
		role: "assistant",
		content:
			"Добавлю OAuth-провайдеры для GitHub и Google. Обновлю auth-конфигурацию и добавлю OAuth-кнопки на страницы входа и регистрации.\n\nЧто меняю:\n- Добавляю конфиги провайдеров GitHub и Google\n- Создаю OAuth callback-маршруты\n- Добавляю кнопки социального входа с нужными иконками",
		createdAt: new Date(Date.now() - 1000 * 60 * 30),
	},
];

export const mockDiffFiles: MockDiffFile[] = [
	{
		filePath: "src/auth/config.ts",
		oldString:
			'import { betterAuth } from "better-auth";\n\nexport const auth = betterAuth({\n  database: db,\n});',
		newString:
			'import { betterAuth } from "better-auth";\nimport { github, google } from "better-auth/providers";\n\nexport const auth = betterAuth({\n  database: db,\n  providers: [\n    github({\n      clientId: process.env.GITHUB_CLIENT_ID!,\n      clientSecret: process.env.GITHUB_CLIENT_SECRET!,\n    }),\n    google({\n      clientId: process.env.GOOGLE_CLIENT_ID!,\n      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,\n    }),\n  ],\n});',
	},
	{
		filePath: "src/app/sign-in/page.tsx",
		oldString: "",
		newString:
			'export default function SignInPage() {\n  return (\n    <div className="flex min-h-screen items-center justify-center">\n      <SignInForm />\n    </div>\n  );\n}',
	},
	{
		filePath: "src/app/sign-up/page.tsx",
		oldString: "",
		newString:
			'export default function SignUpPage() {\n  return (\n    <div className="flex min-h-screen items-center justify-center">\n      <SignUpForm />\n    </div>\n  );\n}',
	},
];

export function getMockMessagesForSession(_sessionId: string): MockMessage[] {
	return mockMessages;
}

export function getMockDiffFilesForSession(_sessionId: string): MockDiffFile[] {
	return mockDiffFiles;
}
