import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { id } from 'date-fns/locale';

export const formatTanggal = (tanggal) => {
  if (!tanggal) return '-';
  try {
    return format(parseISO(tanggal), 'dd MMMM yyyy', { locale: id });
  } catch {
    return tanggal;
  }
};

export const formatTanggalWaktu = (tanggal) => {
  if (!tanggal) return '-';
  try {
    return format(parseISO(tanggal), 'dd MMM yyyy, HH:mm', { locale: id });
  } catch {
    return tanggal;
  }
};

export const isDeadlinePassed = (tanggal) => {
  if (!tanggal) return false;
  return isAfter(new Date(), parseISO(tanggal));
};

export const isWithinPeriod = (mulai, selesai) => {
  const now = new Date();
  const start = mulai ? parseISO(mulai) : null;
  const end = selesai ? parseISO(selesai) : null;
  if (start && isBefore(now, start)) return false;
  if (end && isAfter(now, end)) return false;
  return true;
};

export const getStatusBadge = (status) => {
  const map = {
    draft: { label: 'Draft', class: 'badge-gray' },
    diajukan: { label: 'Diajukan', class: 'badge-info' },
    disetujui_dosen: { label: 'Disetujui Dosen', class: 'badge-info' },
    disetujui_kaprodi: { label: 'Disetujui', class: 'badge-success' },
    ditolak: { label: 'Ditolak', class: 'badge-danger' },
    revisi: { label: 'Perlu Revisi', class: 'badge-warning' },
    disubmit: { label: 'Disubmit', class: 'badge-info' },
    diverifikasi: { label: 'Diverifikasi', class: 'badge-success' },
    diupload: { label: 'Diupload', class: 'badge-info' },
    disetujui: { label: 'Disetujui', class: 'badge-success' },
  };
  return map[status] || { label: status, class: 'badge-gray' };
};

export const formatFileSize = (bytes) => {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

export const getRoleLabel = (role) => {
  const map = {
    mahasiswa: 'Mahasiswa',
    dosen_pembimbing: 'Dosen Pembimbing',
    kaprodi: 'Kaprodi',
    staff_akademik: 'Staff Akademik',
  };
  return map[role] || role;
};