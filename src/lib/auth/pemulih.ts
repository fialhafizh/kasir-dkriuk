// Memulihkan status offline: event "online" saja tidak cukup (wifi tersambung tanpa internet tidak memicunya).

interface BisaPulih {
	readonly offline: boolean;
	cobaLagi(): void;
}

/** Coba lagi saat online, saat layar kembali terlihat, dan berkala selama offline. Mengembalikan fungsi pelepas. */
export function pasangPemulih(
	auth: BisaPulih,
	win: EventTarget,
	doc: EventTarget & { visibilityState: DocumentVisibilityState },
	jedaMs = 20_000
): () => void {
	const coba = () => {
		if (auth.offline) auth.cobaLagi();
	};
	const online = () => auth.cobaLagi();
	const terlihat = () => {
		if (doc.visibilityState === 'visible') coba();
	};
	win.addEventListener('online', online);
	doc.addEventListener('visibilitychange', terlihat);
	const t = setInterval(coba, jedaMs);
	return () => {
		win.removeEventListener('online', online);
		doc.removeEventListener('visibilitychange', terlihat);
		clearInterval(t);
	};
}
