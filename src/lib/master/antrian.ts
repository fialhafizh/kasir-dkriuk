/**
 * Penyimpan satu nilai: bila masih ada penyimpanan berjalan, nilai baru menunggu; nilai-nilai yang
 * datang selama menunggu digabung menjadi yang terakhir saja. Hasil akhir di server = nilai terakhir.
 */
export function antrianTerakhir<T>(kirim: (nilai: T) => Promise<void>): (nilai: T) => Promise<void> {
	let sedang: Promise<void> | null = null;
	let tunggu: { nilai: T; janji: Promise<void> } | null = null;

	function simpan(nilai: T): Promise<void> {
		if (!sedang) {
			sedang = kirim(nilai).finally(() => {
				sedang = null;
			});
			return sedang;
		}
		if (tunggu) {
			tunggu.nilai = nilai;
			return tunggu.janji;
		}
		const entri = { nilai, janji: Promise.resolve() };
		entri.janji = sedang
			.catch(() => {})
			.then(() => {
				tunggu = null;
				return simpan(entri.nilai);
			});
		tunggu = entri;
		return entri.janji;
	}

	return simpan;
}

/** Menjalankan tugas satu per satu sesuai urutan panggilan (mis. semua penyimpanan isi satu satuan beli). */
export function rantai(): <R>(tugas: () => Promise<R>) => Promise<R> {
	let ekor: Promise<unknown> = Promise.resolve();
	return <R>(tugas: () => Promise<R>): Promise<R> => {
		const hasil = ekor.then(tugas, tugas);
		ekor = hasil.catch(() => {});
		return hasil;
	};
}
