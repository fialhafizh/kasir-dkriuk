type Baris = { outlet_id: string; satuan_beli_id: string; harga: number };

export function rencanaHargaBeli(
	data: Record<string, Record<string, number>>,
	outlets: { id: string; kode: string }[],
	satuan: { id: string; kode: string }[]
): { baris: Baris[]; error: string[] } {
	const o = new Map(outlets.map((x) => [x.kode, x.id]));
	const s = new Map(satuan.map((x) => [x.kode, x.id]));
	const baris: Baris[] = [];
	const error: string[] = [];
	for (const [kodeOutlet, daftar] of Object.entries(data)) {
		const outletId = o.get(kodeOutlet);
		if (!outletId) {
			error.push(`Outlet tidak dikenal: ${kodeOutlet}`);
			continue;
		}
		for (const [kodeSatuan, harga] of Object.entries(daftar)) {
			const satuanId = s.get(kodeSatuan);
			if (!satuanId) error.push(`Satuan beli tidak dikenal: ${kodeSatuan}`);
			else if (!Number.isSafeInteger(harga) || harga < 0 || harga > 100_000_000) error.push(`Harga tidak sah untuk ${kodeOutlet}/${kodeSatuan}: ${harga}`);
			else baris.push({ outlet_id: outletId, satuan_beli_id: satuanId, harga });
		}
	}
	return { baris, error };
}
