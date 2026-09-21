/**
 * @module tabOperations
 * @description Xử lý các thao tác Thêm, Sửa, Xóa trực tiếp từ các tab dữ liệu.
 */
import { showAttrModal } from './uiManager.js';

export function initTabOperations(view, graphicsLayer, sketch, AppState) {

    // --- XỬ LÝ NÚT THÊM ---
    document.querySelectorAll('.btn-add-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.getAttribute('data-type');
            if (sketch) {
                AppState.currentInteractionMode = "DRAW_OBJECT";
                sketch.create(type); // type: point, polyline, polygon, region
                if (type === 'region') {
                    alert("Tính năng vẽ Vùng chưa được hỗ trợ bằng Sketch. Vui lòng thêm từ DB hoặc chức năng Xây dựng Vùng.");
                } else {
                    document.getElementById('viewDiv').scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    // --- XỬ LÝ NÚT SỬA ---
    document.querySelectorAll('.btn-edit-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tableId = e.target.getAttribute('data-table');
            const tbody = document.querySelector(`#${tableId} tbody`);
            if (!tbody) return;

            const checkedRows = tbody.querySelectorAll('.chk-row:checked');
            if (checkedRows.length === 0) {
                alert("Vui lòng chọn 1 đối tượng để sửa!");
                return;
            }
            if (checkedRows.length > 1) {
                alert("Chỉ được phép sửa 1 đối tượng mỗi lần!");
                return;
            }

            const uid = checkedRows[0].getAttribute('data-uid');
            const graphic = graphicsLayer.graphics.find(g => g.attributes && g.attributes.uid === uid);
            
            if (graphic) {
                AppState.currentNewGraphic = graphic;
                showAttrModal(graphic);
            } else {
                alert("Không tìm thấy dữ liệu đối tượng trên bản đồ!");
            }
        });
    });

    // --- XỬ LÝ NÚT SỬA TỪNG HÀNG ---
    window.handleEditRow = function(graphic) {
        if (graphic) {
            AppState.currentNewGraphic = graphic;
            showAttrModal(graphic);
        }
    };

    // --- HÀM XÓA CHUNG ---
    window.handleDeleteRows = function(graphicsToDelete) {
        if (!graphicsToDelete || graphicsToDelete.length === 0) return;
        if (!confirm(`Bạn có chắc chắn muốn xóa ${graphicsToDelete.length} đối tượng? Việc xóa sẽ ảnh hưởng đến các đối tượng liên kết (Cascade Delete).`)) {
            return;
        }

        const nodeIds = [];
        const isoPointIds = [];
        const arcs = [];
        const polys = [];
        const regions = [];

        graphicsToDelete.forEach(g => {
            const db_id = g.attributes.db_id;
            if (!db_id) return;
            
            if (g.attributes.type === 'region') {
                regions.push(db_id);
            }
            else if (g.geometry.type === 'point') {
                if (g.attributes.Category === 'Điểm cô lập' || (g.attributes.uid && (g.attributes.uid.includes('_raw') || g.attributes.uid.includes('_iso')))) {
                    isoPointIds.push(db_id);
                } else {
                    nodeIds.push(db_id);
                }
            }
            else if (g.geometry.type === 'polyline') arcs.push(db_id);
            else if (g.geometry.type === 'polygon') polys.push(db_id);
        });

        // Tiến hành biên dịch chuỗi SQL xóa (Cascade Delete) theo schema TOPO_
        let sLines = [];
        sLines.push("BEGIN TRANSACTION;");
        sLines.push("");

        // Xóa VÙNG (REGION)
        if (regions.length > 0) {
            const regionIds = regions.join(', ');
            sLines.push(`-- 0. Xóa Vùng (Giải phóng các Đa giác thuộc Vùng)`);
            sLines.push(`UPDATE TOPO_POLY SET IDR = NULL WHERE IDR IN (${regionIds});`);
            sLines.push(`DELETE FROM TOPO_REGION WHERE IDR IN (${regionIds});`);
            sLines.push("");
        }

        // Xóa POLYGON
        if (polys.length > 0) {
            const polyIds = polys.join(', ');
            sLines.push(`-- 1. Xóa liên kết Cung - Đa giác của các Poly bị chọn`);
            sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDPO IN (${polyIds});`);
            sLines.push(`-- Cập nhật các Cung chung giải phóng Đa giác bị xóa`);
            sLines.push(`UPDATE TOPO_ARC SET IDPOL = NULL WHERE IDPOL IN (${polyIds});`);
            sLines.push(`UPDATE TOPO_ARC SET IDPOR = NULL WHERE IDPOR IN (${polyIds});`);
            sLines.push(`-- Xóa Đa giác`);
            sLines.push(`DELETE FROM TOPO_POLY WHERE IDPO IN (${polyIds});`);
            sLines.push("");
        }

        // Xóa ARC
        if (arcs.length > 0) {
            const arcIds = arcs.join(', ');
            sLines.push(`-- 2. Xóa các Arc bị chọn`);
            sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDA IN (${arcIds});`);
            sLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA IN (${arcIds});`);
            sLines.push(`DELETE FROM TOPO_ARC WHERE IDA IN (${arcIds});`);
            sLines.push("");
        }

        // Xóa NODE
        if (nodeIds.length > 0) {
            const nIds = nodeIds.join(', ');
            sLines.push(`-- 3a. Xóa Node (Cascade)`);
            sLines.push(`-- Đảm bảo xóa SẠCH mọi phụ thuộc của Arc kết nối với Node`);
            sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDA IN (SELECT IDA FROM TOPO_ARC WHERE IDNB IN (${nIds}) OR IDNE IN (${nIds}));`);
            sLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA IN (SELECT IDA FROM TOPO_ARC WHERE IDNB IN (${nIds}) OR IDNE IN (${nIds}));`);
            sLines.push(`UPDATE TOPO_ARC SET IDPOL = NULL WHERE IDNB IN (${nIds}) OR IDNE IN (${nIds});`);
            sLines.push(`UPDATE TOPO_ARC SET IDPOR = NULL WHERE IDNB IN (${nIds}) OR IDNE IN (${nIds});`);
            sLines.push(`DELETE FROM TOPO_ARC WHERE IDNB IN (${nIds}) OR IDNE IN (${nIds});`);
            sLines.push(`-- Lấy danh sách IDP tương ứng với các NODE chuẩn bị xóa`);
            sLines.push(`DECLARE @DelPoints TABLE (IDP INT);`);
            sLines.push(`INSERT INTO @DelPoints SELECT IDP FROM TOPO_NODE WHERE IDN IN (${nIds});`);
            sLines.push(`-- Xóa NODE trước, sau đó xóa POINT gốc`);
            sLines.push(`DELETE FROM TOPO_NODE WHERE IDN IN (${nIds});`);
            sLines.push(`DELETE FROM TOPO_POINT WHERE IDP IN (SELECT IDP FROM @DelPoints);`);
            sLines.push("");
        }

        // Xóa RAW POINT / ISOLATED POINT
        if (isoPointIds.length > 0) {
            const pIds = isoPointIds.join(', ');
            sLines.push(`-- 3b. Xóa Điểm cô lập / Điểm thô (Dọn dẹp khóa ngoại)`);
            sLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDP IN (${pIds});`);
            sLines.push(`DELETE FROM TOPO_NODE WHERE IDP IN (${pIds});`);
            sLines.push(`DELETE FROM TOPO_POINT WHERE IDP IN (${pIds});`);
            sLines.push("");
        }

        sLines.push("COMMIT;");

        // Lưu script và gọi hàm xử lý thực thi (đã có trong uiEvents.js)
        AppState.sqlScriptLines = sLines;
        
        if (window.executeSQLScript) {
            window.executeSQLScript();
        } else {
            alert("Lỗi: Không tìm thấy hàm thực thi SQL.");
        }
        
        // Xóa graphic khỏi map tạm thời
        graphicsLayer.removeMany(graphicsToDelete.toArray ? graphicsToDelete.toArray() : graphicsToDelete);
    };

    // --- XỬ LÝ NÚT XÓA TỪ TAB (NHIỀU HÀNG) ---
    document.querySelectorAll('.btn-delete-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tableId = e.target.getAttribute('data-table');
            const tbody = document.querySelector(`#${tableId} tbody`);
            if (!tbody) return;

            const checkedRows = tbody.querySelectorAll('.chk-row:checked');
            if (checkedRows.length === 0) {
                alert("Vui lòng chọn ít nhất 1 đối tượng để xóa!");
                return;
            }

            const uids = Array.from(checkedRows).map(chk => chk.getAttribute('data-uid'));
            const graphicsToDelete = graphicsLayer.graphics.filter(g => g.attributes && uids.includes(g.attributes.uid));
            
            window.handleDeleteRows(graphicsToDelete.toArray ? graphicsToDelete.toArray() : graphicsToDelete);
        });
    });
}
