export type Role = 'admin' | 'kasir';

export interface Outlet {
	id: string;
	kode: string;
	nama: string;
	merek: string;
	alamat: string;
	telepon: string;
	aktif: boolean;
}

export interface Profile {
	id: string;
	username: string;
	nama_tampilan: string;
	role: Role;
	outlet_id: string | null;
	aktif: boolean;
}
