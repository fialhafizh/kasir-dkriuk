import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Button from './Button.svelte';
import TextField from './TextField.svelte';

describe('Button', () => {
	it('default type="button" supaya tidak mengirim form tanpa sengaja', () => {
		const { body } = render(Button, { props: {} });
		expect(body).toContain('type="button"');
	});
	it('type="submit" tetap bisa dipakai', () => {
		const { body } = render(Button, { props: { type: 'submit' } });
		expect(body).toContain('type="submit"');
		expect(body).not.toContain('type="button"');
	});
});

describe('TextField', () => {
	it('class dari pemanggil ditambahkan, bukan dibuang', () => {
		const { body } = render(TextField, { props: { id: 'x', label: 'X', class: 'tabular' } });
		expect(body).toMatch(/<input[^>]*class="[^"]*tabular/);
	});
	it('input memakai garis tegas (line-strong) agar terlihat di layar terang', () => {
		const { body } = render(TextField, { props: { id: 'x', label: 'X' } });
		expect(body).toContain('border-line-strong');
	});
});
