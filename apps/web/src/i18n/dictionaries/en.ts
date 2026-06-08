/**
 * English dictionary. This is the source-of-truth shape — every other locale is
 * typed against {@link Dictionary} (`typeof en`) so missing/extra keys fail
 * typecheck.
 */
export const en = {
	common: {
		save: "Save",
		cancel: "Cancel",
		create: "Create",
		delete: "Delete",
		loading: "Loading...",
		logOut: "Log out",
		accountMenu: "Account menu",
	},
	nav: {
		home: "Home",
		agents: "Agents",
		integrations: "Integrations",
		organization: "Organization",
		switchOrganization: "Switch organization",
	},
	auth: {
		welcomeBack: "Welcome back",
		signInToContinue: "Sign in to continue to Rox",
		createAnAccount: "Create an account",
		signUpToGetStarted: "Sign up to get started with Rox",
		signInWithGithub: "Sign in with GitHub",
		signInWithGoogle: "Sign in with Google",
		signUpWithGithub: "Sign up with GitHub",
		signUpWithGoogle: "Sign up with Google",
		signInAsDev: "Sign in as Local Admin (dev)",
		signingIn: "Signing in...",
		loading: "Loading...",
		signIn: "Sign in",
		signUp: "Sign up",
		dontHaveAccount: "Don't have an account?",
		alreadyHaveAccount: "Already have an account?",
		agreeToTerms: "By clicking continue, you agree to our",
		termsOfService: "Terms of Service",
		privacyPolicy: "Privacy Policy",
		and: "and",
		checkYourEmail: "Check your email",
		verificationSent: "We sent a verification link to",
		verificationInstructions:
			"Click it to activate your account, then sign in.",
		goToSignIn: "Go to sign in",
		signInFailed: "Failed to sign in. Please try again.",
		signUpFailed: "Failed to sign up. Please try again.",
	},
	settings: {
		title: "Settings",
		general: "General",
		billing: "Billing",
		language: "Language",
		theme: "Theme",
		profile: "Profile",
	},
	empty: {
		noResults: "No results found",
		noAgents: "No agents yet",
		nothingHere: "Nothing here yet",
	},
} as const;

export type Dictionary = {
	[K in keyof typeof en]: { [P in keyof (typeof en)[K]]: string };
};
