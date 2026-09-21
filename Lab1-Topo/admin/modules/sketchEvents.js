/**
 * @module sketchEvents
 * @description Quản lý các sự kiện vẽ, xóa, cập nhật trên bản đồ bằng công cụ Sketch.
 * Điều kiện đầu ra: Xử lý logic đúng cho từng thao tác vẽ và đồng bộ với trạng thái global.
 */
import { getPtSql, getNodeSql, deduplicatePoints } from './sqlGenerator.js';
import { API_BASE } from './config.js';

export function initSketchEvents(sketch, view, graphicsLayer, AppState, webMercatorUtils, geometryEngine, uiManager) {
// LÀM SẠCH BẢN ĐỒ: Xóa nét vẽ nháp / control handles và render biểu tượng chính thức
    sketch.on("create", function(event) {
        const spatialDeleteModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('spatialDeleteModal'));
        if (event.state === "complete") {
            if (AppState.isSpatialDetectPolyMode) {
                try {
                    const detectGeom = event.graphic.geometry;
                    graphicsLayer.remove(event.graphic);
                    AppState.isSpatialDetectPolyMode = false;
                    window.runDetectPoly(detectGeom);
                } catch (err) {
                    alert("Lỗi khi quét không gian: " + err.message);
                }
                return;
            }
            if (AppState.isSpatialCreateRegionMode) {
                try {
                    const selectionGeom = event.graphic.geometry;
                    graphicsLayer.remove(event.graphic);
                    AppState.isSpatialCreateRegionMode = false;

                    let normalizedSelection = selectionGeom;
                    if (selectionGeom.spatialReference && selectionGeom.spatialReference.isWebMercator) {
                        normalizedSelection = webMercatorUtils.webMercatorToGeographic(selectionGeom);
                    }

                    // Buffer slightly to cover edges
                    let bufferedSelection = normalizedSelection;
                    try { bufferedSelection = geometryEngine.buffer(normalizedSelection, 1e-6, "degrees"); } catch(e){}

                    // Find intersecting polygons
                    let polyIds = [];
                    graphicsLayer.graphics.forEach(g => {
                        if (g.geometry && g.geometry.type === 'polygon') {
                            let graphicGeom = g.geometry;
                            if (g.geometry.spatialReference && g.geometry.spatialReference.isWebMercator) {
                                graphicGeom = webMercatorUtils.webMercatorToGeographic(g.geometry);
                            }
                            if (geometryEngine.intersects(graphicGeom, bufferedSelection)) {
                                const db_id = g.attributes ? g.attributes.db_id : null;
                                if (db_id) polyIds.push(db_id);
                            }
                        }
                    });

                    if (polyIds.length === 0) {
                        alert("Không tìm thấy đa giác nào trong vùng chọn!");
                        return;
                    }

                    // Save to global state and open modal
                    AppState.currentSelectionState.polys = polyIds;
                    const crModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('createRegionModal'));
                    document.getElementById('crPolyCount').textContent = polyIds.length;
                    document.getElementById('crRegionDesc').value = '';
                    crModal.show();
                } catch (err) {
                    alert("Lỗi khi quét vùng: " + err.message);
                    console.error(err);
                }
                return;
                return;
            }
            
            // CHỈ xử lý định dạng cho nét vẽ đối tượng mới nếu đúng mode
            if (AppState.currentInteractionMode !== "DRAW_OBJECT") {
                return;
            }

            sketch.cancel(); // Ẩn control handles
            const g = event.graphic;
            
            // Reset mode
            AppState.currentInteractionMode = "NONE";
            if (g.geometry.type === "point") {
                g.symbol = {
                    type: "simple-marker", style: "circle",
                    color: [255, 0, 0], // Đỏ (Điểm cô lập hiển thị như Node)
                    size: "10px",
                    outline: { color: [255, 255, 255], width: 1 }
                };
            } else if (g.geometry.type === "polyline") {
                g.symbol = { type: "simple-line", color: [226, 119, 40], width: 2.5 };
            } else if (g.geometry.type === "polygon") {
                g.symbol = {
                    type: "simple-fill", color: [51, 153, 102, 0.35],
                    outline: { color: [51, 153, 102], width: 2 }
                };
            }
        }
    });



    document.getElementById('attrModal').addEventListener('hide.bs.modal', function () {
        // Nếu graphic chưa được lưu (không có db_id) thì xóa khỏi bản đồ
        if (AppState.currentNewGraphic && (!AppState.currentNewGraphic.attributes || !AppState.currentNewGraphic.attributes.db_id)) {
            graphicsLayer.remove(AppState.currentNewGraphic);
            AppState.currentNewGraphic = null;
        }
    });

    AppState.sqlScriptLines = [];
    AppState.currentNewGraphic = null;
    AppState.maxIdP = 1000; AppState.maxIdA = 1000; AppState.maxIdPo = 1000;

    
// =============================================
    // BẮT SỰ KIỆN VẼ MỚI / DUPLICATE
    // =============================================
    graphicsLayer.graphics.on('change', function(event) {
        if (graphicsLayer.isInitialLoad) return;
        if (event.added && event.added.length > 0) {
            event.added.forEach(g => {
                if (g.attributes && g.attributes.isProcessingNew) return;
                g.attributes = g.attributes || {};
                g.attributes.isProcessingNew = true;
                g.attributes.uid = Date.now().toString() + Math.random().toString();
                delete g.attributes.db_id;
                g.attributes.isFromDB = false;
                AppState.currentNewGraphic = g;

                document.querySelector('#attrModal .modal-title').textContent = 'Thông tin đối tượng mới';
                document.getElementById('f_uid').value = g.attributes.uid;
                document.getElementById('f_name').value = g.attributes.Name || '';
                document.getElementById('f_category').value = g.attributes.Category || g.attributes.Type || '';
                const attrModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('attrModal'));
                attrModal.show();
            });
        }
    });

    // Double-click để sửa thuộc tính
    view.on('double-click', function(event) {
        event.stopPropagation();
        view.hitTest(event).then(function(response) {
            const results = response.results.filter(r => r.graphic.layer === graphicsLayer);
            if (results.length > 0) {
                AppState.currentNewGraphic = results[0].graphic;
                document.querySelector('#attrModal .modal-title').textContent = 'Cập nhật thông tin đối tượng';
                document.getElementById('f_uid').value = AppState.currentNewGraphic.attributes.uid || '';
                document.getElementById('f_name').value = AppState.currentNewGraphic.attributes.Name || '';
                document.getElementById('f_category').value =
                    AppState.currentNewGraphic.attributes.Category || AppState.currentNewGraphic.attributes.Type || '';
                const attrModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('attrModal'));
                attrModal.show();
            }
        });
    });

    
// =============================================
    // UPDATE VỊ TRÍ (KÉO THẢ)
    // =============================================
    sketch.on('update', function(event) {
        if (event.state === 'complete') {
            event.graphics.forEach(g => {
                let geom = g.geometry;
                if (geom.spatialReference && geom.spatialReference.isWebMercator) {
                    geom = webMercatorUtils.webMercatorToGeographic(geom);
                }
                const db_id = g.attributes.db_id;
                if (!db_id || g.attributes.isProcessingNew) return;

                if (geom.type === 'point') {
                    const lon = geom.longitude.toFixed(6);
                    const lat = geom.latitude.toFixed(6);
                    if (g.attributes.Category === 'Điểm cô lập') {
                        const sqlId = !g.attributes.isFromDB ? `@NewIDP_${db_id}` : db_id;
                        AppState.sqlScriptLines.push(`-- [SỬA VỊ TRÍ] Điểm cô lập IDP=${sqlId}`);
                        AppState.sqlScriptLines.push(`UPDATE TOPO_POINT SET LONG=${lon}, LAT=${lat} WHERE IDP=${sqlId};`);
                    } else {
                        const sqlId = !g.attributes.isFromDB ? `@NewIDN_${db_id}` : db_id;
                        AppState.sqlScriptLines.push(`-- [SỬA VỊ TRÍ] Node ID=${sqlId}`);
                        AppState.sqlScriptLines.push(`UPDATE P SET LONG=${lon}, LAT=${lat} FROM TOPO_POINT P JOIN TOPO_NODE N ON P.IDP=N.IDP WHERE N.IDN=${sqlId};`);
                    }
                } else if (geom.type === 'polyline') {
                    if (!g.attributes.isFromDB && AppState.sqlScriptLines.length === 0) {
                        console.warn("⚠️ Bỏ qua sinh TOPO_ARC_POINT do IDA chưa được khởi tạo!");
                        return;
                    }
                    const sqlId = !g.attributes.isFromDB ? `@NewIDA_${db_id}` : db_id;
                    AppState.sqlScriptLines.push(`BEGIN TRANSACTION;`);
                    AppState.sqlScriptLines.push(`-- [SỬA VỊ TRÍ] Arc ID=${sqlId}`);
                    
                    let pts = geom.paths[0];
                    pts = deduplicatePoints(pts); // Dọn dẹp trên client
                    
                    // 1. Cập nhật vị trí của Node bắt đầu và Node kết thúc
                    if (g.attributes.FromNode) {
                        AppState.sqlScriptLines.push(`UPDATE P SET LONG=${pts[0][0].toFixed(6)}, LAT=${pts[0][1].toFixed(6)} FROM TOPO_POINT P JOIN TOPO_NODE N ON P.IDP=N.IDP WHERE N.IDN=${g.attributes.FromNode};`);
                    }
                    if (g.attributes.ToNode) {
                        AppState.sqlScriptLines.push(`UPDATE P SET LONG=${pts[pts.length-1][0].toFixed(6)}, LAT=${pts[pts.length-1][1].toFixed(6)} FROM TOPO_POINT P JOIN TOPO_NODE N ON P.IDP=N.IDP WHERE N.IDN=${g.attributes.ToNode};`);
                    }

                    // 2. Xóa triệt để các điểm trung gian cũ (tránh tạo ra điểm cô lập)
                    const tempVarOld = `OldPts_${db_id}_${Date.now().toString().slice(-4)}`;
                    AppState.sqlScriptLines.push(`DECLARE @${tempVarOld} TABLE (IDP INT);`);
                    AppState.sqlScriptLines.push(`INSERT INTO @${tempVarOld} SELECT IDP FROM TOPO_ARC_POINT WHERE IDA=${sqlId};`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA=${sqlId};`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_POINT WHERE IDP IN (SELECT IDP FROM @${tempVarOld});`);
                    
                    // 3. Chèn lại các điểm trung gian mới
                    pts.slice(1,-1).forEach((pt, i) => {
                        const tempId = Date.now().toString().slice(-5) + i;
                        const varPt  = `UpdIDP_${tempId}`;
                        AppState.sqlScriptLines.push(getPtSql(pt, `Mid_Upd_${tempId}`, varPt));
                        AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC_POINT (IDA,IDP,STT) VALUES (${sqlId},@${varPt},${i+1});`);
                    });
                    AppState.sqlScriptLines.push(`COMMIT;`);
                }
                
                // Update table row to reflect new coordinates
                let labelHtml = g.attributes.Name;
                if (geom.type === 'polyline') {
                    labelHtml = `${g.attributes.Name || ''} <small class="text-muted">[L:${g.attributes.PolyLeft ?? 'P0'} / R:${g.attributes.PolyRight ?? 'P0'}]</small>`;
                }
                uiManager.updateRowInTable(g, labelHtml);
            });

            // Tự động lưu và tải lại dữ liệu sau khi sửa vị trí
            if (window.executeSQLScript && AppState.sqlScriptLines.length > 0) {
                window.executeSQLScript();
            }
        }
    });

    // =============================================
    // XÓA ĐỐI TƯỢNG
    // =============================================
    sketch.on('delete', function(event) {
        event.graphics.forEach(g => {
            const db_id = g.attributes.db_id;
            const rowId = 'row_' + (g.attributes.uid || '').replace('.','_');
            const row = document.getElementById(rowId);
            if (row) row.remove();
            if (!db_id) return;

            if (g.geometry.type === 'point') {
                if (g.attributes.Category === 'Điểm cô lập' || (g.attributes.uid && (g.attributes.uid.includes('_raw') || g.attributes.uid.includes('_iso')))) {
                    const sqlId = !g.attributes.isFromDB ? `@NewIDP_${db_id}` : db_id;
                    AppState.sqlScriptLines.push(`-- [XÓA] Điểm cô lập / Điểm thô ID=${sqlId}`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_POINT WHERE IDP=${sqlId};`);
                } else {
                    const sqlId = !g.attributes.isFromDB ? `@NewIDN_${db_id}` : db_id;
                    AppState.sqlScriptLines.push(`-- [XÓA] Node ID=${sqlId} (cascade xóa POINT)`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDA IN (SELECT IDA FROM TOPO_ARC WHERE IDNB=${sqlId} OR IDNE=${sqlId});`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA IN (SELECT IDA FROM TOPO_ARC WHERE IDNB=${sqlId} OR IDNE=${sqlId});`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_ARC WHERE IDNB=${sqlId} OR IDNE=${sqlId};`);
                    
                    // Backup IDP to delete later
                    const tempVar = !g.attributes.isFromDB ? `DelPoint_${db_id}` : `DelPoint_${db_id}_${Date.now().toString().slice(-4)}`;
                    AppState.sqlScriptLines.push(`DECLARE @${tempVar} INT; SELECT @${tempVar} = IDP FROM TOPO_NODE WHERE IDN=${sqlId};`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_NODE WHERE IDN=${sqlId};`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_POINT WHERE IDP=@${tempVar};`);
                }
            } else if (g.geometry.type === 'polyline') {
                const sqlId = !g.attributes.isFromDB ? `@NewIDA_${db_id}` : db_id;
                AppState.sqlScriptLines.push(`-- [XÓA] Arc ID=${sqlId}`);
                AppState.sqlScriptLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDA=${sqlId};`);
                AppState.sqlScriptLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA=${sqlId};`);
                AppState.sqlScriptLines.push(`DELETE FROM TOPO_ARC WHERE IDA=${sqlId};`);
            } else if (g.geometry.type === 'polygon') {
                const sqlId = !g.attributes.isFromDB ? `@NewIDPO_${db_id}` : db_id;
                AppState.sqlScriptLines.push(`-- [XÓA] Poly ID=${sqlId}`);
                AppState.sqlScriptLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDPO=${sqlId};`);
                AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOL = NULL WHERE IDPOL=${sqlId};`);
                AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOR = NULL WHERE IDPOR=${sqlId};`);
                AppState.sqlScriptLines.push(`DELETE FROM TOPO_POLY WHERE IDPO=${sqlId};`);
            }
        });

        // Tự động lưu và tải lại dữ liệu sau khi xóa
        if (window.executeSQLScript && AppState.sqlScriptLines.length > 0) {
            window.executeSQLScript();
        }
    });


}
