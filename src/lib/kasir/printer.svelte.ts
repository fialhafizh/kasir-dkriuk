import { kirimBertahap } from './escpos.ts';

// Layanan BLE yang umum dipakai printer thermal murah (termasuk banyak varian 58 mm).
const LAYANAN: BluetoothServiceUUID[] = [
	0x18f0,
	0xff00,
	0xffe0,
	0xfee7,
	'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
	'49535343-fe7d-4ae5-8fa9-9fafd205e455'
];

class PrinterState {
	status = $state<'tidak' | 'menyambung' | 'siap' | 'gagal'>('tidak');
	nama = $state('');
	pesan = $state('');
	#tulis: BluetoothRemoteGATTCharacteristic | null = null;
	#perangkat: BluetoothDevice | null = null;

	get didukung(): boolean {
		return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
	}

	async sambung(): Promise<void> {
		if (!this.didukung) {
			this.status = 'gagal';
			this.pesan = 'Browser ini tidak mendukung Bluetooth. Pakai Chrome di Android, atau cetak lewat RawBT.';
			return;
		}
		this.status = 'menyambung';
		this.pesan = '';
		try {
			const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: LAYANAN });
			const gatt = await d.gatt!.connect();
			for (const s of await gatt.getPrimaryServices()) {
				for (const c of await s.getCharacteristics()) {
					if (c.properties.write || c.properties.writeWithoutResponse) {
						this.#tulis = c;
						break;
					}
				}
				if (this.#tulis) break;
			}
			if (!this.#tulis) throw new Error('tanpa karakteristik tulis');
			this.#perangkat = d;
			this.nama = d.name ?? 'Printer';
			d.addEventListener('gattserverdisconnected', () => {
				this.#tulis = null;
				this.status = 'tidak';
				this.pesan = 'Printer terputus. Sambungkan lagi.';
			});
			this.status = 'siap';
		} catch (e) {
			this.#tulis = null;
			this.status = 'gagal';
			this.pesan =
				(e as Error).name === 'NotFoundError'
					? 'Tidak ada printer dipilih.'
					: 'Printer tidak bisa disambungkan lewat Bluetooth Chrome. Coba cetak lewat aplikasi RawBT.';
		}
	}

	async cetak(bytes: Uint8Array): Promise<void> {
		const c = this.#tulis;
		if (!c) throw new Error('Printer belum tersambung.');
		await kirimBertahap(bytes, (paket) =>
			c.properties.writeWithoutResponse ? c.writeValueWithoutResponse(paket) : c.writeValueWithResponse(paket)
		);
	}

	putus(): void {
		this.#perangkat?.gatt?.disconnect();
		this.#tulis = null;
		this.status = 'tidak';
	}
}

export const printer = new PrinterState();
