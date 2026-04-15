import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BANNER_LINES = String.raw` `.split("\n").slice(1, -1);

const DEFAULT_VERSE = "Trust in the LORD with all your heart and lean not on your own understanding — Proverbs 3:5";
const VERSE_CACHE_DIR = path.join(os.homedir(), ".pi", "agent");
const VERSE_CACHE_FILE = path.join(VERSE_CACHE_DIR, "block-pi-verse.json");
let verseOfDay = DEFAULT_VERSE;

function stripHtml(text: string): string {
	return text.replace(/<[^>]+>/g, "");
}

function compactText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxChars: number): string {
	if (maxChars <= 0 || text.length <= maxChars) return text;
	return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function todayKey(): string {
	return new Date().toISOString().slice(0, 10);
}

type VerseCache = {
	date: string;
	verse: string;
};

async function loadCachedVerse(): Promise<string | null> {
	try {
		const raw = await fs.readFile(VERSE_CACHE_FILE, "utf8");
		const parsed = JSON.parse(raw) as Partial<VerseCache>;
		if (parsed?.date === todayKey() && typeof parsed.verse === "string" && parsed.verse.trim().length > 0) {
			return parsed.verse.trim();
		}
	} catch {
		// ignore cache misses and parse errors
	}
	return null;
}

async function saveCachedVerse(verse: string): Promise<void> {
	try {
		await fs.mkdir(VERSE_CACHE_DIR, { recursive: true });
		const payload: VerseCache = { date: todayKey(), verse };
		await fs.writeFile(VERSE_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	} catch {
		// ignore cache write failures
	}
}

function formatVerse(raw: unknown): string | null {
	if (!raw || typeof raw !== "object") return null;
	const entry = raw as Record<string, unknown>;
	const book = typeof entry.bookname === "string" ? entry.bookname : "";
	const chapter = typeof entry.chapter === "string" || typeof entry.chapter === "number" ? String(entry.chapter) : "";
	const verse = typeof entry.verse === "string" || typeof entry.verse === "number" ? String(entry.verse) : "";
	const text = typeof entry.text === "string" ? compactText(stripHtml(entry.text)) : "";
	if (!book || !chapter || !verse || !text) return null;
	return `“${text}” — ${book} ${chapter}:${verse}`;
}

async function loadVerseOfDay(): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);

	try {
		const response = await fetch("https://labs.bible.org/api/?passage=votd&type=json", {
			signal: controller.signal,
		});
		if (!response.ok) return null;

		const data = (await response.json()) as unknown;
		if (!Array.isArray(data) || data.length === 0) return null;
		return formatVerse(data[0]);
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function buildBanner(theme: Theme, width: number): string[] {
	const verse = theme.fg("muted", truncate(verseOfDay, Math.max(20, width - 4)));
	return [...BANNER_LINES.map((line) => theme.fg("accent", line)), "", verse, ""];
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		const setBanner = () => {
			ctx.ui.setHeader((_tui, theme) => ({
				render(width: number): string[] {
					return buildBanner(theme, width);
				},
				invalidate() {},
			}));
		};

		const cached = await loadCachedVerse();
		if (cached) verseOfDay = cached;
		setBanner();

		if (cached) return;

		const verse = await loadVerseOfDay();
		if (verse) {
			verseOfDay = verse;
			await saveCachedVerse(verse);
			setBanner();
		}
	});

	pi.registerCommand("builtin-header", {
		description: "Restore the built-in startup header",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("Built-in header restored", "info");
		},
	});
}
