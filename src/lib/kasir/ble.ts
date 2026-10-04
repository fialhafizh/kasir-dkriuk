// Pemilihan layanan & karakteristik BLE untuk printer thermal murah (logika murni, teruji).

/** UUID 16-bit Bluetooth dalam bentuk lengkap huruf kecil (seperti yang dilaporkan Chrome). */
export function uuid16(n: number): string {
	return `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
}

// Urutan = prioritas. Chrome hanya mengizinkan layanan yang tercantum di sini.
export const LAYANAN_PRINTER: string[] = [
	uuid16(0x18f0),
	'49535343-fe7d-4ae5-8fa9-9fafd205e455',
	'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
	uuid16(0xff00),
	uuid16(0xffe0),
	uuid16(0xfee7),
	'6e400001-b5a3-f393-e0a9-e50e24dcca9e'
];

// Karakteristik data yang dikenal untuk tiap layanan di atas.
const DATA_DIKENAL = new Set([
	uuid16(0x2af1),
	'49535343-8841-43f4-a8d4-ecbe34729bb3',
	'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
	uuid16(0xff02),
	uuid16(0xffe1),
	uuid16(0xfec7),
	'6e400002-b5a3-f393-e0a9-e50e24dcca9e'
]);

export interface InfoKarakteristik {
	uuid: string;
	write: boolean;
	writeWithoutResponse: boolean;
}

export interface InfoLayanan {
	uuid: string;
	karakteristik: InfoKarakteristik[];
}

const bisaTulis = (c: InfoKarakteristik) => c.write || c.writeWithoutResponse;

/**
 * 1) karakteristik data yang dikenal, menurut urutan LAYANAN_PRINTER;
 * 2) bila tidak ada: karakteristik tulis pertama di layanan printer yang dikenal;
 * 3) bila tetap tidak ada: karakteristik tulis pertama di mana pun.
 */
export function pilihKarakteristik(layanan: InfoLayanan[]): InfoKarakteristik | null {
	const urut = [...layanan].sort((a, b) => peringkat(a.uuid) - peringkat(b.uuid));
	for (const l of urut) {
		const c = l.karakteristik.find((x) => DATA_DIKENAL.has(x.uuid.toLowerCase()) && bisaTulis(x));
		if (c) return c;
	}
	for (const l of urut.filter((x) => peringkat(x.uuid) < LAYANAN_PRINTER.length)) {
		const c = l.karakteristik.find(bisaTulis);
		if (c) return c;
	}
	for (const l of urut) {
		const c = l.karakteristik.find(bisaTulis);
		if (c) return c;
	}
	return null;
}

function peringkat(uuid: string): number {
	const i = LAYANAN_PRINTER.indexOf(uuid.toLowerCase());
	return i === -1 ? LAYANAN_PRINTER.length : i;
}
