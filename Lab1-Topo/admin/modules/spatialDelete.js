// Không dùng ES Module import để tránh lỗi trộn lẫn với AMD loader của ArcGIS
let isDeleteMode = false;

export function initSpatialDelete(view, graphicsLayer, webMercatorUtils, AppState, sketch, geometryEngine) {
    if (!view || !graphicsLayer) {
        console.error("❌ MapView hoặc GraphicsLayer chưa sẵn sàng!");
        return;
    }

    // Thiết lập style cho delete lasso nếu dùng sketch.viewModel
    sketch.viewModel.polygonSymbol = {
        type: "simple-fill",
        color: [255, 0, 0, 0.2],
        outline: {
            color: [255, 0, 0, 0.8],
            width: 2,
            style: "dash"
        }
    };
    let deleteSketchVM = sketch.viewModel;
    
    // BẮT BỘC: Gán vào window để toàn bộ ứng dụng truy cập được
    window.deleteSketchVM = deleteSketchVM;
    window.mapView = view;
    window.tempDeleteLayer = graphicsLayer;

    console.log("✅ window.deleteSketchVM đã khởi tạo thành công!");

    // --- Bổ sung: Lắng nghe sự kiện vẽ xong Lasso từ deleteSketchVM ---
    deleteSketchVM.on("create", function (event) {
        if (event.state === "complete") {
            if (AppState.currentInteractionMode !== "DELETE_LASSO") {
                console.log("ℹ️ Nét vẽ không thuộc công cụ xóa, bỏ qua logic spatialDelete.");
                return;
            }
            
            console.log("🎯 Đã hoàn thành nét vẽ Lasso chọn vùng xóa!");
            try {
                // Xóa graphic Lasso khỏi map để không để lại nét vẽ dư thừa
                graphicsLayer.remove(event.graphic);
                AppState.isSpatialDeleteMode = false;
                AppState.currentInteractionMode = "NONE";

                // --- BẮT ĐẦU TÍNH THỐNG KÊ ---
                let countPt = 0, countArc = 0, countPoly = 0;
                
                // Reset global state
                AppState.currentSelectionState = { points: [], arcs: [], polys: [], graphics: [] };
                
                // Chuẩn hóa Hình học Lasso SOTA (Geometry Simplification)
                let lassoGeometry = event.graphic.geometry;
                let cleanLassoGeom = lassoGeometry;
                if (lassoGeometry.type === 'polygon') {
                    cleanLassoGeom = geometryEngine.simplify(lassoGeometry) || lassoGeometry;
                }
                
                let normalizedSelection = cleanLassoGeom;
                if (cleanLassoGeom && cleanLassoGeom.spatialReference && cleanLassoGeom.spatialReference.isWebMercator) {
                    normalizedSelection = webMercatorUtils.webMercatorToGeographic(cleanLassoGeom);
                }

                // Thuật toán quét giao cắt chuẩn xác (Spatial Intersecting)
                let bufferedSelection = normalizedSelection;
                try {
                    bufferedSelection = geometryEngine.buffer(normalizedSelection, 1e-6, "degrees");
                } catch(e) {
                    console.error("Buffer error:", e);
                }

                graphicsLayer.graphics.forEach(g => {
                    if (!g.geometry) return;
                    let graphicGeom = g.geometry;
                    if (g.geometry.spatialReference && g.geometry.spatialReference.isWebMercator) {
                        graphicGeom = webMercatorUtils.webMercatorToGeographic(g.geometry);
                    }
                    if (geometryEngine.intersects(graphicGeom, bufferedSelection)) {
                        AppState.currentSelectionState.graphics.push(g);
                        const db_id = g.attributes ? g.attributes.db_id : null;
                        if (db_id) {
                            if (g.geometry.type === 'point') { countPt++; AppState.currentSelectionState.points.push(db_id); }
                            else if (g.geometry.type === 'polyline') { countArc++; AppState.currentSelectionState.arcs.push(db_id); }
                            else if (g.geometry.type === 'polygon') { countPoly++; AppState.currentSelectionState.polys.push(db_id); }
                        }
                    }
                });

                document.getElementById('statDelPoint').textContent = countPt;
                document.getElementById('statDelArc').textContent = countArc;
                document.getElementById('statDelPoly').textContent = countPoly;
                // --- KẾT THÚC THỐNG KÊ ---

                const spatialDeleteModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('spatialDeleteModal'));
                spatialDeleteModal.show();
            } catch (err) {
                alert("Lỗi khi quét không gian: " + err.message);
                console.error(err);
            }
        }
    });

    // Sự kiện click đã được di chuyển sang Event Delegation ở admin.js

    // Xóa nút Preview không còn sử dụng
    // btnPreviewSpatialDelete logic is removed

    // Hàm xử lý sự kiện bấm nút sinh SQL xóa
    window.handleGenerateDeleteSQL = function() {
        try {
            console.log("--> Đã kích hoạt sự kiện sinh SQL xóa...");

            // 1. Lấy trạng thái ô chọn (Checkboxes) từ Modal
            const deletePoints = document.getElementById('chkDelPoint')?.checked ?? false;
            const deleteArcs   = document.getElementById('chkDelArc')?.checked ?? false;
            const deletePolys  = document.getElementById('chkDelPoly')?.checked ?? false;

            // 2. Lấy danh sách ID đã chọn từ trạng thái vùng chọn
            const state = AppState.currentSelectionState || { points: [], arcs: [], polys: [], graphics: [] };
            
            if (state.points.length === 0 && state.arcs.length === 0 && state.polys.length === 0) {
                alert("Không có đối tượng nào được ghi nhận trong vùng chọn!");
                return;
            }

            let hasSelectedAny = false;
            if (deletePoints && state.points.length > 0) hasSelectedAny = true;
            if (deleteArcs && state.arcs.length > 0) hasSelectedAny = true;
            if (deletePolys && state.polys.length > 0) hasSelectedAny = true;

            if (!hasSelectedAny) {
                alert("Bạn phải tick chọn ít nhất 1 loại đối tượng (Điểm/Cung/Đa giác) hiện đang có trong vùng!");
                return;
            }

            const nodeIds = [];
            const isoPointIds = [];
            const arcs = [];
            const polys = [];

            if (state.graphics) {
                state.graphics.forEach(g => {
                    const db_id = g.attributes ? g.attributes.db_id : null;
                    if (!db_id) return;
                    
                    if (deletePoints && g.geometry.type === 'point') {
                        if (g.attributes.Category === 'Điểm cô lập' || (g.attributes.uid && (g.attributes.uid.includes('_raw') || g.attributes.uid.includes('_iso')))) {
                            isoPointIds.push(db_id);
                        } else {
                            nodeIds.push(db_id);
                        }
                    }
                    else if (deleteArcs && g.geometry.type === 'polyline') arcs.push(db_id);
                    else if (deletePolys && g.geometry.type === 'polygon') polys.push(db_id);
                });
            }

            // 3. Quy trình xóa dòng thác toàn vẹn Tô-pô (SOTA TOPOLOGICAL CASCADE DELETE)
            let sLines = [];
            sLines.push("BEGIN TRANSACTION;");
            sLines.push("");

            // Xóa POLYGON
            if (polys.length > 0) {
                const polyIds = polys.join(', ');
                sLines.push(`-- 1. XÓA POLYGON`);
                sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDPO IN (${polyIds});`);
                sLines.push(`UPDATE TOPO_ARC SET IDPOL = NULL WHERE IDPOL IN (${polyIds});`);
                sLines.push(`UPDATE TOPO_ARC SET IDPOR = NULL WHERE IDPOR IN (${polyIds});`);
                sLines.push(`DELETE FROM TOPO_POLY WHERE IDPO IN (${polyIds});`);
                sLines.push("");
            }

            // Xóa ARC
            if (arcs.length > 0) {
                const arcIds = arcs.join(', ');
                sLines.push(`-- 2. XÓA ARC VÀ BẢO TOÀN TÔ-PÔ`);
                // Tìm các Polygon bị hỏng do mất cung ranh giới
                sLines.push(`DECLARE @BrokenPolysFromArc TABLE (IDPO INT);`);
                sLines.push(`INSERT INTO @BrokenPolysFromArc`);
                sLines.push(`SELECT IDPOL FROM TOPO_ARC WHERE IDA IN (${arcIds}) AND IDPOL IS NOT NULL`);
                sLines.push(`UNION`);
                sLines.push(`SELECT IDPOR FROM TOPO_ARC WHERE IDA IN (${arcIds}) AND IDPOR IS NOT NULL;`);
                
                // Cascade Delete các Polygon bị hỏng
                sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDPO IN (SELECT IDPO FROM @BrokenPolysFromArc);`);
                sLines.push(`UPDATE TOPO_ARC SET IDPOL = NULL WHERE IDPOL IN (SELECT IDPO FROM @BrokenPolysFromArc);`);
                sLines.push(`UPDATE TOPO_ARC SET IDPOR = NULL WHERE IDPOR IN (SELECT IDPO FROM @BrokenPolysFromArc);`);
                sLines.push(`DELETE FROM TOPO_POLY WHERE IDPO IN (SELECT IDPO FROM @BrokenPolysFromArc);`);

                // Xóa Cung
                sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDA IN (${arcIds});`);
                sLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA IN (${arcIds});`);
                sLines.push(`DELETE FROM TOPO_ARC WHERE IDA IN (${arcIds});`);
                sLines.push("");
            }

            // Xóa NODE
            if (nodeIds.length > 0) {
                const nIds = nodeIds.join(', ');
                sLines.push(`-- 3. XÓA NODE VÀ CASCADE CASCADE`);
                
                // Tìm các Cung nối với Node này
                sLines.push(`DECLARE @BrokenArcsFromNode TABLE (IDA INT);`);
                sLines.push(`INSERT INTO @BrokenArcsFromNode SELECT IDA FROM TOPO_ARC WHERE IDNB IN (${nIds}) OR IDNE IN (${nIds});`);
                
                // Tìm các Polygon bị hỏng do mất các Cung trên
                sLines.push(`DECLARE @BrokenPolysFromNode TABLE (IDPO INT);`);
                sLines.push(`INSERT INTO @BrokenPolysFromNode`);
                sLines.push(`SELECT IDPOL FROM TOPO_ARC WHERE IDA IN (SELECT IDA FROM @BrokenArcsFromNode) AND IDPOL IS NOT NULL`);
                sLines.push(`UNION`);
                sLines.push(`SELECT IDPOR FROM TOPO_ARC WHERE IDA IN (SELECT IDA FROM @BrokenArcsFromNode) AND IDPOR IS NOT NULL;`);
                
                // Cascade Delete Polygon
                sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDPO IN (SELECT IDPO FROM @BrokenPolysFromNode);`);
                sLines.push(`UPDATE TOPO_ARC SET IDPOL = NULL WHERE IDPOL IN (SELECT IDPO FROM @BrokenPolysFromNode);`);
                sLines.push(`UPDATE TOPO_ARC SET IDPOR = NULL WHERE IDPOR IN (SELECT IDPO FROM @BrokenPolysFromNode);`);
                sLines.push(`DELETE FROM TOPO_POLY WHERE IDPO IN (SELECT IDPO FROM @BrokenPolysFromNode);`);
                
                // Cascade Delete Arc
                sLines.push(`DELETE FROM TOPO_POLY_ARC WHERE IDA IN (SELECT IDA FROM @BrokenArcsFromNode);`);
                sLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA IN (SELECT IDA FROM @BrokenArcsFromNode);`);
                sLines.push(`DELETE FROM TOPO_ARC WHERE IDA IN (SELECT IDA FROM @BrokenArcsFromNode);`);
                
                // Xóa Node và thu hồi tọa độ Point (chỉ khi IDP không còn được dùng ở nơi khác)
                sLines.push(`DECLARE @DelPoints TABLE (IDP INT);`);
                sLines.push(`INSERT INTO @DelPoints SELECT IDP FROM TOPO_NODE WHERE IDN IN (${nIds});`);
                sLines.push(`DELETE FROM TOPO_NODE WHERE IDN IN (${nIds});`);
                
                sLines.push(`-- Dọn dẹp TOPO_POINT nếu không còn bị tham chiếu bởi NODE hay ARC_POINT`);
                sLines.push(`DELETE FROM TOPO_POINT WHERE IDP IN (SELECT IDP FROM @DelPoints) `);
                sLines.push(`  AND IDP NOT IN (SELECT IDP FROM TOPO_NODE)`);
                sLines.push(`  AND IDP NOT IN (SELECT IDP FROM TOPO_ARC_POINT);`);
                sLines.push("");
            }

            // Xóa RAW POINT / ISOLATED POINT
            if (isoPointIds.length > 0) {
                const pIds = isoPointIds.join(', ');
                sLines.push(`-- 4. XÓA ĐIỂM CÔ LẬP`);
                sLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDP IN (${pIds});`);
                sLines.push(`DELETE FROM TOPO_NODE WHERE IDP IN (${pIds});`);
                sLines.push(`DELETE FROM TOPO_POINT WHERE IDP IN (${pIds});`);
                sLines.push("");
            }

            sLines.push("COMMIT;");
            
            // 4. Tự động lưu CSDL và kích hoạt Tái lập Tô-pô
            const spatialDeleteModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('spatialDeleteModal'));
            spatialDeleteModal.hide();
            AppState.sqlScriptLines = sLines;

            // Xóa graphic khỏi map tạm thời
            if (state.graphics) {
                state.graphics.forEach(g => {
                    let removeIt = false;
                    if (deletePoints && g.geometry.type === 'point') removeIt = true;
                    if (deleteArcs && g.geometry.type === 'polyline') removeIt = true;
                    if (deletePolys && g.geometry.type === 'polygon') removeIt = true;
                    if (removeIt) graphicsLayer.remove(g);
                });
            }

            if (window.executeSQLScript) {
                // Tự động thực thi không cần hiện Modal xác nhận mã SQL
                const originalExecute = window.executeSQLScript;
                window.executeSQLScript().then(() => {
                    if (window.refreshDashboardData) {
                        window.refreshDashboardData();
                    }
                    console.log("--> Kích hoạt tự động Tái lập Tô-pô (SOTA Auto Rebuild) sau khi xóa...");
                    if (window.runAutoTopo) {
                        window.runAutoTopo();
                    } else {
                        const btnAutoTopo = document.getElementById('btnAutoTopo');
                        if (btnAutoTopo) btnAutoTopo.click();
                    }
                });
            } else {
                alert("Lỗi: Không tìm thấy hàm thực thi SQL.");
            }

        } catch (error) {
            console.error("Lỗi khi sinh mã SQL xóa:", error);
            alert("Có lỗi xảy ra trong quá trình sinh mã SQL: " + error.message);
        }
    };

    // Sử dụng Ủy quyền sự kiện (Event Delegation) trực tiếp trên document
    document.addEventListener('click', function(e) {
        if (e.target && (e.target.id === 'btnConfirmSpatialDelete' || e.target.closest('#btnConfirmSpatialDelete'))) {
            e.preventDefault();
            window.handleGenerateDeleteSQL();
        }
    });

}
