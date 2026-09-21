/**
 * @module uiManager
 * @description Quản lý UI, cập nhật bảng dữ liệu, và thao tác Modal.
 * Điều kiện đầu ra: Cập nhật DOM chính xác mà không làm thay đổi dữ liệu lõi.
 */

export function addRowToTable(tableId, graphic, labelHtml, view) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.id = 'row_' + (graphic.attributes.uid || '').replace('.', '_');
    
    const chkHtml = `<td><input type="checkbox" class="form-check-input chk-row" data-uid="${graphic.attributes.uid}"></td>`;
    const actionBtnsHtml = `<div class="btn-group">
        <button class="btn btn-sm btn-outline-warning btn-edit-row" title="Sửa">✏️</button>
        <button class="btn btn-sm btn-outline-danger btn-delete-row" title="Xóa">🗑️</button>
    </div>`;

    if (tableId === 'tableIsolatedPoints' || tableId === 'tableRawPoints') {
        const idp = graphic.attributes.db_id || 'Mới';
        const name = graphic.attributes.Name || '(chưa đặt tên)';
        const lon = graphic.geometry.longitude.toFixed(6);
        const lat = graphic.geometry.latitude.toFixed(6);
        tr.style.cursor = 'pointer';
        tr.title = `Click để zoom`;
        tr.innerHTML = `${chkHtml}<td><b>${idp}</b><br><small>${name}</small></td>
            <td><small class="text-muted">${lon}, ${lat}</small> <span class="ms-1 text-primary" style="font-size:11px">🔍</span></td>
            <td>${actionBtnsHtml}</td>`;
        
        // Prevent click on checkbox from triggering row zoom
        setTimeout(() => {
            const chk = tr.querySelector('.chk-row');
            if (chk) {
                chk.addEventListener('click', (e) => e.stopPropagation());
                chk.addEventListener('change', (e) => checkSelectAllState(tableId));
            }
        }, 0);

        tr.addEventListener('click', (e) => {
            if(e.target.closest('button') || e.target.closest('input')) return;
            tbody.querySelectorAll('tr').forEach(r => r.classList.remove('table-active'));
            tr.classList.add('table-active');
            view.goTo({ center: [graphic.geometry.longitude, graphic.geometry.latitude], zoom: 18 }, { duration: 800 });
        });
    } else {
        tr.style.cursor = 'pointer';
        tr.title = `Click để zoom`;
        tr.innerHTML = `${chkHtml}<td>${labelHtml || graphic.attributes.Name || '(chưa đặt tên)'}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-warning btn-edit-row" title="Sửa">✏️</button>
                    <button class="btn btn-sm btn-outline-danger btn-delete-row" title="Xóa">🗑️</button>
                </div>
            </td>`;
            
        setTimeout(() => {
            const chk = tr.querySelector('.chk-row');
            if (chk) {
                chk.addEventListener('click', (e) => e.stopPropagation());
                chk.addEventListener('change', (e) => checkSelectAllState(tableId));
            }
        }, 0);

        tr.addEventListener('click', (e) => {
            if(e.target.closest('button') || e.target.closest('input')) return;
            tbody.querySelectorAll('tr').forEach(r => r.classList.remove('table-active'));
            tr.classList.add('table-active');
            view.goTo(graphic.geometry);
            view.popup.open({
                features: [graphic],
                location: graphic.geometry.extent ? graphic.geometry.extent.center : graphic.geometry
            });
        });
    }
    
    // Attach event listeners for Edit and Delete
    const btnEdit = tr.querySelector('.btn-edit-row');
    if (btnEdit) {
        btnEdit.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.handleEditRow) window.handleEditRow(graphic);
        });
    }

    const btnDelete = tr.querySelector('.btn-delete-row');
    if (btnDelete) {
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.handleDeleteRows) window.handleDeleteRows([graphic]);
        });
    }
    tbody.appendChild(tr);
}

export function updateRowInTable(graphic, labelHtml) {
    let tr = document.getElementById('row_' + (graphic.attributes.uid || '').replace('.', '_'));
    if (!tr && graphic.attributes.db_id) {
        tr = document.getElementById('row_' + graphic.attributes.db_id);
    }
    if (!tr) return;
    
    const isIso = (graphic.geometry.type === 'point' && graphic.attributes.Category === 'Điểm cô lập');
    if (isIso) {
        const idp = graphic.attributes.db_id || 'Mới';
        const name = graphic.attributes.Name || '(chưa đặt tên)';
        const lon = graphic.geometry.longitude.toFixed(6);
        const lat = graphic.geometry.latitude.toFixed(6);
        tr.innerHTML = `<td><b>${idp}</b><br><small>${name}</small></td>
            <td><small class="text-muted">${lon}, ${lat}</small> <span class="ms-1 text-primary" style="font-size:11px">🔍</span></td>`;
    } else {
        tr.cells[0].innerHTML = labelHtml || graphic.attributes.Name || '(chưa đặt tên)';
    }
}

export function clearTables() {
    ['#tableRawPoints','#tableIsolatedPoints','#tableNodes','#tableArcs','#tablePolygons','#tableRegions']
        .forEach(sel => {
            const el = document.querySelector(sel + ' tbody');
            if (el) el.innerHTML = '';
        });
}

export function showAttrModal(graphic) {
    const attrModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('attrModal'));
    document.querySelector('#attrModal .modal-title').textContent = graphic.attributes.isFromDB ? 'Cập nhật thông tin đối tượng' : 'Thông tin đối tượng mới';
    document.getElementById('f_uid').value = graphic.attributes.uid || '';
    document.getElementById('f_name').value = graphic.attributes.Name || '';
    document.getElementById('f_category').value = graphic.attributes.Category || graphic.attributes.Type || '';
    attrModal.show();
    return attrModal;
}

export function checkSelectAllState(tableId) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    const thead = document.querySelector(`#${tableId} thead`);
    if (!tbody || !thead) return;

    const rowCheckboxes = tbody.querySelectorAll('.chk-row');
    const chkAll = thead.querySelector('.chk-all');
    if (!chkAll) return;

    if (rowCheckboxes.length === 0) {
        chkAll.checked = false;
        chkAll.indeterminate = false;
        return;
    }

    const checkedCount = Array.from(rowCheckboxes).filter(chk => chk.checked).length;
    chkAll.checked = checkedCount === rowCheckboxes.length;
    chkAll.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
}

export function initCheckboxEvents() {
    document.querySelectorAll('.chk-all').forEach(chkAll => {
        chkAll.addEventListener('change', (e) => {
            const tableId = e.target.getAttribute('data-target');
            if (!tableId) return;
            const isChecked = e.target.checked;
            const tbody = document.querySelector(`#${tableId} tbody`);
            if (tbody) {
                tbody.querySelectorAll('.chk-row').forEach(chk => {
                    chk.checked = isChecked;
                });
            }
        });
    });
}

// Hàm lọc danh sách Điểm cô lập chuẩn 100% Tô-pô
export function filterIsolatedPoints(allPoints, allNodes, allArcPoints) {
    // 1. Lấy tất cả IDP đang làm Nút (hỗ trợ cả idp thường và hoa)
    const nodePointIds = new Set(allNodes.map(n => n.idp || n.IDP));

    // 2. Lấy tất cả IDP đang làm điểm uốn trung gian trên Cung
    const arcPointIds = new Set(allArcPoints.map(ap => ap.idp || ap.IDP));

    // 3. Điểm cô lập phải KHÔNG nằm trong cả 2 danh sách trên
    return allPoints.filter(p => {
        const pId = p.idp || p.IDP;
        return !nodePointIds.has(pId) && !arcPointIds.has(pId);
    });
}
