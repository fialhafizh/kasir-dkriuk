import { afterEach, describe, expect, it, vi } from 'vitest';
import { pasangPemulih } from './pemulih';

function lingkungan() {
	const win = new EventTarget();
	const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
	const auth = { offline: true, cobaLagi: vi.fn() };
	return { win, doc, auth };
}

describe('pasangPemulih (wifi tersambung tapi tanpa internet tidak memicu event online)', () => {
	afterEach(() => vi.useRealTimers());

	it('mencoba lagi berkala selama offline, berhenti mencoba saat online', () => {
		vi.useFakeTimers();
		const { win, doc, auth } = lingkungan();
		const lepas = pasangPemulih(auth, win, doc, 20_000);
		vi.advanceTimersByTime(20_000);
		expect(auth.cobaLagi).toHaveBeenCalledTimes(1);
		auth.offline = false;
		vi.advanceTimersByTime(60_000);
		expect(auth.cobaLagi).toHaveBeenCalledTimes(1);
		lepas();
	});

	it('event online & layar kembali terlihat memicu coba lagi; lepas() menghentikan semuanya', () => {
		vi.useFakeTimers();
		const { win, doc, auth } = lingkungan();
		const lepas = pasangPemulih(auth, win, doc, 20_000);
		win.dispatchEvent(new Event('online'));
		doc.dispatchEvent(new Event('visibilitychange'));
		expect(auth.cobaLagi).toHaveBeenCalledTimes(2);
		doc.visibilityState = 'hidden';
		doc.dispatchEvent(new Event('visibilitychange'));
		expect(auth.cobaLagi).toHaveBeenCalledTimes(2);
		lepas();
		win.dispatchEvent(new Event('online'));
		vi.advanceTimersByTime(60_000);
		expect(auth.cobaLagi).toHaveBeenCalledTimes(2);
	});
});
