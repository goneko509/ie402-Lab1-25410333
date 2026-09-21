/**
 * @module spatialCreateRegion
 * @description Quản lý logic tạo Vùng mới bằng cách chọn không gian
 */
import { API_BASE } from './config.js';

export function initCreateRegion(sketch, AppState) {
    const btnCreate = document.getElementById('btnSpatialCreateRegion');
    const btnConfirm = document.getElementById('btnConfirmCreateRegion');

    if (btnCreate) {
        btnCreate.addEventListener('click', () => {
            AppState.isSpatialCreateRegionMode = true;
            sketch.create('polygon', { mode: 'freehand' });
        });
    }

    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            const desc = document.getElementById('crRegionDesc').value.trim();
            if (!desc) {
                alert("Vui lòng nhập Tên/Mô tả cho Vùng!");
                return;
            }

            const polys = AppState.currentSelectionState.polys || [];
            if (polys.length === 0) {
                alert("Không có đa giác nào để tạo vùng!");
                return;
            }

            // Sinh SQL
            const polyIdsStr = polys.join(',');
            const sLines = [];
            sLines.push(`BEGIN TRY`);
            sLines.push(`    BEGIN TRAN;`);
            sLines.push(`    -- 1. Tạo Region mới`);
            sLines.push(`    DECLARE @NewIDR INT;`);
            sLines.push(`    INSERT INTO TOPO_REGION (DESCRIPTION) VALUES (N'${desc.replace(/'/g, "''")}');`);
            sLines.push(`    SET @NewIDR = SCOPE_IDENTITY();`);
            sLines.push(`    -- 2. Gán các Polygon được quét vào Region vừa tạo`);
            sLines.push(`    UPDATE TOPO_POLY SET IDR = @NewIDR WHERE IDPO IN (${polyIdsStr});`);
            sLines.push(`    COMMIT TRAN;`);
            sLines.push(`END TRY`);
            sLines.push(`BEGIN CATCH`);
            sLines.push(`    IF @@TRANCOUNT > 0 ROLLBACK TRAN;`);
            sLines.push(`    THROW;`);
            sLines.push(`END CATCH`);

            try {
                // Gọi thẳng API Execute SQL
                const response = await fetch(`${API_BASE}/api/execute-sql`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scriptLines: sLines })
                });

                const result = await response.json();
                if (result.success) {
                    alert("Tạo vùng thành công!");
                    // Đóng modal
                    const crModal = bootstrap.Modal.getInstance(document.getElementById('createRegionModal'));
                    if (crModal) crModal.hide();
                    
                    // Tải lại bản đồ và dữ liệu
                    if (window.loadData) window.loadData();
                } else {
                    alert("Lỗi SQL: " + result.message);
                }
            } catch (err) {
                alert("Lỗi kết nối Server: " + err.message);
                console.error(err);
            }
        });
    }
}
