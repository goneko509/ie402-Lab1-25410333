/**
 * @module spatialDetectPoly
 * @description Module dò tìm và tạo Polygon tự động từ các cung (arcs) giao nhau.
 * Điều kiện đầu ra: Cung cấp giao diện để quét chọn các cung, tìm chu trình khép kín (cycles) và đề xuất tạo Đa giác mới.
 */

export function initDetectPoly(view, graphicsLayer, Graphic, geometryEngine, webMercatorUtils, AppState, sketch) {
    const btnDetectPoly = document.getElementById('btnDetectPoly');
    const detectedPolyModal = new bootstrap.Modal(document.getElementById('detectedPolyModal'));

    if (btnDetectPoly) {
        btnDetectPoly.addEventListener('click', function() {
            AppState.isSpatialDetectPolyMode = true;
            sketch.create('rectangle');
        });
    }

    window.runDetectPoly = function(boundingGeometry) {
        // Lấy tất cả các Cung (Polyline) đã được ghi nhận (có db_id, tức là đã lưu vào DB hoặc lưu tạm vào script)
        let arcs = graphicsLayer.graphics.filter(g => g.geometry.type === 'polyline' && g.attributes && g.attributes.db_id).items;
        
        if (boundingGeometry) {
            let bufferedSelection = boundingGeometry;
            if (boundingGeometry.spatialReference && boundingGeometry.spatialReference.isWebMercator) {
                bufferedSelection = webMercatorUtils.webMercatorToGeographic(boundingGeometry);
            }
            try {
                bufferedSelection = geometryEngine.buffer(bufferedSelection, 1e-6, "degrees");
            } catch(e) {}
            
            arcs = arcs.filter(g => {
                let graphicGeom = g.geometry;
                if (graphicGeom.spatialReference && graphicGeom.spatialReference.isWebMercator) {
                    graphicGeom = webMercatorUtils.webMercatorToGeographic(graphicGeom);
                }
                return geometryEngine.intersects(graphicGeom, bufferedSelection);
            });
        }
        
        const nodes = [];
        const TOLERANCE = 0.000001;
        function getNodeId(pt) {
            for (let i = 0; i < nodes.length; i++) {
                if (Math.abs(nodes[i].x - pt[0]) <= TOLERANCE && Math.abs(nodes[i].y - pt[1]) <= TOLERANCE) {
                    return i;
                }
            }
            nodes.push({ x: pt[0], y: pt[1] });
            return nodes.length - 1;
        }

        const adj = {};
        arcs.forEach((g, idx) => {
            g._tempId = idx; // Gán ID tạm để phân biệt các Arc
            const a = g.attributes;
            
            // Nếu Arc đã nằm trong 2 Đa giác (trái, phải) rồi thì bỏ qua
            const polyL = (a.PolyLeft !== undefined) ? a.PolyLeft : a.IDPOL;
            const polyR = (a.PolyRight !== undefined) ? a.PolyRight : a.IDPOR;
            if (polyL != null && polyR != null) return;
            
            const path = g.geometry.paths[0];
            if (!path || path.length < 2) return;
            
            const S = path[0];
            const E = path[path.length - 1];
            
            const idS = getNodeId(S);
            const idE = getNodeId(E);
            
            if (!adj[idS]) adj[idS] = [];
            if (!adj[idE]) adj[idE] = [];
            
            adj[idS].push({ node: idE, arc: g, forward: true });
            if (idS !== idE) {
                adj[idE].push({ node: idS, arc: g, forward: false });
            }
        });
        
        const cycles = [];
        const visitedCycles = new Set();
        
        for (const startStr in adj) {
            const startNode = parseInt(startStr);
            const stack = [ { current: startNode, path: [], arcsPath: [] } ];
            
            while (stack.length > 0) {
                const { current, path, arcsPath } = stack.pop();
                
                if (path.length > 0 && current === startNode) {
                    const arcIds = arcsPath.map(a => a.arc._tempId).sort().join(',');
                    if (!visitedCycles.has(arcIds)) {
                        // Khôi phục hình học của cycle để kiểm tra
                        let ring = [];
                        arcsPath.forEach((aObj, idx) => {
                            let g = aObj.arc;
                            let p = [...g.geometry.paths[0]];
                            if (ring.length > 0) {
                                const lastPt = ring[ring.length - 1];
                                const pFirst = p[0];
                                const pLast = p[p.length - 1];
                                const distFirst = Math.pow(lastPt[0]-pFirst[0],2) + Math.pow(lastPt[1]-pFirst[1],2);
                                const distLast = Math.pow(lastPt[0]-pLast[0],2) + Math.pow(lastPt[1]-pLast[1],2);
                                if (distLast < distFirst) p.reverse();
                            }
                            if (idx > 0) p.shift();
                            ring.push(...p);
                        });
                        
                        if (ring.length > 0 && (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])) {
                            ring.push(ring[0]);
                        }
                        
                        let uniquePts = new Set();
                        ring.forEach(pt => uniquePts.add(`${pt[0].toFixed(6)}_${pt[1].toFixed(6)}`));
                        
                        let area = 0;
                        for (let i = 0; i < ring.length - 1; i++) {
                            let p1 = ring[i];
                            let p2 = ring[i+1];
                            area += (p1[0]*p2[1] - p2[0]*p1[1]);
                        }
                        let isCCW = (area / 2) > 0;
                        area = Math.abs(area / 2);

                        if (uniquePts.size >= 3 && area > 1e-11) {
                            visitedCycles.add(arcIds);
                            cycles.push({ path: arcsPath, isCCW: isCCW });
                        }
                    }
                    continue;
                }
                
                if (path.includes(current)) continue;
                
                const newPath = [...path, current];
                const neighbors = adj[current] || [];
                
                for (const neighbor of neighbors) {
                    // Tránh quay lại ngay cung vừa đi qua
                    if (arcsPath.length > 0 && arcsPath[arcsPath.length - 1].arc._tempId === neighbor.arc._tempId) {
                        continue;
                    }
                    stack.push({
                        current: neighbor.node,
                        path: newPath,
                        arcsPath: [...arcsPath, { arc: neighbor.arc, forward: neighbor.forward }]
                    });
                }
            }
        }
        
        const listEl = document.getElementById('detectPolyList');
        const msgEl = document.getElementById('detectPolyMsg');
        listEl.innerHTML = '';
        
        if (cycles.length === 0) {
            msgEl.textContent = 'Không tìm thấy vòng khép kín nào từ các Cung hiện tại (hoặc các Cung đã thuộc Đa giác khác).';
        } else {
            msgEl.textContent = `Tìm thấy ${cycles.length} khả năng tạo thành Đa giác.`;
            cycles.forEach((cycle, index) => {
                const btn = document.createElement('button');
                btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                const arcNames = cycle.path.map(aObj => aObj.arc.attributes.Name || aObj.arc.attributes.db_id || 'Arc_Mới').join(' ➜ ');
                btn.innerHTML = `<span><b>Đa giác tiềm năng ${index + 1}:</b> gồm Cung [${arcNames}]</span> 
                                 <span class="badge bg-primary rounded-pill">Tạo Polygon</span>`;
                
                btn.addEventListener('click', () => {
                    detectedPolyModal.hide();
                    
                    let ring = [];
                    cycle.path.forEach((aObj, idx) => {
                        let g = aObj.arc;
                        let p = [...g.geometry.paths[0]];
                        if (ring.length > 0) {
                            const lastPt = ring[ring.length - 1];
                            const pFirst = p[0];
                            const pLast = p[p.length - 1];
                            
                            const distFirst = Math.pow(lastPt[0]-pFirst[0],2) + Math.pow(lastPt[1]-pFirst[1],2);
                            const distLast = Math.pow(lastPt[0]-pLast[0],2) + Math.pow(lastPt[1]-pLast[1],2);
                            
                            if (distLast < distFirst) {
                                p.reverse();
                            }
                        }
                        if (idx > 0) p.shift();
                        ring.push(...p);
                    });
                    
                    if (ring.length > 0 && (ring[0][0] !== ring[ring.length-1][0] || ring[0][1] !== ring[ring.length-1][1])) {
                        ring.push(ring[0]);
                    }
                    
                    const polyGraphic = new Graphic({
                        geometry: { type: 'polygon', rings: [ring], spatialReference: { wkid: 4326 } },
                        symbol: { type: 'simple-fill', color: [51, 153, 102, 0.35], outline: { color: [51, 153, 102], width: 2 } },
                        attributes: { isProcessingNew: true, fromDetectedCycle: true, cycleArcs: cycle.path, isCCW: cycle.isCCW }
                    });
                    
                    graphicsLayer.add(polyGraphic);
                    AppState.currentNewGraphic = polyGraphic;
                    
                    document.querySelector('#attrModal .modal-title').textContent = 'Thông tin Đa giác (Tự động tạo)';
                    document.getElementById('f_uid').value = Date.now();
                    document.getElementById('f_name').value = `Đa giác ${index + 1}`;
                    document.getElementById('f_category').value = 'Được tạo tự động';
                    const attrModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('attrModal'));
                    attrModal.show();
                });
                listEl.appendChild(btn);
            });
        }
        
        detectedPolyModal.show();
    };
}
