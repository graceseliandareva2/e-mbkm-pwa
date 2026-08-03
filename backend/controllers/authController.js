const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinaryService = require('../utils/cloudinaryService');
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
      { id: user.id_users, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    const { password: _pw, id_users, imported_by, ...rest } = user;
    const userSafe = { id: id_users, ...rest };

    res.json({
      message: 'Login berhasil.',
      token,
      user: userSafe,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};
const getProfile = async (req, res) => {
  try {
    const [users] = await db.query(
      `SELECT id_users AS id, username, role, nama, email, foto, nim, id_dosen,
              program_studi, current_periode_id, is_active, created_at
       FROM users WHERE id_users = ?`,
      [req.user.id]
    );
    if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan.' });

    res.json({ user: users[0] });
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
    const [users] = await db.query('SELECT * FROM users WHERE id_users = ?', [req.user.id]);
    const user = users[0];
    const isMatch = await bcrypt.compare(password_lama, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Password lama tidak sesuai.' });
    const hashed = await bcrypt.hash(password_baru, 10);
    await db.query('UPDATE users SET password = ? WHERE id_users = ?', [hashed, req.user.id]);
    res.json({ message: 'Password berhasil diubah.' });
  } catch (error) {
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { nama, email, program_studi } = req.body;

    if (req.file) {
      const uploaded = await cloudinaryService.uploadOrReplaceFotoProfil(req.user.id, req.file.buffer);
      await db.query('UPDATE users SET foto = ? WHERE id_users = ?', [uploaded.url, req.user.id]);
    }

    await db.query(
      'UPDATE users SET nama = ?, email = ?, program_studi = ? WHERE id_users = ?',
      [nama ?? null, email ?? null, program_studi ?? null, req.user.id]
    );

    const [updatedUser] = await db.query(
      `SELECT id_users AS id, username, role, nama, email, foto, nim, id_dosen,
              program_studi, current_periode_id
       FROM users WHERE id_users = ?`,
      [req.user.id]
    );

    res.json({ message: 'Profil berhasil diupdate.', user: updatedUser[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

module.exports = { login, getProfile, gantiPassword, updateProfile };