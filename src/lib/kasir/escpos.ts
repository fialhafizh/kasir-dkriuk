const ESC = 0x1b;
const LF = 0x0a;

/** Perintah ESC/POS paling dasar yang didukung hampir semua printer thermal 58 mm. */
export function encodeStruk(baris: string[]): Uint8Array {
	const out: number[] = [ESC, 0x40]; // inisialisasi
	for (const b of baris) {
		for (const ch of b) {
			const c = ch.charCodeAt(0);
			out.push(c >= 0x20 && c <= 0x7e ? c : 0x3f);
		}
		out.push(LF);
	}
	out.push(ESC, 0x64, 4); // umpan 4 baris agar mudah disobek
	return new Uint8Array(out);
}

/** BLE mengirim data dalam paket kecil. */
export function potong(bytes: Uint8Array, ukuran: number): Uint8Array<ArrayBuffer>[] {
	// slice() selalu membuat ArrayBuffer baru (dibutuhkan Web Bluetooth).
	const hasil: Uint8Array<ArrayBuffer>[] = [];
	for (let i = 0; i < bytes.length; i += ukuran) hasil.push(bytes.slice(i, i + ukuran));
	return hasil;
}

/** Cadangan: aplikasi Android RawBT mencetak lewat Bluetooth klasik. */
export function urlRawBT(bytes: Uint8Array): string {
	let biner = '';
	for (const x of bytes) biner += String.fromCharCode(x);
	return `rawbt:base64,${btoa(biner)}`;
}

/**
 * Banyak printer BLE murah hanya menerima 20 byte per tulisan dan buffernya kecil:
 * kirim per paket kecil dengan jeda singkat agar struk tidak acak/terpotong.
 */
export async function kirimBertahap(
	bytes: Uint8Array,
	tulis: (paket: Uint8Array<ArrayBuffer>) => Promise<void>,
	opsi: { ukuran?: number; jedaMs?: number; tunda?: (ms: number) => Promise<void> } = {}
): Promise<void> {
	const { ukuran = 20, jedaMs = 15, tunda = (ms) => new Promise<void>((r) => setTimeout(r, ms)) } = opsi;
	const paket = potong(bytes, ukuran);
	for (const [i, p] of paket.entries()) {
		await tulis(p);
		if (i < paket.length - 1) await tunda(jedaMs);
	}
}
