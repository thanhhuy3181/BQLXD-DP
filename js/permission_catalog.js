'use strict';

// Single source of truth for every navigable web area.  The matrix is built
// from this catalog so a visible page cannot silently be absent from RBAC.
window.PermissionCatalog = {
  // Persisted permission ceilings for the five fast selectors in the RBAC
  // matrix. They cap an area without discarding its detailed permissions.
  groupControls: [
    {key:'grp_tabs', label:'Tất cả Tab', parent:null},
    {key:'grp_ql_file', label:'QL File', parent:'tab_quan_ly'},
    {key:'grp_theo_doi', label:'Theo dõi', parent:'tab_theo_doi'},
    {key:'grp_chuc_nang', label:'Chức năng', parent:'tab_chuc_nang'},
    {key:'grp_cai_dat', label:'Cài đặt', parent:'tab_cai_dat'}
  ],
  groups: [
    ['🧭 TAB CHÍNH', [
      ['tab_home','Trang chủ'], ['tab_mail','Email'], ['tab_todo','To do / Làm việc nhóm'], ['tab_quan_ly','QL File'], ['tab_theo_doi','Theo dõi'],
      ['tab_bao_cao','Báo cáo'], ['tab_so_sanh','So sánh'], ['tab_thanh_toan','Đề nghị thanh toán'],
      ['tab_chuc_nang','Chức năng'], ['tab_cai_dat','Cài đặt']
    ]],
    ['📁 QL FILE', [
      ['ql_tab_phe_duyet','01.01 Phê duyệt'], ['ql_tab_tien_do','01.02 Tiến độ'], ['ql_tab_yc_kt','01.03 YC Kỹ thuật'],
      ['ql_tab_bvtk','01.04 BVTK'], ['ql_tab_phap_ly','02. Pháp lý'], ['ql_tab_cam_nang','03. Cẩm nang'],
      ['ql_tab_chuan_hoa','04. Chuẩn hóa'], ['ql_tab_hsmt','06. HSMT'], ['ql_tab_hop_dong','07. Hợp đồng'],
      ['ql_tab_tu_tt','08.01 Tạm ứng, thanh toán'], ['ql_tab_tqt','08.02 Quyết toán'], ['ql_project_mgmt','Thêm/sửa/xóa tab QL File']
    ]],
    ['📊 THEO DÕI', [
      ['td_progress','Tiến độ thực hiện'], ['td_hsmt','Hồ sơ mời thầu'], ['td_contract','Hợp đồng'], ['td_boq','Khối lượng'],
      ['td_payment','Tạm ứng, thanh toán'], ['td_contractor','Tổng hợp nhà thầu'], ['td_sap','Dữ liệu SAP'], ['td_contractor_data','Dữ liệu nhà thầu']
    ]],
    ['🛠️ CHỨC NĂNG', [
      ['cn_tab_b1_word','B1. Tạo Word PH HSMT'], ['cn_tab_b2_hsmt','B2. Cập nhật HSMT'], ['cn_tab_b3_hd','B3. Cập nhật HĐ'],
      ['cn_tab_b4_heading','B4. Tự tạo Heading'], ['cn_tab_b5_skill_hsmt','B5. Skill HSMT'], ['cn_tab_b5_skill_hd','B5. Skill HĐ'],
      ['cn_tab_b6_ai','B6. Rèn luyện AI'], ['cn_tab_b7_search','B7. Tìm kiếm'], ['cn_tab_b8_central','B8. Cập nhật Trung tâm'],
      ['cn_tab_b9_merge_boq','B9. Ghép KL HSMT'], ['cn_down_hd','Tải hợp đồng'], ['cn_down_cks','Tải chữ ký số'], ['cn_export_excel','Xuất báo cáo Excel']
    ]],
    ['⚙️ CÀI ĐẶT', [
      ['cd_theme','Tùy biến tab & màu sắc'], ['cd_hm_ctr','QL HM/CT'], ['cd_ql_acc','Quản lý tài khoản'],
      ['cd_perm','Phân quyền RBAC'], ['cd_ai_engine','Cấu hình AI Engine'], ['cd_excel_cfg','Cấu hình Excel'],
      ['cd_links','Quản lý Link'], ['cd_data_matrix','Ma trận dữ liệu'], ['cd_backup','Sao lưu & phục hồi']
    ]]
  ],
  ensure(data) {
    const permissions = data.permissions || (data.permissions = {});
    const roles = ['Admin','Văn phòng','Nội nghiệp','ĐTGS','CBGS'];
    // The persisted matrix predates the job-title role names.  Copy the old
    // matrix only when the new role has never been configured; an explicit
    // current-role setting (including "none") always wins.  This mirrors the
    // API/AwM resolution so browser and mobile results cannot diverge.
    const legacyRole = {'Nội nghiệp':'Phó nhóm',CBGS:'Thành viên'};
    roles.forEach(role => {
      if (!permissions[role] && legacyRole[role] && permissions[legacyRole[role]]) {
        permissions[role] = {...permissions[legacyRole[role]]};
      } else {
        permissions[role] = permissions[role] || {};
      }
    });
    this.groups.flatMap(([, items]) => items).forEach(([key]) => {
      roles.forEach(role => {
        if (permissions[role][key] === true) permissions[role][key] = 'full';
        if (permissions[role][key] === false) permissions[role][key] = 'none';
      });
      if (permissions.Admin[key] === undefined) permissions.Admin[key] = 'full';
      roles.filter(role => role !== 'Admin').forEach(role => {
        if (permissions[role][key] === undefined) permissions[role][key] = 'none';
      });
    });
    // Matrices saved before group selectors existed retain their grants until
    // an administrator explicitly picks an area-wide ceiling.
    this.groupControls.forEach(({key}) => roles.forEach(role => {
      if (permissions[role][key] === undefined) permissions[role][key] = 'full';
    }));
    return data;
  }
};
