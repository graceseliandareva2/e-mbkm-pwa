const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
    let profileData = {};
    if (user.role === 'mahasiswa') {
      const [mhs] = await db.query('SELECT * FROM mahasiswa WHERE user_id = ?', [user.id]);
      profileData = mhs[0] || {};
    } else if (user.role === 'dosen_pembimbing') {
      const [dsn] = await db.query('SELECT * FROM dosen WHERE user_id = ?', [user.id]);
      profileData = dsn[0] || {};
    }
    res.json({
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        nama: user.nama,
        username: user.username,
        email: user.email,
        role: user.role,
        foto: user.foto,
        program_studi: user.program_studi || profileData.program_studi,
        angkatan: user.angkatan || profileData.angkatan,
        periode_aktif: user.periode_aktif,
        ...profileData
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, nama, username, email, role, foto, program_studi, angkatan, periode_aktif, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan.' });
    const user = users[0];
    let profileData = {};
    if (user.role === 'mahasiswa') {
      const [mhs] = await db.query('SELECT * FROM mahasiswa WHERE user_id = ?', [user.id]);
      profileData = mhs[0] || {};
    } else if (user.role === 'dosen_pembimbing') {
      const [dsn] = await db.query('SELECT * FROM dosen WHERE user_id = ?', [user.id]);
      profileData = dsn[0] || {};
    }
    res.json({ user: { ...user, ...profileData } });
  } catch (error) {
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
    const { nama, email, program_studi, angkatan, periode_aktif } = req.body;

    // Jika ada foto baru, hapus foto lama
    if (req.file) {
      const [users] = await db.query('SELECT foto FROM users WHERE id = ?', [req.user.id]);
      if (users[0]?.foto) {
        const oldPath = path.join(__dirname, '..', users[0].foto);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }

    const fotoPath = req.file ? `uploads/foto-profil/${req.file.filename}` : undefined;

    let query = 'UPDATE users SET nama=?, email=?, program_studi=?, angkatan=?, periode_aktif=?';
    let params = [nama, email, program_studi, angkatan, periode_aktif];

    if (fotoPath) {
      query += ', foto=?';
      params.push(fotoPath);
    }

    query += ' WHERE id=?';
    params.push(req.user.id);

    await db.query(query, params);

    // Update tabel mahasiswa/dosen juga
    if (req.user.role === 'mahasiswa') {
      await db.query(
        'UPDATE mahasiswa SET nama=?, email=?, program_studi=?, angkatan=? WHERE user_id=?',
        [nama, email, program_studi, angkatan, req.user.id]
      );
    } else if (req.user.role === 'dosen_pembimbing') {
      await db.query(
        'UPDATE dosen SET nama=?, email=? WHERE user_id=?',
        [nama, email, req.user.id]
      );
    }

    // Ambil data terbaru
    const [updated] = await db.query(
      'SELECT id, nama, username, email, role, foto, program_studi, angkatan, periode_aktif FROM users WHERE id=?',
      [req.user.id]
    );

    res.json({ message: 'Profil berhasil diupdate.', user: updated[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { login, getProfile, gantiPassword, updateProfile };