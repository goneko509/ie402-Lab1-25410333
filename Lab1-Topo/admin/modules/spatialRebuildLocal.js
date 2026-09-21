/**
 * @module spatialRebuildLocal
 * @description Xây dựng mạng lưới ARC và Polygon Cục bộ thông qua công cụ Lasso.
 */
import { getPtSql } from './sqlGenerator.js';

function ptKey(pt) {
    if (!pt) return '';
    return `${pt[0].toFixed(6)}_${pt[1].toFixed(6)}`;
}

export function initSpatialRebuildLocal(view, graphicsLayer, webMercatorUtils, AppState, Graphic, geometryEngine, sketch) {
    sketch.viewModel.polygonSymbol = {
        type: "simple-fill",
        color: [0, 255, 255, 0.2], // Cyan trong suốt
        outline: {
            color: [0, 255, 255, 0.8],
            width: 2,
            style: "dash"
        }
    };
    
    let rebuildSketchVM = sketch.viewModel;
    window.rebuildLassoSketchVM = rebuildSketchVM;

    rebuildSketchVM.on("create", function (event) {
        if (AppState.currentInteractionMode !== "REBUILD_LASSO") return;

        if (event.state === "complete") {
            const lassoPolygon = event.graphic.geometry;
            graphicsLayer.remove(event.graphic);

            processLocalRebuild(lassoPolygon, view, graphicsLayer, webMercatorUtils, AppState, Graphic, geometryEngine);
            
            // Tắt chế độ sau khi hoàn thành
            AppState.currentInteractionMode = "NONE";
            const btnRebuildLasso = document.getElementById('btnRebuildLasso');
            if (btnRebuildLasso) {
                btnRebuildLasso.classList.remove('active');
            }
        }
    });

    return rebuildSketchVM;
}

function processLocalRebuild(lassoPolygon, view, graphicsLayer, webMercatorUtils, AppState) {
    try {
        if (document.getElementById('autoTopoLoading')) {
            document.getElementById('autoTopoLoading').style.display = 'block';
            document.getElementById('autoTopoResult').style.display = 'none';
            const autoTopoModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('autoTopoModal'));
            autoTopoModal.show();
        }

        setTimeout(() => {
            // ==========================================
            // BƯỚC 1: LỌC CÁC ĐỐI TƯỢNG TRONG VÙNG LASSO
            // ==========================================
            let targetPolylines = [];
            let targetPoints = [];
            let targetPolygons = []; // Dùng để tham chiếu khi giữ IDPO

            graphicsLayer.graphics.forEach(g => {
                if (g.geometry) {
                    // Cắt hoặc nằm hoàn toàn bên trong
                    if (geometryEngine.intersects(lassoPolygon, g.geometry)) {
                        if (g.geometry.type === 'polyline') {
                            targetPolylines.push(g);
                        } else if (g.geometry.type === 'point' && g.attributes && g.attributes.Category !== 'Điểm cô lập') {
                            targetPoints.push(g);
                        } else if (g.geometry.type === 'polygon') {
                            targetPolygons.push(g);
                        }
                    }
                }
            });

            if (targetPolylines.length === 0) {
                alert("Không có đoạn thẳng nào trong vùng khoanh!");
                if (document.getElementById('autoTopoLoading')) {
                    const autoTopoModal = bootstrap.Modal.getInstance(document.getElementById('autoTopoModal'));
                    if (autoTopoModal) autoTopoModal.hide();
                }
                return;
            }

            // ==========================================
            // BƯỚC 2: TÌM GIAO ĐIỂM (CỤC BỘ) VÀ PHÂN RÃ CUNG
            // ==========================================
            let segments = [];
            targetPolylines.forEach(g => {
                let path = g.geometry.paths[0];
                for (let i = 0; i < path.length - 1; i++) {
                    segments.push({
                        p1: path[i],
                        p2: path[i + 1],
                        originalGraphic: g
                    });
                }
            });

            // Tìm giao điểm giữa các đoạn (chỉ trong tập target)
            for (let i = 0; i < segments.length; i++) {
                for (let j = i + 1; j < segments.length; j++) {
                    let s1 = segments[i];
                    let s2 = segments[j];
                    
                    let p11 = view.toScreen({ x: s1.p1[0], y: s1.p1[1], spatialReference: view.spatialReference });
                    let p12 = view.toScreen({ x: s1.p2[0], y: s1.p2[1], spatialReference: view.spatialReference });
                    let p21 = view.toScreen({ x: s2.p1[0], y: s2.p1[1], spatialReference: view.spatialReference });
                    let p22 = view.toScreen({ x: s2.p2[0], y: s2.p2[1], spatialReference: view.spatialReference });
                    
                    if (!p11 || !p12 || !p21 || !p22) continue;

                    let inter = intersect(
                        p11.x, p11.y, p12.x, p12.y,
                        p21.x, p21.y, p22.x, p22.y
                    );
                    
                    if (inter) {
                        let mapPt = view.toMap({ x: inter.x, y: inter.y });
                        if (mapPt) {
                            let ptArr = [mapPt.x, mapPt.y];
                            s1.intersections = s1.intersections || [];
                            s2.intersections = s2.intersections || [];
                            s1.intersections.push(ptArr);
                            s2.intersections.push(ptArr);
                        }
                    }
                }
            }

            function intersect(x1, y1, x2, y2, x3, y3, x4, y4) {
                let denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
                if (denom == 0) return null;
                let ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
                let ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
                if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
                    return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
                }
                return null;
            }

            let graph = new Map();
            let nodeKeys = new Set();
            
            function addEdge(pA, pB) {
                let kA = ptKey(pA);
                let kB = ptKey(pB);
                if (kA === kB) return;
                
                nodeKeys.add(kA);
                nodeKeys.add(kB);
                
                if (!graph.has(kA)) graph.set(kA, { pt: pA, adj: [] });
                if (!graph.has(kB)) graph.set(kB, { pt: pB, adj: [] });
                
                if (!graph.get(kA).adj.includes(kB)) graph.get(kA).adj.push(kB);
                if (!graph.get(kB).adj.includes(kA)) graph.get(kB).adj.push(kA);
            }

            segments.forEach(s => {
                let pts = [s.p1];
                if (s.intersections) {
                    s.intersections.sort((a, b) => {
                        let dxA = a[0] - s.p1[0], dyA = a[1] - s.p1[1];
                        let dxB = b[0] - s.p1[0], dyB = b[1] - s.p1[1];
                        return (dxA*dxA + dyA*dyA) - (dxB*dxB + dyB*dyB);
                    });
                    pts = pts.concat(s.intersections);
                }
                pts.push(s.p2);
                
                let dedupe = [];
                pts.forEach(p => {
                    if (dedupe.length === 0) dedupe.push(p);
                    else {
                        let last = dedupe[dedupe.length-1];
                        if (Math.abs(last[0]-p[0]) > 0.0001 || Math.abs(last[1]-p[1]) > 0.0001) {
                            dedupe.push(p);
                        }
                    }
                });
                
                for (let i = 0; i < dedupe.length - 1; i++) {
                    addEdge(dedupe[i], dedupe[i + 1]);
                }
            });

            // ==========================================
            // BƯỚC 3: XÂY DỰNG CUNG NGUYÊN TỬ VÀ PLANAR TRAVERSAL
            // ==========================================
            let atomicArcs = [];
            let visitedEdges = new Set();

            nodeKeys.forEach(nk => {
                let n = graph.get(nk);
                if (n.adj.length !== 2) {
                    n.adj.forEach(adjK => {
                        let edgeKey1 = nk + '-' + adjK;
                        let edgeKey2 = adjK + '-' + nk;
                        if (!visitedEdges.has(edgeKey1) && !visitedEdges.has(edgeKey2)) {
                            let arcPath = [n.pt];
                            let currK = adjK;
                            let prevK = nk;
                            visitedEdges.add(edgeKey1);
                            visitedEdges.add(edgeKey2);
                            
                            while (true) {
                                arcPath.push(graph.get(currK).pt);
                                let currN = graph.get(currK);
                                if (currN.adj.length !== 2) break;
                                
                                let nextK = currN.adj[0] === prevK ? currN.adj[1] : currN.adj[0];
                                let ek1 = currK + '-' + nextK;
                                let ek2 = nextK + '-' + currK;
                                visitedEdges.add(ek1);
                                visitedEdges.add(ek2);
                                
                                prevK = currK;
                                currK = nextK;
                            }
                            atomicArcs.push({
                                path: arcPath,
                                startNodeKey: nk,
                                endNodeKey: currK,
                                leftPolyId: null,
                                rightPolyId: null
                            });
                        }
                    });
                }
            });

            nodeKeys.forEach(nk => {
                let n = graph.get(nk);
                n.adj.sort((a, b) => {
                    let ptA = graph.get(a).pt;
                    let ptB = graph.get(b).pt;
                    let angA = Math.atan2(ptA[1] - n.pt[1], ptA[0] - n.pt[0]);
                    let angB = Math.atan2(ptB[1] - n.pt[1], ptB[0] - n.pt[0]);
                    return angA - angB;
                });
            });

            let directedEdges = new Set();
            atomicArcs.forEach((arc, i) => {
                directedEdges.add(`${arc.startNodeKey}->${arc.endNodeKey}`);
                directedEdges.add(`${arc.endNodeKey}->${arc.startNodeKey}`);
            });

            let polygons = [];
            let polyCount = 1;

            directedEdges.forEach(de => {
                if (!directedEdges.has(de)) return;
                
                let cycle = [];
                let currEdge = de;
                
                while (true) {
                    directedEdges.delete(currEdge);
                    let parts = currEdge.split('->');
                    let u = parts[0], v = parts[1];
                    
                    let arcIdx = atomicArcs.findIndex(a => 
                        (a.startNodeKey === u && a.endNodeKey === v) ||
                        (a.startNodeKey === v && a.endNodeKey === u)
                    );
                    
                    if (arcIdx === -1) break; // Should not happen
                    
                    cycle.push({ arcIndex: arcIdx, isForward: atomicArcs[arcIdx].startNodeKey === u });
                    
                    let nodeV = graph.get(v);
                    let revUIdx = nodeV.adj.indexOf(u);
                    let nextWIdx = (revUIdx + 1) % nodeV.adj.length;
                    let w = nodeV.adj[nextWIdx];
                    
                    currEdge = `${v}->${w}`;
                    if (currEdge === de) break; // Cycle complete
                    if (!directedEdges.has(currEdge)) {
                        cycle = null; // Invalid or already visited
                        break;
                    }
                }
                
                if (cycle && cycle.length > 2) {
                    // Check area to filter out outer boundaries (negative area in WebMercator typical convention)
                    let area = 0;
                    for (let c of cycle) {
                        let arc = atomicArcs[c.arcIndex];
                        let pts = c.isForward ? arc.path : [...arc.path].reverse();
                        for (let i = 0; i < pts.length - 1; i++) {
                            area += pts[i][0] * pts[i+1][1] - pts[i+1][0] * pts[i][1];
                        }
                    }
                    area = area / 2;
                    
                    if (area > 0) {
                        let polyId = polyCount++;
                        polygons.push({ id: polyId, cycle: cycle, area: area });
                        
                        cycle.forEach(c => {
                            if (c.isForward) atomicArcs[c.arcIndex].leftPolyId = polyId;
                            else atomicArcs[c.arcIndex].rightPolyId = polyId;
                        });
                    }
                }
            });

            // ==========================================
            // BƯỚC 4: BIÊN DỊCH KỊCH BẢN SQL GIA TĂNG (LOCAL DIFF)
            // ==========================================
            let autoTopoSQL = [];
            
            // CHỈ lấy các thực thể NẰM TRONG LASSO (targetPolylines, targetPolygons)
            let oldNodes = new Map(); 
            let oldArcs = new Map();
            let oldPolys = [];
            let allOldNodeIds = new Set();
            let allOldArcIds = new Set();
            let allOldPolyIds = new Set();

            targetPolylines.forEach(g => {
                if (g.attributes && g.attributes.db_id) {
                    let db_id = g.attributes.db_id;
                    let path = g.geometry.paths[0];
                    let k1 = path.map(p => ptKey(p)).join('|');
                    let k2 = [...path].reverse().map(p => ptKey(p)).join('|');
                    oldArcs.set(k1, db_id);
                    oldArcs.set(k2, db_id);
                    allOldArcIds.add(db_id);
                }
            });

            targetPoints.forEach(g => {
                if (g.attributes && g.attributes.db_id) {
                    oldNodes.set(ptKey([g.geometry.longitude, g.geometry.latitude]), { idn: g.attributes.db_id, idp: g.attributes.idp });
                    allOldNodeIds.add(g.attributes.db_id);
                }
            });

            targetPolygons.forEach(g => {
                if (g.attributes && g.attributes.db_id) {
                    let area = 0;
                    try { area = geometryEngine.geodesicArea(g.geometry, "square-meters"); } catch(e){}
                    oldPolys.push({ idpo: g.attributes.db_id, area: area, geom: g.geometry });
                    allOldPolyIds.add(g.attributes.db_id);
                }
            });

            // Mapping Nodes
            let mappedNodes = new Map();
            let usedOldNodeIds = new Set();
            let nodeIdx = 1;
            for (let nk of nodeKeys) {
                let n = graph.get(nk).pt;
                let k = ptKey(n);
                if (oldNodes.has(k)) {
                    let oldN = oldNodes.get(k);
                    mappedNodes.set(nk, { idn: oldN.idn, idp: oldN.idp, isNew: false, sqlVar: oldN.idn });
                    usedOldNodeIds.add(oldN.idn);
                } else {
                    mappedNodes.set(nk, { isNew: true, sqlVar: `TNode_N_${nodeIdx}` });
                    nodeIdx++;
                }
            }

            // Mapping Arcs
            let mappedArcs = [];
            let usedOldArcIds = new Set();
            atomicArcs.forEach((arc, i) => {
                let k1 = arc.path.map(p => ptKey(p)).join('|');
                if (oldArcs.has(k1)) {
                    let oldIda = oldArcs.get(k1);
                    mappedArcs.push({ arc, ida: oldIda, isNew: false, sqlVar: oldIda });
                    usedOldArcIds.add(oldIda);
                } else {
                    mappedArcs.push({ arc, isNew: true, sqlVar: `@NewArc_${i}` });
                }
            });

            // Mapping Polygons
            let mappedPolys = [];
            let usedOldPolyIds = new Set();
            polygons.forEach((poly, idx) => {
                let ring = [];
                poly.cycle.forEach(c => {
                    let arc = atomicArcs[c.arcIndex];
                    let pth = c.isForward ? arc.path : [...arc.path].reverse();
                    for (let i = 0; i < pth.length - 1; i++) ring.push(pth[i]);
                });
                ring.push(ring[0]); 
                
                let tempPolyGeom = new Graphic({
                    geometry: { type: "polygon", rings: [ring], spatialReference: view.spatialReference }
                }).geometry;
                
                let tempArea = 0;
                try { tempArea = geometryEngine.geodesicArea(tempPolyGeom, "square-meters"); } catch(e){}
                
                let bestMatchId = null;
                let maxOverlapRatio = 0;
                
                for (let op of oldPolys) {
                    if (usedOldPolyIds.has(op.idpo)) continue;
                    if (geometryEngine.intersects(tempPolyGeom, op.geom)) {
                        let intersection = geometryEngine.intersect(tempPolyGeom, op.geom);
                        if (intersection) {
                            let overlapArea = 0;
                            try { overlapArea = geometryEngine.geodesicArea(intersection, "square-meters"); } catch(e){}
                            if (op.area > 0 && tempArea > 0) {
                                let ratio1 = overlapArea / op.area;
                                let ratio2 = overlapArea / tempArea;
                                if (ratio1 > 0.95 && ratio2 > 0.95) {
                                    if (ratio1 > maxOverlapRatio) {
                                        maxOverlapRatio = ratio1;
                                        bestMatchId = op.idpo;
                                    }
                                }
                            }
                        }
                    }
                }
                
                if (bestMatchId !== null) {
                    mappedPolys.push({ poly, idpo: bestMatchId, isNew: false, sqlVar: bestMatchId });
                    usedOldPolyIds.add(bestMatchId);
                } else {
                    mappedPolys.push({ poly, isNew: true, sqlVar: `@NewPoly_${poly.id}` });
                }
            });

            autoTopoSQL.push(`BEGIN TRANSACTION;`);
            
            let deletedPolys = [...allOldPolyIds].filter(x => !usedOldPolyIds.has(x));
            let deletedArcs = [...allOldArcIds].filter(x => !usedOldArcIds.has(x));
            let deletedNodes = [...allOldNodeIds].filter(x => !usedOldNodeIds.has(x));

            // Chỉ xóa TOPO_POLY_ARC cho những đa giác trong tập target bị liên quan
            let affectedPolyIds = new Set([...allOldPolyIds]); // Rất an toàn khi xóa sạch liên kết trong Local
            if (affectedPolyIds.size > 0) {
                autoTopoSQL.push(`DELETE FROM TOPO_POLY_ARC WHERE IDPO IN (${[...affectedPolyIds].join(',')});`);
            }
            if (allOldArcIds.size > 0) {
                autoTopoSQL.push(`UPDATE TOPO_ARC SET IDPOL = NULL, IDPOR = NULL WHERE IDA IN (${[...allOldArcIds].join(',')});`);
            }

            if (deletedPolys.length > 0) {
                autoTopoSQL.push(`DELETE FROM TOPO_POLY WHERE IDPO IN (${deletedPolys.join(',')});`);
            }

            if (deletedArcs.length > 0) {
                let delArcStr = deletedArcs.join(',');
                autoTopoSQL.push(`DELETE FROM TOPO_ARC_POINT WHERE IDA IN (${delArcStr});`);
                autoTopoSQL.push(`DELETE FROM TOPO_ARC WHERE IDA IN (${delArcStr});`);
            }

            if (deletedNodes.length > 0) {
                let delNodeStr = deletedNodes.join(',');
                autoTopoSQL.push(`DECLARE @DelPoints TABLE (IDP INT);`);
                autoTopoSQL.push(`INSERT INTO @DelPoints SELECT IDP FROM TOPO_NODE WHERE IDN IN (${delNodeStr});`);
                autoTopoSQL.push(`DELETE FROM TOPO_NODE WHERE IDN IN (${delNodeStr});`);
                autoTopoSQL.push(`DELETE FROM TOPO_POINT WHERE IDP IN (SELECT IDP FROM @DelPoints) AND IDP NOT IN (SELECT IDP FROM TOPO_NODE) AND IDP NOT IN (SELECT IDP FROM TOPO_ARC_POINT);`);
            }

            mappedNodes.forEach((mn, nk) => {
                if (mn.isNew) {
                    let n = graph.get(nk).pt;
                    let varPS = `TNode_P_${mn.sqlVar}`; 
                    autoTopoSQL.push(getPtSql(n, `Node_${mn.sqlVar}`, varPS));
                    autoTopoSQL.push(`DECLARE @${mn.sqlVar} INT;`);
                    autoTopoSQL.push(`INSERT INTO TOPO_NODE (IDP, NAME, CATEGORY) VALUES (@${varPS}, N'Node_New', N'Junction');`);
                    autoTopoSQL.push(`SET @${mn.sqlVar} = SCOPE_IDENTITY();`);
                }
            });

            mappedPolys.forEach(mp => {
                if (mp.isNew) {
                    autoTopoSQL.push(`DECLARE ${mp.sqlVar} INT;`);
                    autoTopoSQL.push(`INSERT INTO TOPO_POLY (NAME) VALUES (N'Polygon_${mp.poly.id}');`);
                    autoTopoSQL.push(`SET ${mp.sqlVar} = SCOPE_IDENTITY();`);
                }
            });

            mappedArcs.forEach((ma, i) => {
                let arc = ma.arc;
                let varNB = mappedNodes.get(arc.startNodeKey).sqlVar;
                let varNE = mappedNodes.get(arc.endNodeKey).sqlVar;
                let strNB = String(varNB).startsWith('TNode_N_') ? `@${varNB}` : varNB;
                let strNE = String(varNE).startsWith('TNode_N_') ? `@${varNE}` : varNE;

                let strPOL = 'NULL', strPOR = 'NULL';
                if (arc.leftPolyId) {
                    let mp = mappedPolys.find(p => p.poly.id === arc.leftPolyId);
                    strPOL = mp.isNew ? mp.sqlVar : mp.idpo;
                }
                if (arc.rightPolyId) {
                    let mp = mappedPolys.find(p => p.poly.id === arc.rightPolyId);
                    strPOR = mp.isNew ? mp.sqlVar : mp.idpo;
                }

                if (ma.isNew) {
                    autoTopoSQL.push(`DECLARE ${ma.sqlVar} INT;`);
                    autoTopoSQL.push(`INSERT INTO TOPO_ARC (IDNB, IDNE, IDPOL, IDPOR, NAME, TYPE) VALUES (${strNB}, ${strNE}, ${strPOL}, ${strPOR}, N'Arc_${i+1}', N'Line');`);
                    autoTopoSQL.push(`SET ${ma.sqlVar} = SCOPE_IDENTITY();`);
                    
                    if (arc.path.length > 2) {
                        for (let k = 1; k < arc.path.length - 1; k++) {
                            let vP = `TArcPt_${i}_${k}`;
                            autoTopoSQL.push(getPtSql(arc.path[k], `Vertex_${i}_${k}`, vP));
                            autoTopoSQL.push(`INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (${ma.sqlVar}, @${vP}, ${k});`);
                        }
                    }
                } else {
                    autoTopoSQL.push(`UPDATE TOPO_ARC SET IDPOL = ${strPOL}, IDPOR = ${strPOR} WHERE IDA = ${ma.ida};`);
                }
            });

            mappedPolys.forEach(mp => {
                let strPO = mp.isNew ? mp.sqlVar : mp.idpo;
                mp.poly.cycle.forEach((c, stt) => {
                    let ma = mappedArcs[c.arcIndex];
                    let strIDA = ma.isNew ? ma.sqlVar : ma.ida;
                    autoTopoSQL.push(`INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES (${strPO}, ${strIDA}, ${stt+1});`);
                });
            });

            autoTopoSQL.push(`COMMIT;`);

            document.getElementById('lblTopoNodes').textContent = nodeKeys.size + " (Local)";
            document.getElementById('lblTopoArcs').textContent = atomicArcs.length + " (Local)";
            document.getElementById('lblTopoPolys').textContent = polygons.length + " (Local)";
            
            document.getElementById('autoTopoLoading').style.display = 'none';
            document.getElementById('autoTopoResult').style.display = 'block';
            document.getElementById('btnConfirmAutoTopo').disabled = false;

            AppState.autoTopoSQL = autoTopoSQL;

        }, 500);
    } catch (err) {
        console.error("Lỗi khi xây dựng Topo Cục bộ:", err);
        alert("Lỗi: " + err.message);
        if(document.getElementById('autoTopoLoading')) document.getElementById('autoTopoLoading').style.display = 'none';
    }
}
