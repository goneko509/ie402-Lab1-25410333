/**
 * @module uiEvents
 * @description Đăng ký các sự kiện UI (lưu thuộc tính, xuất/chạy SQL).
 * Điều kiện đầu ra: Xử lý lưu dữ liệu đúng đối tượng và sinh SQL chuẩn.
 */
import { getPtSql, getNodeSql, deduplicatePoints } from './sqlGenerator.js';
import { API_BASE, TOLERANCE } from './config.js';
import { addRowToTable, updateRowInTable } from './uiManager.js';

export function initUIEvents(AppState, webMercatorUtils, graphicsLayer, view) {
    const attrModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('attrModal'));
    const sqlModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('sqlModal'));

    // =============================================
    // EXPORT / IMPORT DATABASE BACKUP (SQL)
    // =============================================
    document.getElementById('btnExportSQL').addEventListener('click', function() {
        if (confirm("Hệ thống sẽ tải về toàn bộ dữ liệu CSDL hiện tại thành file SQL. Tiếp tục?")) {
            window.location.href = `${API_BASE}/api/export-sql`;
        }
    });

    document.getElementById('fileImportSQL').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!confirm(`Bạn có chắc chắn muốn khôi phục CSDL từ file: ${file.name}? Dữ liệu hiện tại trên bản đồ sẽ bị xóa.`)) {
            e.target.value = ''; // Reset
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            const content = evt.target.result;
            // Tách content thành mảng các dòng để gửi qua API execute-sql
            // Vì execute-sql tự bọc BEGIN TRAN, ta có thể gửi từng dòng lên
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            // Show loading
            if (document.getElementById('autoTopoLoading')) {
                document.getElementById('autoTopoLoading').style.display = 'block';
            }

            fetch(`${API_BASE}/api/execute-sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scriptLines: lines })
            })
            .then(res => res.json())
            .then(resData => {
                if (document.getElementById('autoTopoLoading')) {
                    document.getElementById('autoTopoLoading').style.display = 'none';
                }
                if (resData.success) {
                    alert('Khôi phục cơ sở dữ liệu thành công!');
                    if (window.refreshDashboardData) window.refreshDashboardData();
                    else if (window.loadData) window.loadData();
                } else {
                    alert('Lỗi: ' + resData.message);
                }
            })
            .catch(err => {
                if (document.getElementById('autoTopoLoading')) {
                    document.getElementById('autoTopoLoading').style.display = 'none';
                }
                alert('Lỗi kết nối khi import: ' + err);
            });
            
            // Reset
            e.target.value = '';
        };
        reader.readAsText(file);
    });

// =============================================
    // LƯU THUỘC TÍNH + SINH SQL
    // =============================================
    document.getElementById('btnSaveAttr').addEventListener('click', function() {
        if (!AppState.currentNewGraphic) return;

        const name = document.getElementById('f_name').value || 'Không tên';
        const cat  = document.getElementById('f_category').value || '';

        AppState.currentNewGraphic.attributes.Name = name;
        
        // --- XỬ LÝ RIÊNG CHO VÙNG (REGION) ---
        if (AppState.currentNewGraphic.attributes.type === 'region') {
            const db_id = AppState.currentNewGraphic.attributes.db_id;
            AppState.sqlScriptLines.push(`-- [SỬA THUỘC TÍNH] Vùng IDR=${db_id}`);
            AppState.sqlScriptLines.push(`UPDATE TOPO_REGION SET DESCRIPTION=N'${name}' WHERE IDR=${db_id};`);
            
            // Cập nhật UI ngay lập tức
            const tr = document.getElementById('row_' + db_id);
            if (tr) {
                const td = tr.querySelectorAll('td')[2];
                if (td) {
                    const smallHtml = td.querySelector('small') ? td.querySelector('small').innerHTML : '';
                    td.innerHTML = `<strong>${name}</strong><br><small class="text-muted">${smallHtml}</small>`;
                }
            }

            bootstrap.Modal.getInstance(document.getElementById('attrModal')).hide();
            return;
        }

        if (AppState.currentNewGraphic.geometry && AppState.currentNewGraphic.geometry.type === 'point') 
            AppState.currentNewGraphic.attributes.Category = cat;
        else 
            AppState.currentNewGraphic.attributes.Type = cat;

        let geom = AppState.currentNewGraphic.geometry;
        if (geom.spatialReference && (geom.spatialReference.isWebMercator || geom.spatialReference.wkid === 102100 || geom.spatialReference.wkid === 3857)) {
            geom = webMercatorUtils.webMercatorToGeographic(geom);
        }
        const isUpdate = !!AppState.currentNewGraphic.attributes.isFromDB;
        const db_id    = AppState.currentNewGraphic.attributes.db_id;

        if (isUpdate) {
            // --- UPDATE THUỘC TÍNH & HÌNH HỌC ---
            if (geom.type === 'point') {
                if (AppState.currentNewGraphic.attributes.Category === 'Điểm cô lập') {
                    const sqlId = db_id >= 1000 ? `@NewIDP_${db_id}` : db_id;
                    AppState.sqlScriptLines.push(`-- [SỬA THUỘC TÍNH & HÌNH HỌC] Điểm cô lập IDP=${sqlId}`);
                    AppState.sqlScriptLines.push(`UPDATE TOPO_POINT SET NAME=N'${name}', LONG=${geom.longitude}, LAT=${geom.latitude} WHERE IDP=${sqlId};`);
                } else {
                    const sqlId = db_id >= 1000 ? `@NewIDN_${db_id}` : db_id;
                    AppState.sqlScriptLines.push(`-- [SỬA THUỘC TÍNH & HÌNH HỌC] Node ID=${sqlId}`);
                    AppState.sqlScriptLines.push(`UPDATE N SET N.NAME=N'${name}', N.CATEGORY=N'${cat}' FROM TOPO_NODE N WHERE N.IDN=${sqlId};`);
                    AppState.sqlScriptLines.push(`UPDATE P SET P.NAME=N'${name}', P.LONG=${geom.longitude}, P.LAT=${geom.latitude} FROM TOPO_POINT P JOIN TOPO_NODE N ON P.IDP=N.IDP WHERE N.IDN=${sqlId};`);
                }
            } else if (geom.type === 'polyline') {
                if (db_id >= 1000 && AppState.sqlScriptLines.length === 0) {
                    console.warn("⚠️ Bỏ qua sinh TOPO_ARC_POINT do IDA chưa được khởi tạo!");
                    return;
                }
                const sqlId = db_id >= 1000 ? `@NewIDA_${db_id}` : db_id;
                AppState.sqlScriptLines.push(`-- [SỬA THUỘC TÍNH & HÌNH HỌC] Arc ID=${sqlId}`);
                AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET NAME=N'${name}', TYPE=N'${cat}' WHERE IDA=${sqlId};`);
                
                let pts = geom.paths[0];
                pts = deduplicatePoints(pts);
                
                if (pts.length >= 2) {
                    const ptS = pts[0];
                    const ptE = pts[pts.length - 1];
                    
                    AppState.sqlScriptLines.push(`-- Cập nhật tọa độ Node đầu và Node cuối`);
                    AppState.sqlScriptLines.push(`UPDATE TOPO_POINT SET LONG=${ptS[0]}, LAT=${ptS[1]} WHERE IDP = (SELECT IDP FROM TOPO_NODE WHERE IDN = (SELECT IDNB FROM TOPO_ARC WHERE IDA=${sqlId}));`);
                    AppState.sqlScriptLines.push(`UPDATE TOPO_POINT SET LONG=${ptE[0]}, LAT=${ptE[1]} WHERE IDP = (SELECT IDP FROM TOPO_NODE WHERE IDN = (SELECT IDNE FROM TOPO_ARC WHERE IDA=${sqlId}));`);
                    
                    AppState.sqlScriptLines.push(`-- Xóa điểm trung gian cũ`);
                    AppState.sqlScriptLines.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA=${sqlId};`);
                    
                    if (pts.length > 2) {
                        AppState.sqlScriptLines.push(`-- Thêm điểm trung gian mới`);
                        pts.slice(1, -1).forEach((pt, i) => {
                            const varPt = `IDP_M_Upd_${db_id}_${i+1}`;
                            AppState.sqlScriptLines.push(getPtSql(pt, `Mid_Upd_${name}_${i+1}`, varPt));
                            AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (${sqlId}, @${varPt}, ${i+1});`);
                        });
                    }
                }
            } else if (geom.type === 'polygon') {
                if (db_id >= 1000 && AppState.sqlScriptLines.length === 0) {
                    console.warn("⚠️ Bỏ qua sinh TOPO_POLY do IDPO chưa được khởi tạo!");
                    return;
                }
                const sqlId = db_id >= 1000 ? `@NewIDPO_${db_id}` : db_id;
                AppState.sqlScriptLines.push(`-- [SỬA THUỘC TÍNH] Poly ID=${sqlId}`);
                AppState.sqlScriptLines.push(`UPDATE TOPO_POLY SET NAME=N'${name}', LOCATION=N'${cat}' WHERE IDPO=${sqlId};`);
            }
            let labelHtml = name;
            if (geom.type === 'polyline') {
                labelHtml = `${name} <small class="text-muted">[L:${AppState.currentNewGraphic.attributes.PolyLeft ?? 'P0'} / R:${AppState.currentNewGraphic.attributes.PolyRight ?? 'P0'}]</small>`;
            }
            updateRowInTable(AppState.currentNewGraphic, labelHtml);
        } else {
            // --- INSERT MỚI ---
            if (geom.type === 'point') {
                AppState.maxIdP++;
                AppState.currentNewGraphic.attributes.db_id = AppState.maxIdP;
                const varP = `NewIDP_${AppState.maxIdP}`;
                AppState.sqlScriptLines.push(`BEGIN TRANSACTION;`);
                AppState.sqlScriptLines.push(`-- [MỚI] Điểm cô lập (Point đơn thuần, không phải Node)`);
                AppState.sqlScriptLines.push(getPtSql([geom.longitude, geom.latitude], name, varP));
                AppState.sqlScriptLines.push(`COMMIT;`);
                addRowToTable('tableIsolatedPoints', AppState.currentNewGraphic, name, view);
            } else if (geom.type === 'polyline') {
                AppState.maxIdA++;
                AppState.currentNewGraphic.attributes.db_id = AppState.maxIdA;
                
                // Dọn dẹp danh sách Điểm trên Client
                let pts = geom.paths[0];
                pts = deduplicatePoints(pts);
                
                const ptS = pts[0], ptE = pts[pts.length - 1];
                const varPS = `IDP_S_${AppState.maxIdA}`, varNS = `IDN_S_${AppState.maxIdA}`;
                const varPE = `IDP_E_${AppState.maxIdA}`, varNE = `IDN_E_${AppState.maxIdA}`;
                const varA  = `@NewIDA_${AppState.maxIdA}`;
                
                AppState.sqlScriptLines.push(`BEGIN TRANSACTION;`);
                AppState.sqlScriptLines.push(`-- [MỚI] Arc (Topo: IDPOL/IDPOR mặc định NULL)`);
                
                // Start Point & Node
                AppState.sqlScriptLines.push(getPtSql(ptS, `Start_${name}`, varPS));
                AppState.sqlScriptLines.push(getNodeSql(varPS, `Start_${name}`, 'Auto'));
                
                // End Point & Node
                AppState.sqlScriptLines.push(getPtSql(ptE, `End_${name}`, varPE));
                AppState.sqlScriptLines.push(getNodeSql(varPE, `End_${name}`, 'Auto'));
                
                AppState.sqlScriptLines.push(`-- =============================================`);
                AppState.sqlScriptLines.push(`-- BƯỚC 3: TẠO CUNG VÀ GÁN ĐIỂM TRUNG GIAN BẰNG IDP ĐÃ LỌC TRÙNG`);
                AppState.sqlScriptLines.push(`-- =============================================`);
                
                // Lấy IDN
                AppState.sqlScriptLines.push(`DECLARE @${varNS} INT; SELECT TOP 1 @${varNS} = IDN FROM TOPO_NODE WHERE IDP = @${varPS};`);
                AppState.sqlScriptLines.push(`DECLARE @${varNE} INT; SELECT TOP 1 @${varNE} = IDN FROM TOPO_NODE WHERE IDP = @${varPE};`);
                
                // Insert Arc
                AppState.sqlScriptLines.push(`DECLARE ${varA} INT;`);
                AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC (IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES (@${varNS}, @${varNE}, NULL, NULL, N'${name}', N'${cat}');`);
                AppState.sqlScriptLines.push(`SET ${varA} = SCOPE_IDENTITY();`);
                
                // Middle points
                if (pts.length > 2) {
                    pts.slice(1, -1).forEach((pt, i) => {
                        const varPt = `IDP_M_${AppState.maxIdA}_${i+1}`;
                        AppState.sqlScriptLines.push(getPtSql(pt, `Mid_${name}_${i+1}`, varPt));
                        AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (${varA}, @${varPt}, ${i+1});`);
                    });
                }
                AppState.sqlScriptLines.push(`COMMIT;`);
                addRowToTable('tableArcs', AppState.currentNewGraphic, name, view);
            } else if (geom.type === 'polygon') {
                let pts = [];
                if (!AppState.currentNewGraphic.attributes.fromDetectedCycle) {
                    pts = [...geom.rings[0]];
                    if (pts.length > 0 && (pts[0][0] !== pts[pts.length-1][0] || pts[0][1] !== pts[pts.length-1][1])) {
                        pts.push(pts[0]); // Đảm bảo khép kín
                    }
                    pts = deduplicatePoints(pts);
                }
                
                let isRealPolygon = true;
                if (!AppState.currentNewGraphic.attributes.fromDetectedCycle && pts) {
                    let uniquePts = new Set();
                    pts.forEach(p => uniquePts.add(`${p[0].toFixed(6)}_${p[1].toFixed(6)}`));
                    if (uniquePts.size < 3) isRealPolygon = false;
                }
                
                if (isRealPolygon) {
                    AppState.maxIdPo++;
                    AppState.currentNewGraphic.attributes.db_id = AppState.maxIdPo;
                    const newIdPo = AppState.maxIdPo;
                    
                    AppState.sqlScriptLines.push(`BEGIN TRANSACTION;`);
                    AppState.sqlScriptLines.push(`-- [MỚI] Tạo Đa giác (Polygon) IDPO=${newIdPo}`);
                    AppState.sqlScriptLines.push(`DECLARE @NewIDPO_${newIdPo} INT;`);
                    AppState.sqlScriptLines.push(`INSERT INTO TOPO_POLY (NAME, LOCATION, IDR) VALUES (N'${name}', N'${cat}', NULL);`);
                    AppState.sqlScriptLines.push(`SET @NewIDPO_${newIdPo} = SCOPE_IDENTITY();`);
                    
                    if (AppState.currentNewGraphic.attributes.fromDetectedCycle) {
                        const cycleArcs = AppState.currentNewGraphic.attributes.cycleArcs;
                        const isCCW = AppState.currentNewGraphic.attributes.isCCW;
                        
                        cycleArcs.forEach((arcObj, i) => {
                            const arcG = arcObj.arc;
                            const forward = arcObj.forward;
                            const arcId = arcG.attributes.db_id;
                            const sqlArcId = arcId >= 1000 ? `@NewIDA_${arcId}` : arcId;
                            
                            if (isCCW === forward) {
                                // Polygon is on the Left
                                AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOL = @NewIDPO_${newIdPo} WHERE IDA = ${sqlArcId};`);
                                arcG.attributes.IDPOL = newIdPo; 
                                arcG.attributes.PolyLeft = newIdPo;
                            } else {
                                // Polygon is on the Right
                                AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOR = @NewIDPO_${newIdPo} WHERE IDA = ${sqlArcId};`);
                                arcG.attributes.IDPOR = newIdPo;
                                arcG.attributes.PolyRight = newIdPo;
                            }
                            AppState.sqlScriptLines.push(`INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES (@NewIDPO_${newIdPo}, ${sqlArcId}, ${i+1});`);
                        });
                    } else {
                        // Xử lý vẽ Đa giác thủ công: Tạo vòng khép kín độc lập (Self-closing Loop)
                        AppState.maxIdA++;
                        const arcId = AppState.maxIdA;
                        const S = pts[0]; // Điểm gập (bắt đầu = kết thúc)
                        
                        AppState.sqlScriptLines.push(`-- Step 1 & 2: Tạo CHỈ 1 NODE duy nhất cho Đa giác khép kín độc lập`);
                        AppState.sqlScriptLines.push(getPtSql(S, `Đỉnh khép kín P1`, `IDP_Loop_${arcId}`));
                        AppState.sqlScriptLines.push(getNodeSql(`IDP_Loop_${arcId}`, `Nút khép kín N1`, 'Loop Node'));
                        AppState.sqlScriptLines.push(`DECLARE @IDN_Loop_${arcId} INT; SELECT TOP 1 @IDN_Loop_${arcId} = IDN FROM TOPO_NODE WHERE IDP = @IDP_Loop_${arcId};`);
                        
                        AppState.sqlScriptLines.push(`-- Step 4: Tạo CHỈ 1 ARC duy nhất có Node đầu TRÙNG Node cuối`);
                        AppState.sqlScriptLines.push(`DECLARE @IDA_Loop_${arcId} INT;`);
                        AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC (IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES (@IDN_Loop_${arcId}, @IDN_Loop_${arcId}, @NewIDPO_${newIdPo}, NULL, N'Cung vòng khép kín ${arcId}', N'Loop Boundary');`);
                        AppState.sqlScriptLines.push(`SET @IDA_Loop_${arcId} = SCOPE_IDENTITY();`);
                        
                        AppState.sqlScriptLines.push(`-- Step 5: Lưu lại Arc ID cho thao tác sau này`);
                        const varA  = `@NewIDA_${AppState.maxIdA}`;
                        AppState.sqlScriptLines.push(`DECLARE ${varA} INT;`);
                        AppState.sqlScriptLines.push(`SET ${varA} = @IDA_Loop_${arcId};`);
                        
                        AppState.sqlScriptLines.push(`-- Step 6: Lưu ArcPoint cho vòng khép kín`);
                        if (pts.length > 2) {
                            pts.slice(1, -1).forEach((pt, i) => {
                                const varPt = `IDP_M_Loop_${arcId}_${i+1}`;
                                AppState.sqlScriptLines.push(getPtSql(pt, `Trung gian Loop ${i+1}`, varPt));
                                AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (${varA}, @${varPt}, ${i+1});`);
                            });
                        }
                        
                        AppState.sqlScriptLines.push(`-- Step 6: Khép kín Đa giác chỉ với 1 ARC duy nhất`);
                        AppState.sqlScriptLines.push(`INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES (@NewIDPO_${newIdPo}, ${varA}, 1);`);
                    }
                    AppState.sqlScriptLines.push(`COMMIT;`);
                    addRowToTable('tablePolygons', AppState.currentNewGraphic, name, view);
                } else {
                    // FALLBACK: Đa giác chỉ có 2 điểm -> Cung râu ria
                    AppState.maxIdA++;
                    AppState.currentNewGraphic.attributes.db_id = AppState.maxIdA;
                    
                    // Tìm 2 điểm khác biệt
                    let uniqueList = [];
                    pts.forEach(p => {
                        let isDup = uniqueList.some(up => Math.abs(up[0]-p[0]) < 1e-6 && Math.abs(up[1]-p[1]) < 1e-6);
                        if (!isDup) uniqueList.push(p);
                    });
                    
                    const ptS = uniqueList[0] || pts[0];
                    const ptE = uniqueList[1] || pts[1];
                    
                    const varPS = `IDP_S_${AppState.maxIdA}`, varNS = `IDN_S_${AppState.maxIdA}`;
                    const varPE = `IDP_E_${AppState.maxIdA}`, varNE = `IDN_E_${AppState.maxIdA}`;
                    const varA  = `@NewIDA_${AppState.maxIdA}`;
                    
                    AppState.sqlScriptLines.push(`BEGIN TRANSACTION;`);
                    AppState.sqlScriptLines.push(`-- [CẢNH BÁO] Đa giác vẽ tay chỉ có 2 điểm -> Chuyển thành Cung râu ria (Antenna)`);
                    
                    AppState.sqlScriptLines.push(getPtSql(ptS, `Start_${name}`, varPS));
                    AppState.sqlScriptLines.push(getNodeSql(varPS, `Start_${name}`, 'Fallback Antenna'));
                    AppState.sqlScriptLines.push(`DECLARE ${varNS} INT; SELECT TOP 1 ${varNS} = IDN FROM TOPO_NODE WHERE IDP = @${varPS};`);
                    
                    AppState.sqlScriptLines.push(getPtSql(ptE, `End_${name}`, varPE));
                    AppState.sqlScriptLines.push(getNodeSql(varPE, `End_${name}`, 'Fallback Antenna'));
                    AppState.sqlScriptLines.push(`DECLARE ${varNE} INT; SELECT TOP 1 ${varNE} = IDN FROM TOPO_NODE WHERE IDP = @${varPE};`);
                    
                    AppState.sqlScriptLines.push(`INSERT INTO TOPO_ARC (IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES (${varNS}, ${varNE}, NULL, NULL, N'${name} (Cung râu ria)', N'Boundary');`);
                    
                    AppState.sqlScriptLines.push(`COMMIT;`);
                    addRowToTable('tableArcs', AppState.currentNewGraphic, name, view);
                    
                    // Đổi symbol thành đường thẳng để hiển thị đúng
                    AppState.currentNewGraphic.symbol = { type: 'simple-line', color: [226, 119, 40], width: 2.5 };
                    
                    alert("Cảnh báo: Đa giác vẽ tay không đủ diện tích 2D (chỉ có 2 điểm), hệ thống đã tự động chuyển đổi và lưu dưới dạng Cung thẳng (ARC râu ria).");
                }
            }
            AppState.currentNewGraphic.attributes.isFromDB = true;
            delete AppState.currentNewGraphic.attributes.isProcessingNew;
        }

        attrModal.hide();
        AppState.currentNewGraphic = null;
        
        // Thực thi ngay lập tức lưu vào DB theo yêu cầu mới
        window.executeSQLScript();
    });

    
// =============================================
    // NÚT TẢI LẠI
    // =============================================
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', function() {
            if (window.refreshDashboardData) window.refreshDashboardData();
            else if (window.loadData) window.loadData();
        });
    }

// =============================================
    // LƯU TRỰC TIẾP VÀO DB (Thay thế Xuất SQL)
    // =============================================
    window.executeSQLScript = function() {
        if (AppState.sqlScriptLines.length === 0) { 
            return; 
        }
        const btnSaveDB = document.getElementById('btnSaveDB');
        if (btnSaveDB) {
            btnSaveDB.disabled = true;
            btnSaveDB.textContent = 'Đang lưu...';
        }
        
        // --- SỬA LỖI: Tự động khai báo biến dùng chung ở đầu Transaction ---
        let fullScript = AppState.sqlScriptLines.join('\n');
        
        // Tìm tất cả các biến có dạng @NewIDxxx_yyy, @UpdIDA_yyy, @IDP_M_xxx, v.v.
        const varRegex = /@(NewID[A-Z]+_\d+|UpdIDA_\d+|ID[PNA]_Loop_\d+|ID[PN]_[SE]_\d+|IDP_M_[A-Za-z0-9_]+)/g;
        let matches = fullScript.match(varRegex) || [];
        let uniqueVars = [...new Set(matches)];
        
        // Xóa tất cả các câu lệnh DECLARE cho các biến này nằm rải rác trong script
        // Dùng Regex thay thế để xóa triệt để ngay cả trong chuỗi multiline
        const declareRegex = new RegExp(`DECLARE\\s+@(NewID[A-Z]+_\\d+|UpdIDA_\\d+|ID[PNA]_Loop_\\d+|ID[PN]_[SE]_\\d+|IDP_M_[A-Za-z0-9_]+)\\s+INT[^;]*;?`, 'g');
        fullScript = fullScript.replace(declareRegex, '');

        // Khôi phục phép gán (nếu có) bị Regex xóa nhầm (ví dụ DECLARE @var INT = @IDA_Loop; -> SET @var = @IDA_Loop;)
        // Việc này quá rủi ro nên thay vì bắt Regex quá rộng, ta chỉ bắt DECLARE @var INT;
        // Nếu có khai báo = @IDA_Loop thì ta thay JS sinh mã thành DECLARE và SET tách biệt!
        let declareLines = uniqueVars.map(v => `DECLARE ${v} INT;`);
        
        // Nối các lệnh DECLARE lên trên cùng
        let finalScript = declareLines.join('\n') + '\n' + fullScript;

        fetch(`${API_BASE}/api/execute-sql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scriptLines: [finalScript] })
        })
        .then(r => r.json())
        .then(d => {
            if (d.success) { 
                AppState.sqlScriptLines = []; 
                if (window.refreshDashboardData) window.refreshDashboardData();
                else if (window.loadData) window.loadData();
                
                // Show bottom toast notification
                const toastEl = document.getElementById('bottomToast');
                const toastMsg = document.getElementById('bottomToastMsg');
                if (toastEl && toastMsg) {
                    toastMsg.textContent = 'Đã lưu thay đổi vào CSDL thành công!';
                    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
                    toast.show();
                }
            } else {
                alert('Lỗi khi lưu CSDL: ' + d.message);
            }
        })
        .catch(err => alert('Không kết nối được server: ' + err.message))
        .finally(() => { 
            if (btnSaveDB) {
                btnSaveDB.disabled = false;
                btnSaveDB.textContent = '💾 Lưu DB';
            }
        });
    };

    const btnSaveDB = document.getElementById('btnSaveDB');
    if (btnSaveDB) {
        btnSaveDB.addEventListener('click', function() {
            if (AppState.sqlScriptLines.length === 0) { 
                alert('Chưa có thay đổi nào cần lưu!'); 
                return; 
            }
            window.executeSQLScript();
        });
    }

    
}
