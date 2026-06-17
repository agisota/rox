/**
 * Curated motivational quotes for the loading / focus screen
 * (custom-loading-screens epic).
 *
 * Kept intentionally short and high-contrast so they read well as full-screen
 * cinematic cards. Only well-known lines are attributed; proverbial/anonymous
 * lines are left without an author to avoid misattribution. `emphasis` (when
 * set) must be a verbatim substring of `text`.
 */

import type { Quote } from "./types";

export const QUOTES: readonly Quote[] = [
	{
		id: "success-decision",
		text: "Success is a decision.",
		emphasis: "decision",
	},
	{
		id: "blind-people",
		text: "Stop letting blind people tell you what you see.",
	},
	{
		id: "progress-or-excuses",
		text: "There are only two options: make progress or make excuses.",
		emphasis: "make progress",
	},
	{
		id: "listen-to-understand",
		text: "Most people do not listen with the intent to understand; they listen with the intent to reply.",
		author: "Stephen R. Covey",
	},
	{
		id: "discipline-bridge",
		text: "Discipline is the bridge between goals and accomplishment.",
		author: "Jim Rohn",
	},
	{
		id: "start-where-you-are",
		text: "Start where you are. Use what you have. Do what you can.",
		author: "Arthur Ashe",
	},
	{
		id: "comfort-zone",
		text: "Everything you want is on the other side of fear.",
		emphasis: "the other side of fear",
	},
	{
		id: "compound",
		text: "Small steps, taken daily, compound into something unstoppable.",
		emphasis: "compound",
	},
	{
		id: "do-the-work",
		text: "The work you avoid is usually the work that matters most.",
	},
	{
		id: "energy-attention",
		text: "Where attention goes, energy flows.",
	},
	{
		id: "calm-mind",
		text: "A calm mind brings inner strength and self-confidence.",
		author: "Dalai Lama",
	},
	{
		id: "become",
		text: "Your future is created by what you do today, not tomorrow.",
		emphasis: "today",
	},
	{
		id: "fall-rise",
		text: "Fall seven times, stand up eight.",
	},
	{
		id: "focus-is-saying-no",
		text: "Focus is about saying no to a thousand good things.",
		emphasis: "saying no",
	},
	{
		id: "ship-it",
		text: "Done is better than perfect.",
	},
	{
		id: "show-up",
		text: "Half of success is simply showing up, again and again.",
		emphasis: "showing up",
	},
];
