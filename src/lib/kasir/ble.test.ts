import { describe, expect, it } from 'vitest';
import { LAYANAN_PRINTER, pilihKarakteristik, uuid16 } from './ble';

const k = (uuid: string, write = true) => ({ uuid, write, writeWithoutResponse: false });

describe('pilihKarakteristik', () => {
	it('memilih karakteristik data yang dikenal walau ada karakteristik tulis lain di depannya', () => {
		const layanan = [
			{ uuid: uuid16(0x180a), karakteristik: [k(uuid16(0x2a29))] },
			{
				uuid: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
				karakteristik: [k('49535343-aca3-481c-91ec-d85e28a60318'), k('49535343-8841-43f4-a8d4-ecbe34729bb3')]
			}
		];
		expect(pilihKarakteristik(layanan)?.uuid).toBe('49535343-8841-43f4-a8d4-ecbe34729bb3');
	});
	it('urutan layanan printer yang dikenal mengalahkan urutan dari perangkat', () => {
		const layanan = [
			{ uuid: uuid16(0xffe0), karakteristik: [k(uuid16(0xffe1))] },
			{ uuid: uuid16(0x18f0), karakteristik: [k(uuid16(0x2af1))] }
		];
		expect(pilihKarakteristik(layanan)?.uuid).toBe(uuid16(0x2af1));
	});
	it('cadangan: karakteristik tulis pertama di layanan printer bila tidak ada yang dikenal', () => {
		const layanan = [{ uuid: uuid16(0xff00), karakteristik: [k(uuid16(0xff05), false), k(uuid16(0xff09))] }];
		expect(pilihKarakteristik(layanan)?.uuid).toBe(uuid16(0xff09));
	});
	it('tidak ada karakteristik tulis → null', () => {
		expect(pilihKarakteristik([{ uuid: uuid16(0x180a), karakteristik: [k(uuid16(0x2a29), false)] }])).toBeNull();
	});
	it('Nordic UART termasuk daftar layanan', () => {
		expect(LAYANAN_PRINTER).toContain('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
	});
});
