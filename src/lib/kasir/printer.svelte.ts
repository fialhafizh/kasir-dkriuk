import { rantai } from '#lib/master/antrian.ts';
import { LAYANAN_PRINTER, pilihKarakteristik, type InfoLayanan } from './ble.ts';
import { kirimBertahap } from './escpos.ts';

function pesanGagal(e: unknown): string {
	switch ((e as Error)?.name) {
		case 'NotFoundError':
			return 'Tidak ada printer dipilih.';
		case 'SecurityError':
			return 'Izin Bluetooth ditolak. Tekan tombol Sambungkan printer lagi dan izinkan Bluetooth.';
		case 'NetworkError':
			return 'Printer tidak terjangkau. Nyalakan printer, dekatkan ke tablet, lalu coba lagi.';
		default:
			return 'Printer tidak bisa disambungkan lewat Bluetooth Chrome. Coba cetak lewat aplikasi RawBT.';
	}
}

class PrinterState {
	status = $state<'tidak' | 'menyambung' | 'siap' | 'gagal'>('tidak');
	nama = $state('');
	pesan = $state('');
	#tulis: BluetoothRemoteGATTCharacteristic | null = null;
	#perangkat: BluetoothDevice | null = null;
	// Satu struk selesai dulu sebelum struk berikutnya (cetak otomatis + cetak ulang tidak bercampur).
	#antrian = rantai();

	get didukung(): boolean {
		return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
	}

	async sambung(): Promise<void> {
		if (!this.didukung) {
			this.status = 'gagal';
			this.pesan = 'Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android, atau cetak lewat RawBT.';
			return;
		}
		// Lepaskan printer sebelumnya supaya tidak tertukar.
		this.#lepas();
		this.status = 'menyambung';
		this.pesan = '';
		try {
			const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: LAYANAN_PRINTER });
			const gatt = await d.gatt!.connect();
			const layanan = await gatt.getPrimaryServices();
			const info: InfoLayanan[] = [];
			const peta = new Map<string, BluetoothRemoteGATTCharacteristic>();
			for (const s of layanan) {
				const ks = await s.getCharacteristics().catch(() => []);
				info.push({
					uuid: s.uuid,
					karakteristik: ks.map((c) => {
						peta.set(`${s.uuid}|${c.uuid}`, c);
						return { uuid: c.uuid, write: c.properties.write, writeWithoutResponse: c.properties.writeWithoutResponse };
					})
				});
			}
			const pilih = pilihKarakteristik(info);
			const lay = pilih && info.find((l) => l.karakteristik.includes(pilih));
			const tulis = pilih && lay ? peta.get(`${lay.uuid}|${pilih.uuid}`) : undefined;
			if (!tulis) throw new Error('tanpa karakteristik tulis');

			this.#perangkat = d;
			this.#tulis = tulis;
			this.nama = d.name ?? 'Printer';
			d.addEventListener(
				'gattserverdisconnected',
				() => {
					// Abaikan kabar dari perangkat lama yang sudah diganti.
					if (this.#perangkat !== d) return;
					this.#tulis = null;
					this.#perangkat = null;
					this.status = 'tidak';
					this.pesan = 'Printer terputus. Sambungkan lagi.';
				},
				{ once: true }
			);
			this.status = 'siap';
		} catch (e) {
			this.#lepas();
			this.status = 'gagal';
			this.pesan = pesanGagal(e);
		}
	}

	cetak(bytes: Uint8Array): Promise<void> {
		return this.#antrian(async () => {
			const c = this.#tulis;
			if (!c) throw new Error('Printer belum tersambung.');
			try {
				// Chrome lama (<85) belum punya writeValueWith*: jatuh ke writeValue.
				const tulisSatu: ((p: BufferSource) => Promise<void>) | undefined = c.properties.writeWithoutResponse
					? c.writeValueWithoutResponse
					: c.writeValueWithResponse;
				await kirimBertahap(bytes, (paket) => (tulisSatu ?? c.writeValue).call(c, paket));
			} catch {
				throw new Error('Gagal mengirim ke printer. Pastikan printer menyala dan dekat, lalu cetak ulang.');
			}
		});
	}

	putus(): void {
		this.#lepas();
		this.status = 'tidak';
		this.pesan = '';
	}

	#lepas() {
		const d = this.#perangkat;
		// Hapus rujukan dulu agar event "terputus" dari perangkat ini diabaikan.
		this.#perangkat = null;
		this.#tulis = null;
		d?.gatt?.disconnect();
	}
}

export const printer = new PrinterState();
