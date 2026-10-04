// Satu transaksi kasir dari tekan Bayar sampai tercatat: id idempoten, kegagalan jaringan, struk dari data server.
import { sidikTransaksi } from './cetak.ts';
import { totalKeranjang } from './keranjang.ts';
import type { BarisKeranjang, HasilJual, Metode, PenjualanRiwayat } from './types.ts';

export interface KirimanJual {
	id: string;
	outlet_id: string;
	metode: Metode;
	diterima?: number;
	item: { menu_id: string; qty: number }[];
}

export interface ApiTransaksi {
	catat: (p: KirimanJual) => Promise<HasilJual>;
	muat: (id: string) => Promise<PenjualanRiwayat | null>;
}

export interface HasilBayar {
	hasil: HasilJual;
	/** Data tersimpan di server bila struk harus dibangun darinya (kiriman ulang / harga berubah). */
	tersimpan: PenjualanRiwayat | null;
	hargaBerubah: boolean;
	peringatan: string[];
}

export class Transaksi {
	#buatId: () => string;
	#id: string;
	// Sidik isi saat pembayaran terakhir gagal (mungkin sebenarnya sudah tercatat di server).
	#sidikGagal: string | null = null;

	constructor(buatId: () => string = () => crypto.randomUUID()) {
		this.#buatId = buatId;
		this.#id = buatId();
	}

	/** Keranjang baru (Kosongkan, Transaksi baru, ganti outlet): id baru, kegagalan lama dilupakan. */
	reset(): void {
		this.#id = this.#buatId();
		this.#sidikGagal = null;
	}

	async bayar(
		a: { outletId: string; kirim: BarisKeranjang[]; metode: Metode; diterima: number | null },
		api: ApiTransaksi
	): Promise<HasilBayar> {
		const sidik = sidikTransaksi(a.kirim, a.metode, a.diterima);
		const peringatan: string[] = [];

		// Isi berubah setelah gagal: id lama tidak boleh dipakai lagi (server akan mengembalikan transaksi lama).
		if (this.#sidikGagal !== null && this.#sidikGagal !== sidik) {
			const lama = await api.muat(this.#id);
			if (lama) peringatan.push(`Pembayaran sebelumnya (${lama.nomor}) ternyata sudah tercatat. Bila tidak jadi, batalkan di Riwayat.`);
			this.reset();
		}

		let hasil: HasilJual;
		try {
			hasil = await api.catat({
				id: this.#id,
				outlet_id: a.outletId,
				metode: a.metode,
				...(a.diterima !== null ? { diterima: a.diterima } : {}),
				// waktu tidak dikirim: server memakai jamnya sendiri (jam tablet bisa salah).
				item: a.kirim.map((b) => ({ menu_id: b.menu_id, qty: b.qty }))
			});
		} catch (e) {
			this.#sidikGagal = sidik;
			throw e;
		}
		this.#sidikGagal = null;

		const hargaBerubah = hasil.total !== totalKeranjang(a.kirim);
		let tersimpan: PenjualanRiwayat | null = null;
		if (hasil.ulang || hargaBerubah) tersimpan = await api.muat(hasil.id).catch(() => null);
		if (hargaBerubah) peringatan.push('Harga menu baru saja diubah admin; struk memakai harga terbaru.');
		if (hasil.batal) peringatan.push(`Transaksi ${hasil.nomor} sudah dibatalkan sebelumnya. Jangan serahkan barang tanpa input ulang.`);
		return { hasil, tersimpan, hargaBerubah, peringatan };
	}
}
