/**
 * @module apiHandler
 * @description Giao tiếp với API để tải dữ liệu, hiển thị lên bản đồ và bảng.
 * Điều kiện đầu ra: Nạp chính xác dữ liệu (Point, Node, Arc, Polygon) từ server và render lên lớp Graphic.
 */
import { API_BASE } from './config.js';
import { clearTables, addRowToTable, filterIsolatedPoints } from './uiManager.js';

export async function refreshDashboardData(view, graphicsLayer, Graphic, AppState) {
    try {
        console.log("🔄 Đang tự động tải lại dữ liệu mới cho Dashboard...");

        // 1. Gọi API lấy dữ liệu mới nhất (Vô hiệu hóa cache trình duyệt)
        const res = await fetch(`${API_BASE}/api/topo`, { cache: 'no-store' });
        const data = await res.json();

        // Cập nhật phân loại "Điểm cô lập" bằng thuật toán chuẩn 100%
        if (data.raw_points) {
            // Giả định backend trả về nodes và arcPoints (hoặc ta tự map)
            // Nếu backend chỉ trả về nodePointIds/arcPointIds dưới dạng mảng ID:
            const allNodes = data.nodes || [];
            // Nếu arcPoints chưa có thì dùng data.arcPointIds để tạo cấu trúc map
            const allArcPoints = data.arcPoints || (data.arcPointIds ? data.arcPointIds.map(id => ({ idp: id })) : []);
            
            const isolatedPoints = filterIsolatedPoints(data.raw_points, allNodes, allArcPoints);
            const isolatedIds = new Set(isolatedPoints.map(p => p.idp || p.IDP));
            
            data.raw_points.forEach(p => {
                p.IS_ISOLATED = isolatedIds.has(p.idp || p.IDP);
            });
        }

        // 2. Cập nhật lại Trạng thái Ứng dụng (AppState)
        AppState.raw_points = data.raw_points || [];
        AppState.nodes      = data.nodes || [];
        AppState.arcs       = data.arcs || [];
        AppState.polygons   = data.polygons || [];
        AppState.regions    = data.regions || [];

        // 3. Xóa dữ liệu cũ trên giao diện
        clearTables();
        
        const newGraphics = [];

        // --- Hàm helper tạo Graphic và Tab Row ---
        const renderNodes = () => {
            AppState.nodes.forEach(n => {
                const g = new Graphic({
                    geometry: { type: 'point', longitude: n.longitude, latitude: n.latitude, spatialReference: { wkid: 4326 } },
                    symbol: { type: 'simple-marker', color: [0, 102, 204], size: 10, outline: { color: [255,255,255], width: 1.5 } },
                    attributes: { ...n, uid: Date.now() + Math.random().toString(), db_id: n.IDN, isFromDB: true },
                    popupTemplate: { title: '{Name}', content: 'Loại: <b>{Category}</b>' }
                });
                newGraphics.push(g);
                addRowToTable('tableNodes', g, n.Name, view);
            });
        };

        const renderArcs = () => {
            AppState.arcs.forEach(a => {
                const g = new Graphic({
                    geometry: { type: 'polyline', paths: a.paths, spatialReference: { wkid: 4326 } },
                    symbol: { type: 'simple-line', color: [226, 119, 40], width: 2.5 },
                    attributes: { ...a, uid: Date.now() + Math.random().toString(), db_id: a.IDA, isFromDB: true },
                    popupTemplate: { title: '{Name}', content: `Cung: <b>{Type}</b><br>Poly Trái: <b>{PolyLeft}</b> | Poly Phải: <b>{PolyRight}</b>` }
                });
                newGraphics.push(g);
                addRowToTable('tableArcs', g, `${a.Name} <small class="text-muted">[L:${a.PolyLeft ?? 'P0'} / R:${a.PolyRight ?? 'P0'}]</small>`, view);
            });
        };

        const renderPolys = () => {
            AppState.polygons.forEach(po => {
                const g = new Graphic({
                    geometry: { type: 'polygon', rings: po.rings, spatialReference: { wkid: 4326 } },
                    symbol: { type: 'simple-fill', color: [51, 153, 102, 0.35], outline: { color: [51, 153, 102], width: 2 } },
                    attributes: { ...po, uid: Date.now() + Math.random().toString(), db_id: po.IDPO, isFromDB: true },
                    popupTemplate: { title: '{Name}', content: '{Location}' }
                });
                newGraphics.push(g);
                addRowToTable('tablePolygons', g, po.Name, view);
            });
        };

        const renderRawPoints = () => {
            AppState.raw_points.forEach(p => {
                const idpGraphic = new Graphic({
                    geometry: { type: 'point', longitude: p.LONG, latitude: p.LAT, spatialReference: { wkid: 4326 } },
                    symbol: { type: "text", color: "darkred", font: { size: 10, weight: "bold", family: "sans-serif" }, haloColor: "white", haloSize: "2px", yoffset: 5 },
                    attributes: { uid: p.IDP + '_raw', db_id: p.IDP, Name: p.NAME }
                });
                newGraphics.push(idpGraphic);
                addRowToTable('tableRawPoints', idpGraphic, '', view);

                if (p.IS_ISOLATED && document.querySelector('#tableIsolatedPoints tbody')) {
                    const isoGraphic = new Graphic({
                        geometry: { type: 'point', longitude: p.LONG, latitude: p.LAT, spatialReference: { wkid: 4326 } },
                        symbol: { type: "simple-marker", style: "circle", color: [255, 0, 0], size: "10px", outline: { color: [255, 255, 255], width: 1 } },
                        attributes: { uid: p.IDP + '_iso', db_id: p.IDP, isFromDB: true, Name: p.NAME || '', Category: 'Điểm cô lập' },
                        popupTemplate: { title: `Điểm cô lập`, content: `IDP: <b>${p.IDP}</b><br>Tên: ${p.NAME || '(chưa đặt tên)'}` }
                    });
                    newGraphics.push(isoGraphic);
                    addRowToTable('tableIsolatedPoints', isoGraphic, '', view);
                }
            });
        };

        const renderRegions = () => {
            const tbodyReg = document.querySelector('#tableRegions tbody');
            AppState.regions.forEach(r => {
                const regionPolys = AppState.polygons.filter(po => po.IDR === r.IDR);
                const polyNames = regionPolys.length > 0 ? regionPolys.map(po => `[${po.IDPO}] ${po.Name}`).join(', ') : 'Chưa có đa giác';
                
                const tr = document.createElement('tr');
                tr.style.cursor = 'pointer';
                tr.title = `Click để zoom`;
                tr.id = 'row_' + r.IDR;
                tr.innerHTML = `
                    <td><input type="checkbox" class="form-check-input row-checkbox chk-row" data-dbid="${r.IDR}" data-uid="region_${r.IDR}" data-type="region"></td>
                    <td>${r.IDR}</td>
                    <td><strong>${r.DESCRIPTION}</strong><br><small class="text-muted">Gồm ${regionPolys.length} đa giác: ${polyNames}</small></td>
                    <td>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-warning btn-edit-row" title="Sửa">✏️</button>
                            <button class="btn btn-sm btn-outline-danger btn-delete-row" title="Xóa">🗑️</button>
                        </div>
                    </td>`;
                
                const chk = tr.querySelector('.chk-row');
                if (chk) {
                    chk.addEventListener('click', (e) => e.stopPropagation());
                }

                const btnEdit = tr.querySelector('.btn-edit-row');
                if (btnEdit) {
                    btnEdit.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (window.handleEditRow) {
                            // Tạo graphic giả mạo cho Vùng để dùng chung Modal
                            const pseudoGraphic = {
                                geometry: { type: 'polygon' }, // dummy
                                attributes: { 
                                    uid: `region_${r.IDR}`, 
                                    Name: r.DESCRIPTION, 
                                    Category: 'Vùng', 
                                    isFromDB: true, 
                                    type: 'region', 
                                    db_id: r.IDR 
                                }
                            };
                            window.handleEditRow(pseudoGraphic);
                        }
                    });
                }

                const btnDelete = tr.querySelector('.btn-delete-row');
                if (btnDelete) {
                    btnDelete.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (window.handleDeleteRows) {
                            const pseudoGraphic = { attributes: { uid: `region_${r.IDR}`, type: 'region', db_id: r.IDR } };
                            window.handleDeleteRows([pseudoGraphic]);
                        }
                    });
                }

                tr.addEventListener('click', (e) => {
                    if (e.target.closest('button') || e.target.closest('input')) return;
                    if (tbodyReg) tbodyReg.querySelectorAll('tr').forEach(r => r.classList.remove('table-active'));
                    tr.classList.add('table-active');

                    const polysInRegion = newGraphics.filter(g => g.geometry && g.geometry.type === 'polygon' && g.attributes.IDR === r.IDR);
                    if (polysInRegion.length > 0) {
                        let fullExtent = null;
                        polysInRegion.forEach(g => {
                            if (!fullExtent) fullExtent = g.geometry.extent.clone();
                            else fullExtent = fullExtent.union(g.geometry.extent);
                        });
                        view.goTo(fullExtent);
                        view.popup.open({ title: `Vùng: ${r.DESCRIPTION} (IDR: ${r.IDR})`, content: `Bao gồm <b>${polysInRegion.length}</b> đa giác.`, location: fullExtent.center });

                        const oldHighlight = graphicsLayer.graphics.find(g => g.attributes && g.attributes.isHighlightRegion);
                        if (oldHighlight) graphicsLayer.remove(oldHighlight);

                        const highlightGraphic = new Graphic({
                            geometry: fullExtent,
                            symbol: { type: "simple-fill", color: [255, 165, 0, 0.1], outline: { color: [255, 165, 0], width: 3 } },
                            attributes: { isHighlightRegion: true, isProcessingNew: true }
                        });
                        graphicsLayer.add(highlightGraphic);
                        setTimeout(() => graphicsLayer.remove(highlightGraphic), 5000);
                    } else {
                        alert("Vùng này hiện chưa có đa giác nào!");
                    }
                });
                if(tbodyReg) tbodyReg.appendChild(tr);
            });
        };

        // 4. Render vào Tabs
        renderRawPoints();
        renderNodes();
        renderArcs();
        renderPolys();
        renderRegions();

        // 5. Cập nhật Badge Counters
        const updateTabCounters = () => {
            const countIso = AppState.raw_points.filter(p => p.IS_ISOLATED).length;
            if (document.getElementById('countIsolatedPoints')) document.getElementById('countIsolatedPoints').textContent = countIso;
            if (document.getElementById('countNodes')) document.getElementById('countNodes').textContent = AppState.nodes.length;
            if (document.getElementById('countArcs')) document.getElementById('countArcs').textContent = AppState.arcs.length;
            if (document.getElementById('countPolys')) document.getElementById('countPolys').textContent = AppState.polygons.length;
            if (document.getElementById('countRegions')) document.getElementById('countRegions').textContent = AppState.regions.length;
        };
        updateTabCounters();

        // 6. Xóa và Vẽ lại Lớp Đồ họa trên Bản đồ
        const refreshMapLayers = () => {
            graphicsLayer.isInitialLoad = true;
            graphicsLayer.removeAll();
            graphicsLayer.addMany(newGraphics);
            setTimeout(() => { graphicsLayer.isInitialLoad = false; }, 500);
        };
        refreshMapLayers();

        console.log("✅ Đã cập nhật xong dữ liệu mới nhất cho toàn bộ Dashboard!");
    } catch (err) {
        console.error("❌ Lỗi khi tự động tải lại dữ liệu Dashboard:", err);
    }
}

