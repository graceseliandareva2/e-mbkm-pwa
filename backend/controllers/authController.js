const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinaryService = require('../utils/cloudinaryService');
require('dotenv').config();

// PERUBAHAN: tabel `users` di capstone_db_staging cuma punya
// (id, username, password, foto, role, is_active, created_at, updated_at).
// nama/email/program_studi TIDAK ada lagi di `users` -- semua data itu
// sekarang tinggal di tabel per-role (mahasiswa/dosen/kaprodi/staff_akademik).
// Helper ini menyatukan lookup profil berdasarkan role, dipakai oleh
// login/getProfile/updateProfile biar tidak duplikasi query 4x.
async function getProfileByRole(role, userId) {
  if (role === 'mahasiswa') {
    const [rows] = await db.query('SELECT * FROM mahasiswa WHERE user_id = ?', [userId]);
    return rows[0] || {};
  }
  if (role === 'dosen_pembimbing') {
    const [rows] = await db.query('SELECT * FROM dosen WHERE user_id = ?', [userId]);
    return rows[0] || {};
  }
  if (role === 'kaprodi') {
    const [rows] = await db.query('SELECT * FROM kaprodi WHERE user_id = ?', [userId]);
    return rows[0] || {};
  }
  if (role === 'staff_akademik') {
    const [rows] = await db.query('SELECT * FROM staff_akademik WHERE user_id = ?', [userId]);
    return rows[0] || {};
  }
  return {};
}

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username dan password wajib diisi.' });
    }
    const [users] = await db.query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }
    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Username atau password salah.' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const profileData = await getProfileByRole(user.role, user.id);

    res.json({
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        nama: profileData.nama,
        username: user.username,
        email: profileData.email,
        role: user.role,
        foto: user.foto,
        program_studi: profileData.program_studi,
        // NB: spread di bawah ini mempertahankan perilaku lama -- field dari
        // profileData (termasuk `id` milik tabel mahasiswa/dosen/dst, BUKAN
        // id dari users) akan menimpa field di atas kalau namanya sama.
        ...profileData,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, username, role, foto, is_active, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan.' });
    const user = users[0];

    const profileData = await getProfileByRole(user.role, user.id);

    res.json({ user: { ...user, ...profileData } });
  } catch (error) {
    console.error('getProfile error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const gantiPassword = async (req, res) => {
  try {
    const { password_lama, password_baru } = req.body;
    if (!password_lama || !password_baru) {
      return res.status(400).json({ message: 'Password lama dan baru wajib diisi.' });
    }
    if (password_baru.length < 6) {
      return res.status(400).json({ message: 'Password baru minimal 6 karakter.' });
    }
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = users[0];
    const isMatch = await bcrypt.compare(password_lama, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Password lama tidak sesuai.' });
    const hashed = await bcrypt.hash(password_baru, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ message: 'Password berhasil diubah.' });
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { nama, email, program_studi } = req.body;

    // PERUBAHAN: foto profil sekarang lewat cloudinaryService (Cloudinary),
    // bukan Drive lagi. public_id deterministik dari req.user.id, jadi upload
    // baru otomatis overwrite foto lama -- gak perlu lookup/simpan file id
    // lama kayak versi Drive dulu.
    if (req.file) {
      const uploaded = await cloudinaryService.uploadOrReplaceFotoProfil(req.user.id, req.file.buffer);

      await db.query('UPDATE users SET foto = ? WHERE id = ?', [uploaded.url, req.user.id]);
    }

    // nama/email/program_studi sekarang live di tabel per-role.
    if (req.user.role === 'mahasiswa') {
      await db.query(
        'UPDATE mahasiswa SET nama=?, email=?, program_studi=? WHERE user_id=?',
        [nama, email, program_studi, req.user.id]
      );
    } else if (req.user.role === 'dosen_pembimbing') {
      await db.query(
        'UPDATE dosen SET nama=?, email=?, program_studi=? WHERE user_id=?',
        [nama, email, program_studi, req.user.id]
      );
    } else if (req.user.role === 'kaprodi') {
      await db.query(
        'UPDATE kaprodi SET nama=?, email=?, program_studi=? WHERE user_id=?',
        [nama, email, program_studi, req.user.id]
      );
    } else if (req.user.role === 'staff_akademik') {
      // staff_akademik tidak punya kolom program_studi di skema.
      await db.query(
        'UPDATE staff_akademik SET nama=?, email=? WHERE user_id=?',
        [nama, email, req.user.id]
      );
    }

    const [updatedUser] = await db.query(
      'SELECT id, username, role, foto FROM users WHERE id=?',
      [req.user.id]
    );
    const profileData = await getProfileByRole(req.user.role, req.user.id);

    res.json({ message: 'Profil berhasil diupdate.', user: { ...updatedUser[0], ...profileData } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { login, getProfile, gantiPassword, updateProfile };