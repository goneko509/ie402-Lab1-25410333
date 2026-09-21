/**
 * @module spatialRebuildArc
 * @description Logic bẻ gãy Cung (Arc) và tái cấu trúc mạng lưới Tô-pô (Node/Arc) chuẩn xác. Áp dụng Strict Decomposition Rule.
 */
import { getPtSql, generateExportSQL } from './sqlGenerator.js';

// --- Các hàm tiện ích toán học 2D ---
function ptKey(pt) {
    return pt[0].toFixed(6) + ',' + pt[1].toFixed(6);
}

function distanceSq(p1, p2) {
    return (p1[0]-p2[0])**2 + (p1[1]-p2[1])**2;
}

// Khoảng cách từ điểm p đến đoạn thẳng v-w
function distToSegmentSquared(p, v, w) {
    let l2 = distanceSq(v, w);
    if (l2 === 0) return distanceSq(p, v);
    let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    return distanceSq(p, [v[0] + t * (w[0] - v[0]), v[1] + t * (w[1] - v[1])]);
}

export function initRebuildArc(view, graphicsLayer, Graphic, geometryEngine, webMercatorUtils, AppState, sketch) {
    const btnAutoTopo = document.getElementById('btnAutoTopo');
    if (!btnAutoTopo) return;

    btnAutoTopo.addEventListener('click', function() {
        const autoTopoModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('autoTopoModal'));
        autoTopoModal.show();
        
        document.getElementById('autoTopoLoading').style.display = 'block';
        document.getElementById('autoTopoResult').style.display = 'none';
        document.getElementById('btnConfirmAutoTopo').disabled = true;

        setTimeout(() => {
            try {
                let allPolylines = graphicsLayer.graphics.filter(g => g.geometry && g.geometry.type === 'polyline').items;
                let allPoints = graphicsLayer.graphics.filter(g => g.geometry && g.geometry.type === 'point').items;
                
                if (allPolylines.length === 0 && allPoints.length === 0) {
                    alert("Không có dữ liệu không gian nào để xử lý.");
                    document.getElementById('autoTopoLoading').style.display = 'none';
                    autoTopoModal.hide();
                    return;
                }

                // ==========================================
                                // ==========================================
                // BƯỚC 1: XÁC ĐỊNH DANH SÁCH NODE (GIAO ĐIỂM + ĐẦU MÚT)
                // ==========================================
                let candidateNodes = new Map();
                
                function addCandidate(pt, isEndpoint) {
                    let k = ptKey(pt);
                    if (!candidateNodes.has(k)) {
                        candidateNodes.set(k, { pt: pt, isEndpoint: isEndpoint, degree: 0 });
                    } else {
                        if (isEndpoint) candidateNodes.get(k).isEndpoint = true;
                    }
                }

                // Đưa đầu mút của mọi Arc vào Node (Cố định là Node)
                allPolylines.forEach(g => {
                    let path = g.geometry.paths[0];
                    if (path && path.length > 0) {
                        addCandidate(path[0], true);
                        addCandidate(path[path.length - 1], true);
                    }
                });

                // Đưa Graphic Points vào danh sách ứng viên
                allPoints.forEach(g => {
                    addCandidate([g.geometry.longitude, g.geometry.latitude], false);
                });

                // Tìm giao điểm giữa các Cung gốc
                for (let i = 0; i < allPolylines.length; i++) {
                    for (let j = i + 1; j < allPolylines.length; j++) {
                        let inter = geometryEngine.intersect(allPolylines[i].geometry, allPolylines[j].geometry);
                        if (inter) {
                            if (inter.type === "point") {
                                addCandidate([inter.longitude, inter.latitude], false);
                            } else if (inter.type === "multipoint") {
                                inter.points.forEach(p => addCandidate(p, false));
                            } else if (inter.type === "polyline") {
                                inter.paths.forEach(path => {
                                    if (path.length > 0) {
                                        addCandidate(path[0], false);
                                        addCandidate(path[path.length - 1], false);
                                    }
                                });
                            }
                        }
                    }
                }

                // TÍNH TOÁN BẬC (DEGREE) CHO TỪNG CANDIDATE NODE
                let allNodesList = Array.from(candidateNodes.values());
                allPolylines.forEach(g => {
                    let path = g.geometry.paths[0];
                    if (!path || path.length < 2) return;
                    
                    // Với mỗi đường, kiểm tra xem có đi qua candidate node nào không
                    allNodesList.forEach(cand => {
                        let isEndpointOfThis = (ptKey(cand.pt) === ptKey(path[0]) || ptKey(cand.pt) === ptKey(path[path.length - 1]));
                        if (isEndpointOfThis) {
                            cand.degree += 1; // Đầu mút đóng góp 1 nhánh
                            return;
                        }
                        
                        // Kiểm tra xem cand có nằm giữa đường không (không phải mút)
                        let isOnLine = false;
                        for (let i = 0; i < path.length - 1; i++) {
                            if (distToSegmentSquared(cand.pt, path[i], path[i+1]) < 1e-12) {
                                isOnLine = true;
                                break;
                            }
                        }
                        if (isOnLine) {
                            cand.degree += 2; // Nằm giữa đường -> 1 vào, 1 ra -> đóng góp 2 nhánh
                        }
                    });
                });

                // LỌC NODE CHUẨN (STRICT NODE FILTERING)
                let nodesMap = new Map(); // Chỉ chứa Node hợp lệ
                allNodesList.forEach(cand => {
                    // Nếu là đầu mút của một polyline bất kỳ -> CHẮC CHẮN LÀ NODE
                    // HOẶC nếu tổng nhánh (degree) >= 3 -> CHẮC CHẮN LÀ NODE
                    if (cand.isEndpoint || cand.degree >= 3) {
                        nodesMap.set(ptKey(cand.pt), cand.pt);
                    }
                    // Nếu degree == 2 và KHÔNG phải endpoint -> BỊ LOẠI BỎ (Chỉ là TOPO_ARC_POINT)
                    // Nếu degree == 0 (điểm cô lập hoàn toàn) -> Không bẻ cung nào cả
                });

                let allNodes = Array.from(nodesMap.values()); // CHỈ CHỨA CÁC NODE HỢP LỆ (DÙNG ĐỂ BẺ CUNG)
                let nodeKeysSet = new Set(nodesMap.keys());

                // ==========================================// ==========================================
                // BƯỚC 2: PHÂN RÃ CUNG THEO LUẬT STRICT DECOMPOSITION
                // ==========================================
                let atomicArcs = [];
                let arcCounter = 1;

                allPolylines.forEach(origArc => {
                    let path = origArc.geometry.paths[0];
                    if (!path || path.length < 2) return;
                    
                    let currentPath = [path[0]];
                    let subArcIndex = 1;

                    for (let i = 0; i < path.length - 1; i++) {
                        let p1 = path[i];
                        let p2 = path[i+1];
                        
                        // Tìm các Node nằm TRÊN đoạn segment [p1, p2]
                        let nodesOnSegment = [];
                        allNodes.forEach(nPt => {
                            if (ptKey(nPt) === ptKey(p1) || ptKey(nPt) === ptKey(p2)) return;
                            if (distToSegmentSquared(nPt, p1, p2) < 1e-12) {
                                nodesOnSegment.push(nPt);
                            }
                        });

                        nodesOnSegment.sort((a, b) => distanceSq(p1, a) - distanceSq(p1, b));

                        for (let nPt of nodesOnSegment) {
                            currentPath.push(nPt);
                            let parentName = origArc.attributes.Name || `ARC_${arcCounter}`;
                            let atomicName = parentName + '_' + subArcIndex;
                            
                            atomicArcs.push({
                                path: [...currentPath],
                                startNodeKey: ptKey(currentPath[0]),
                                endNodeKey: ptKey(currentPath[currentPath.length - 1]),
                                leftPolyId: null,
                                rightPolyId: null,
                                parentArc: origArc,
                                name: atomicName
                            });
                            
                            subArcIndex++;
                            currentPath = [nPt];
                        }
                        
                        currentPath.push(p2);
                        
                        if (nodeKeysSet.has(ptKey(p2)) && i < path.length - 1) {
                            if (currentPath.length > 1) {
                                let parentName = origArc.attributes.Name || `ARC_${arcCounter}`;
                                let atomicName = parentName + (subArcIndex > 1 || i < path.length - 2 ? '_' + subArcIndex : '');
                                
                                atomicArcs.push({
                                    path: [...currentPath],
                                    startNodeKey: ptKey(currentPath[0]),
                                    endNodeKey: ptKey(currentPath[currentPath.length - 1]),
                                    leftPolyId: null,
                                    rightPolyId: null,
                                    parentArc: origArc,
                                    name: atomicName
                                });
                                subArcIndex++;
                            }
                            currentPath = [p2];
                        }
                    }
                    
                    if (currentPath.length > 1) {
                        let parentName = origArc.attributes.Name || `ARC_${arcCounter}`;
                        let atomicName = parentName + (subArcIndex > 1 ? '_' + subArcIndex : '');
                        atomicArcs.push({
                            path: [...currentPath],
                            startNodeKey: ptKey(currentPath[0]),
                            endNodeKey: ptKey(currentPath[currentPath.length - 1]),
                            leftPolyId: null,
                            rightPolyId: null,
                            parentArc: origArc,
                            name: atomicName
                        });
                    }
                    arcCounter++;
                });

                atomicArcs.forEach(arc => {
                    if (arc.name.endsWith('_1')) {
                        let siblings = atomicArcs.filter(a => a.parentArc === arc.parentArc);
                        if (siblings.length === 1) {
                            arc.name = arc.name.slice(0, -2);
                        }
                    }
                });

                // ==========================================
                // BƯỚC 3: (ĐÃ BỊ LOẠI BỎ THEO YÊU CẦU: TỰ ĐỘNG TẠO ĐA GIÁC)
                // ==========================================

                // ==========================================
                // BƯỚC 4: BẢO TỒN ĐIỂM CÔ LẬP
                // ==========================================
                let isolatedPoints = [];
                let allPathKeys = new Set();
                atomicArcs.forEach(a => a.path.forEach(p => allPathKeys.add(ptKey(p))));
                
                allPoints.forEach(ptG => {
                    let k = ptKey([ptG.geometry.longitude, ptG.geometry.latitude]);
                    if (!allPathKeys.has(k)) {
                        isolatedPoints.push({
                            pt: [ptG.geometry.longitude, ptG.geometry.latitude],
                            name: ptG.attributes.Name || 'Isolated Point'
                        });
                    }
                });

                // ==========================================
                // BƯỚC 5: BIÊN DỊCH KỊCH BẢN SQL
                // ==========================================
                let points = [];
                let nodes = [];
                let arcs = [];
                let polys = [];
                let arcPoints = [];
                let polyArcs = [];
                
                let ptIdx = 1;
                let ptMap = new Map();
                
                function getOrAddPoint(ptCoords, name) {
                    let k = ptKey(ptCoords);
                    if (!ptMap.has(k)) {
                        let idp = ptIdx++;
                        ptMap.set(k, idp);
                        points.push({ idp, name: name || ('Point_' + idp), lon: ptCoords[0].toFixed(6), lat: ptCoords[1].toFixed(6) });
                        return idp;
                    }
                    return ptMap.get(k);
                }
                
                let nodeIdx = 1;
                let nodeMap = new Map();
                for (let nk of nodeKeysSet) {
                    let ptCoords = nodesMap.get(nk);
                    let idp = getOrAddPoint(ptCoords, 'NodePoint_' + nodeIdx);
                    let idn = nodeIdx++;
                    nodeMap.set(nk, idn);
                    nodes.push({ idn, idp, name: 'Node_' + idn, category: 'Junction' });
                }
                
                // (Đã loại bỏ tự động tạo POLY)
                isolatedPoints.forEach(iso => {
                    getOrAddPoint(iso.pt, iso.name);
                });
                
                let arcIdx = 1;
                  
                atomicArcs.forEach((arc, i) => {
                    let ida = arcIdx++;
                    const idnb = nodeMap.get(arc.startNodeKey);
                    const idne = nodeMap.get(arc.endNodeKey);
                    
                    let arcType = arc.parentArc ? (arc.parentArc.attributes.Type || arc.parentArc.attributes.Category || 'Line') : 'Line';
                    
                    arcs.push({
                        ida,
                        name: arc.name,
                        idnb,
                        idne,
                        idpol: null,
                        idpor: null,
                        type: arcType
                    });
                    
                    if (arc.path.length > 2) {
                        for (let k = 1; k < arc.path.length - 1; k++) {
                            let idp = getOrAddPoint(arc.path[k], 'ArcPoint_' + ida + '_' + k);
                            arcPoints.push({ ida, idp, stt: k });
                        }
                    }
                });
                
                // (Đã loại bỏ tự động tạo POLY_ARC)
                
                let autoTopoSQL = generateExportSQL({ points, nodes, arcs, polys, arcPoints, polyArcs });

                document.getElementById('lblTopoNodes').textContent = nodeKeysSet.size;
                document.getElementById('lblTopoArcs').textContent = atomicArcs.length;
                document.getElementById('lblTopoPolys').textContent = 0;
                
                document.getElementById('autoTopoLoading').style.display = 'none';
                document.getElementById('autoTopoResult').style.display = 'block';
                document.getElementById('btnConfirmAutoTopo').disabled = false;

                AppState.autoTopoSQL = autoTopoSQL;

            } catch (err) {
                console.error("Lỗi khi xây dựng Topo:", err);
                alert("Lỗi khi xây dựng Topo: " + err.message);
                document.getElementById('autoTopoLoading').style.display = 'none';
            }
        }, 500);
    });

    document.getElementById('btnConfirmAutoTopo').addEventListener('click', () => {
        const autoTopoModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('autoTopoModal'));
        autoTopoModal.hide();
        AppState.sqlScriptLines = AppState.autoTopoSQL;
        if (window.executeSQLScript) {
            window.executeSQLScript();
        } else {
            alert("Lỗi: Không tìm thấy hàm thực thi SQL.");
        }
    });
}
