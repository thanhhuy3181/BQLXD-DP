/* Đăng nhập Google + danh sách dự án/tài khoản dùng chung với phần mềm Định biên (Firebase bqlxd-vh).
 * Nạp dạng module; không có mạng / mở bằng file:// thì window.BDNL_CLOUD = null và phần mềm chạy chế độ thử trên máy.
 * Dữ liệu dùng chung:
 *   users/{email}        — hồ sơ Định biên {email, name, status, role, vungId, bqlId}; BĐNL ghi thêm trường `bdnl`
 *                          {trangThai, vaiTro, vungId, duAnIds, duAnXem, nhaThau} (không đụng các trường của Định biên)
 *   registries/{vungId}  — {value: JSON [{id, ten}]} danh sách BQLXD/dự án của từng Vùng (Định biên quản lý)
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBvs1h_NeLW87Ob1ymxJycxv0Hsh2Ulo20',
  authDomain: 'bqlxd-vh.firebaseapp.com',
  projectId: 'bqlxd-vh',
  storageBucket: 'bqlxd-vh.firebasestorage.app',
  messagingSenderId: '210584060371',
  appId: '1:210584060371:web:117071fecc5ef268af6f26',
};
const VUNG = ['vung_bac', 'vung_trung', 'vung_nam'];

try {
  if (location.protocol === 'file:') throw new Error('Đăng nhập Google cần mở qua MO_PHAN_MEM.bat (http://localhost), không mở trực tiếp file.');
  const app = initializeApp(firebaseConfig), db = getFirestore(app), auth = getAuth(app);
  window.BDNL_CLOUD = {
    dangNhap: () => signInWithPopup(auth, new GoogleAuthProvider()),
    dangXuat: () => signOut(auth),
    khiDoi: (cb) => onAuthStateChanged(auth, cb),
    /** Hồ sơ users/{email}; chưa có thì tạo yêu cầu chờ duyệt (giống Định biên) */
    async hoSo(email, ten) {
      const ref = doc(db, 'users', email);
      const s = await getDoc(ref);
      if (s.exists()) return s.data();
      const rec = { email, name: ten || email, status: 'pending', role: 'bql', vungId: '', bqlId: '', bdnl: { trangThai: 'cho' } };
      await setDoc(ref, rec);
      return rec;
    },
    async dsHoSo() { const out = {}; (await getDocs(collection(db, 'users'))).forEach((d) => { out[d.id] = d.data(); }); return out; },
    /** Ghi phần BĐNL của 1 tài khoản (gộp, giữ nguyên trường Định biên) */
    luuBdnl(email, bdnl) { return setDoc(doc(db, 'users', email), { email, bdnl }, { merge: true }); },
    /** Danh sách BQLXD/dự án của Định biên: [{vungId, id, ten}] */
    async dsDuAn() {
      const out = [];
      for (const v of VUNG) {
        const s = await getDoc(doc(db, 'registries', v));
        if (!s.exists()) continue;
        let ds = []; try { ds = JSON.parse(s.data().value || '[]'); } catch (e) { /* bỏ qua */ }
        ds.forEach((b) => out.push({ vungId: v, id: b.id, ten: b.ten }));
      }
      return out;
    },
  };
} catch (e) {
  console.warn('[Đăng nhập] chạy chế độ thử trên máy:', e.message);
  window.BDNL_CLOUD = null;
  window.BDNL_CLOUD_LOI = e.message;
}
window.dispatchEvent(new Event('bdnl-cloud'));
