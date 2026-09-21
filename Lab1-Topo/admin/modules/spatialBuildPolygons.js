/**
 * @module spatialBuildPolygons
 * @description Xây dựng Polygon (Faces) từ mạng lưới Node/Arc đã có sẵn thông qua DCEL.
 */
export function initBuildPolygons(view, graphicsLayer, webMercatorUtils, AppState) {
    const btnBuildPolygons = document.getElementById('btnBuildPolygons');
    
    if (btnBuildPolygons) {
        btnBuildPolygons.addEventListener('click', function() {
            // Find all arcs
            const activeArcs = graphicsLayer.graphics.filter(g => g.geometry.type === 'polyline').toArray().map(g => {
                let geom = g.geometry;
                if (geom.spatialReference.isWebMercator) {
                    geom = webMercatorUtils.webMercatorToGeographic(geom);
                }
                return {
                    path: [...geom.paths[0]],
                    name: g.attributes.Name || 'AutoArc',
                    db_id: g.attributes.db_id
                };
            });
            
            if (activeArcs.length === 0) {
                alert("Không có cung nào để tạo đa giác!");
                return;
            }

            let nodes = [];
            function addNode(pt) {
                for (let i = 0; i < nodes.length; i++) {
                    if (Math.abs(nodes[i][0] - pt[0]) < 1e-6 && Math.abs(nodes[i][1] - pt[1]) < 1e-6) return i;
                }
                nodes.push(pt);
                return nodes.length - 1;
            }

            activeArcs.forEach(a => {
                addNode(a.path[0]);
                addNode(a.path[a.path.length - 1]);
            });

            // 6. Xây dựng Half-Edge Data Structure (DCEL)
            let halfEdges = [];
            let nodeOutEdges = nodes.map(() => []);

            activeArcs.forEach((arc, idx) => {
                if (!arc.db_id) return; // Chỉ lấy các Arc đã có trong DB
                
                let pS = arc.path[0];
                let pE = arc.path[arc.path.length - 1];
                let idxS = nodes.findIndex(n => Math.abs(n[0]-pS[0]) < 1e-6 && Math.abs(n[1]-pS[1]) < 1e-6);
                let idxE = nodes.findIndex(n => Math.abs(n[0]-pE[0]) < 1e-6 && Math.abs(n[1]-pE[1]) < 1e-6);
                
                let p1 = arc.path[1];
                let angleS = Math.atan2(p1[1] - pS[1], p1[0] - pS[0]);
                let p2 = arc.path[arc.path.length - 2];
                let angleE = Math.atan2(p2[1] - pE[1], p2[0] - pE[0]);
                
                let he1 = { id: idx*2, arcId: idx, db_id: arc.db_id, arc: arc, start: idxS, end: idxE, angle: angleS, visited: false, path: arc.path, forward: true };
                let he2 = { id: idx*2+1, arcId: idx, db_id: arc.db_id, arc: arc, start: idxE, end: idxS, angle: angleE, visited: false, path: [...arc.path].reverse(), forward: false };
                
                he1.twin = he2; he2.twin = he1;
                halfEdges.push(he1, he2);
                nodeOutEdges[idxS].push(he1);
                nodeOutEdges[idxE].push(he2);
            });

            // Sắp xếp CCW để tìm "Next Right" turn
            nodeOutEdges.forEach(outList => {
                outList.sort((a, b) => a.angle - b.angle);
                for(let i=0; i<outList.length; i++) {
                    outList[i].nextRight = outList[(i + 1) % outList.length];
                }
            });

            // 7. Extract Faces (Polygons)
            let faces = [];
            for (let he of halfEdges) {
                if (he.visited) continue;
                
                let startHE = he;
                let currHE = he;
                let faceHEs = [];
                
                do {
                    currHE.visited = true;
                    faceHEs.push(currHE);
                    if (currHE.twin && currHE.twin.nextRight) {
                        currHE = currHE.twin.nextRight; // Sharpest Right turn (CW traversal)
                    } else {
                        break;
                    }
                } while (currHE !== startHE);
                
                if (currHE !== startHE) continue; // Broken topology
                
                // Tính diện tích
                let area = 0;
                faceHEs.forEach(h => {
                    for (let i = 0; i < h.path.length - 1; i++) {
                        let p1 = h.path[i];
                        let p2 = h.path[i+1];
                        area += (p1[0]*p2[1] - p2[0]*p1[1]);
                    }
                });
                area = area / 2;
                
                let arcCount = {};
                faceHEs.forEach(h => {
                    arcCount[h.arcId] = (arcCount[h.arcId] || 0) + 1;
                });
                
                let validHEs = faceHEs.filter(h => arcCount[h.arcId] === 1);
                
                let uniquePts = new Set();
                validHEs.forEach(h => {
                    h.path.forEach(pt => uniquePts.add(`${pt[0]}_${pt[1]}`));
                });

                if (area < -1e-11 && uniquePts.size >= 3) {
                    faces.push({ halfEdges: validHEs, area: Math.abs(area) });
                }
            }

            if (faces.length === 0) {
                alert("Không tìm thấy đa giác khép kín nào hợp lệ!");
                return;
            }

            // Sinh SQL
            AppState.sqlScriptLines = [];
            AppState.sqlScriptLines.push(`BEGIN TRANSACTION;`);
            AppState.sqlScriptLines.push(`DELETE FROM TOPO_POLY_ARC;`);
            AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOL=NULL, IDPOR=NULL;`);
            AppState.sqlScriptLines.push(`DELETE FROM TOPO_POLY;`);

            faces.forEach((face, fIdx) => {
                let polyIdVar = `@NewPoly_${fIdx}`;
                AppState.sqlScriptLines.push(`-- Tạo Đa giác mới`);
                AppState.sqlScriptLines.push(`DECLARE ${polyIdVar} INT;`);
                AppState.sqlScriptLines.push(`INSERT INTO TOPO_POLY (NAME, LOCATION, IDR) VALUES (N'Đa giác Auto ${fIdx+1}', N'AutoTopo', NULL);`);
                AppState.sqlScriptLines.push(`SET ${polyIdVar} = SCOPE_IDENTITY();`);
                
                let addedArcs = new Set();
                face.halfEdges.forEach((he, order) => {
                    let arcId = he.db_id; // real db_id
                    
                    if (he.forward) { // Hướng xuôi chiều -> Đa giác bên Phải
                        AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOR = ${polyIdVar} WHERE IDA = ${arcId} AND IDPOR IS NULL;`);
                    } else { // Hướng ngược chiều -> Đa giác bên Trái
                        AppState.sqlScriptLines.push(`UPDATE TOPO_ARC SET IDPOL = ${polyIdVar} WHERE IDA = ${arcId} AND IDPOL IS NULL;`);
                    }
                    
                    if (!addedArcs.has(arcId)) {
                        addedArcs.add(arcId);
                        AppState.sqlScriptLines.push(`INSERT INTO TOPO_POLY_ARC (IDPO, IDA, STT) VALUES (${polyIdVar}, ${arcId}, ${addedArcs.size});`);
                    }
                });
            });
            
            AppState.sqlScriptLines.push(`COMMIT;`);

            // Execute SQL immediately
            if (window.executeSQLScript) {
                window.executeSQLScript();
                // We shouldn't show alert here because toast handles it
            } else {
                alert("Đã sinh kịch bản SQL nhưng không tìm thấy hàm lưu DB.");
            }
        });
    }
}
