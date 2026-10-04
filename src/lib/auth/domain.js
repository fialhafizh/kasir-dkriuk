/**
 * Domain email sintetis: Supabase Auth butuh email, pengguna cukup mengetik username.
 * TLD .invalid dicadangkan RFC 2606 dan tidak bisa didaftarkan siapa pun,
 * jadi tautan reset password tidak mungkin jatuh ke tangan orang lain.
 */
export const AUTH_EMAIL_DOMAIN = 'kasir-dkriuk.invalid';
