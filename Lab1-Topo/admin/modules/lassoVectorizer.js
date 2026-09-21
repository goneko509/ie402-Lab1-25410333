/**
 * @module lassoVectorizer
 * @description Module tự động số hóa Cung/Nút từ dữ liệu OpenStreetMap (OSM) theo dạng Vector (tránh dùng Raster quét pixel).
 */

import { getPtSql } from './sqlGenerator.js';

let previewGraphics = [];

export function initLassoVectorizer(view, graphicsLayer, Graphic, AppState, sketch, geometryEngine, webMercatorUtils) {
    const btnVectorize = document.getElementById('btn-vectorize-lasso');
    if (!btnVectorize) return;

    // 1. Kích hoạt vẽ Lasso khi bấm nút
    btnVectorize.addEventListener('click', () => {
        AppState.currentInteractionMode = "LASSO_VECTORIZE";
        sketch.create("polygon", { mode: "freehand" });
    });

    // Bắt sự kiện hoàn thành vẽ Lasso
    sketch.on('create', (event) => {
        if (event.state === 'complete' && AppState.currentInteractionMode === 'LASSO_VECTORIZE') {
            AppState.currentInteractionMode = null;
            AppState.lvLassoPolygon = event.graphic.geometry;
            
            // Xóa graphic Lasso khỏi màn hình an toàn sau khi Sketch hoàn tất
            setTimeout(() => {
                if (graphicsLayer.graphics.includes(event.graphic)) {
                    graphicsLayer.remove(event.graphic);
                }
            }, 50);
            
            // Hiển thị modal cấu hình
            const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('lassoVectorizeModal'));
            modal.show();
            
            document.getElementById('lvResult').style.display = 'none';
            document.getElementById('btnConfirmLassoVector').disabled = true;
        }
    });

    document.getElementById('btnPreviewLassoVector')?.addEventListener('click', async () => {
        const lassoPolygon = AppState.lvLassoPolygon;
        if (!lassoPolygon) {
            alert("Vui lòng khoanh vùng Lasso trước!");
            return;
        }

        const loading = document.getElementById('lvLoading');
        const resultDiv = document.getElementById('lvResult');
        const btnConfirm = document.getElementById('btnConfirmLassoVector');
        
        // Ngưỡng gom nhóm (Tolerance) nhập vào là mét
        const toleranceMeters = parseFloat(document.getElementById('lvTolerance').value) || 10;
        
        loading.style.display = 'block';
        resultDiv.style.display = 'none';
        btnConfirm.disabled = true;
        
        // Xóa preview cũ
        graphicsLayer.removeMany(previewGraphics);
        previewGraphics = [];

        try {
            // Đảm bảo lassoPolygon ở dạng Geographic (4326) để gọi API và cắt
            let clipPolygon = lassoPolygon;
            if (lassoPolygon.spatialReference.wkid !== 4326 && lassoPolygon.spatialReference.isWebMercator) {
                clipPolygon = webMercatorUtils.webMercatorToGeographic(lassoPolygon);
            } else if (lassoPolygon.spatialReference.wkid !== 4326) {
                alert("Hệ tọa độ của bản đồ không được hỗ trợ (không phải WebMercator hoặc WGS84).");
                loading.style.display = 'none';
                btnConfirm.disabled = false;
                return;
            }

            // Bước 1: Truy vấn Dữ liệu Vector OSM
            const extent = clipPolygon.extent;
            
            // Validate kích thước vùng khoanh để tránh Timeout
            const widthDeg = extent.xmax - extent.xmin;
            const heightDeg = extent.ymax - extent.ymin;
            if (widthDeg > 0.015 || heightDeg > 0.015) {
                loading.style.display = 'none';
                btnConfirm.disabled = false;
                alert("Vùng khoanh quá rộng (vượt quá 1.5km). Vui lòng vẽ Lasso nhỏ gọn quanh ngã tư/con đường cụt để tránh tải quá tải API.");
                return;
            }

            // Optimize query syntax
            const osmQuery = `
                [out:json][timeout:25];
                (
                  way["highway"](${extent.ymin},${extent.xmin},${extent.ymax},${extent.xmax});
                );
                out body;
                >;
                out skel qt;
            `;
            
            const endpoints = [
                "https://overpass-api.de/api/interpreter",
                "https://overpass.kumi.systems/api/interpreter",
                "https://overpass.openstreetmap.ru/api/interpreter"
            ];
            
            let data = null;
            let lastError = null;
            
            for (let url of endpoints) {
                try {
                    console.log("Đang thử kết nối Overpass API: " + url);
                    const response = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        body: "data=" + encodeURIComponent(osmQuery)
                    });
                    
                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Mã lỗi ${response.status}: ${response.statusText}. Chi tiết: ${text.substring(0, 100)}`);
                    }
                    
                    data = await response.json();
                    break; // Thành công, thoát vòng lặp fallback
                } catch (e) {
                    console.warn("Lỗi với endpoint " + url + ": " + e.message);
                    lastError = e;
                }
            }
            
            if (!data) {
                throw new Error("Tất cả các máy chủ Overpass API đều bận hoặc không phản hồi. Vui lòng thử lại sau. Lỗi cuối cùng: " + lastError.message);
            }
            
            // Map node IDs to coordinates
            const nodesMap = new Map();
            data.elements.forEach(el => {
                if (el.type === "node") {
                    nodesMap.set(el.id, [el.lon, el.lat]); // [lon, lat] for ArcGIS
                }
            });
            
            // Xây dựng các đường Polyline
            let osmPaths = [];
            data.elements.forEach(el => {
                if (el.type === "way" && el.nodes) {
                    let path = [];
                    el.nodes.forEach(nId => {
                        if (nodesMap.has(nId)) path.push(nodesMap.get(nId));
                    });
                    if (path.length > 1) {
                        osmPaths.push(path);
                    }
                }
            });

            if (osmPaths.length === 0) {
                loading.style.display = 'none';
                alert("Không tìm thấy dữ liệu đường giao thông nào trong khu vực này.");
                return;
            }

            // Gộp tất cả paths vào 1 Polyline để cắt
            const streetsPolyline = {
                type: "polyline",
                paths: osmPaths,
                spatialReference: { wkid: 4326 }
            };
            
            // Bước 2: Cắt (Clip) bằng geometryEngine
            const clippedGeometry = geometryEngine.intersect(streetsPolyline, clipPolygon);
            
            if (!clippedGeometry || !clippedGeometry.paths || clippedGeometry.paths.length === 0) {
                loading.style.display = 'none';
                alert("Vùng khoanh (Lasso) không chứa đoạn đường nào.");
                return;
            }
            
            // Bước 3: Tìm giao điểm & Phân tách mạng lưới Topology
            const topology = extractTopology(clippedGeometry.paths, toleranceMeters);
            
            // Bước 4: Render Preview
            renderPreview(topology.nodes, topology.arcs, graphicsLayer, Graphic);
            
            loading.style.display = 'none';
            resultDiv.style.display = 'block';
            document.getElementById('lvNodeCount').textContent = topology.nodes.length;
            document.getElementById('lvArcCount').textContent = topology.arcs.length;
            
            btnConfirm.disabled = false;
            
            // Lưu tạm vào AppState
            AppState.previewVectorNodes = topology.nodes;
            AppState.previewVectorArcs = topology.arcs;

        } catch (err) {
            console.error("Lỗi xử lý Lasso Vector:", err);
            alert("Lỗi tải/xử lý OSM: " + err.message);
            loading.style.display = 'none';
        }
    });

    document.getElementById('btnConfirmLassoVector')?.addEventListener('click', () => {
        if (!AppState.previewVectorNodes || !AppState.previewVectorArcs) return;
        
        // Sinh SQL từ dữ liệu vector hóa
        AppState.sqlScriptLines = generateSQLFromVector(AppState.previewVectorNodes, AppState.previewVectorArcs, AppState);
        
        if (window.executeSQLScript) {
            window.executeSQLScript();
        }
        
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('lassoVectorizeModal'));
        modal.hide();
        
        // Xóa sạch preview
        graphicsLayer.removeMany(previewGraphics);
        previewGraphics = [];
        AppState.previewVectorNodes = null;
        AppState.previewVectorArcs = null;
    });
    
    document.getElementById('lassoVectorizeModal')?.addEventListener('hidden.bs.modal', () => {
        if (previewGraphics.length > 0) {
            graphicsLayer.removeMany(previewGraphics);
            previewGraphics = [];
        }
    });
}

function haversineDistance(lon1, lat1, lon2, lat2) {
    const R = 6371e3; // meters
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function extractTopology(paths, toleranceMeters) {
    let allPoints = [];
    
    // Thu thập tất cả các đỉnh
    paths.forEach(path => {
        path.forEach(pt => {
            allPoints.push(pt);
        });
    });
    
    // Cluster các điểm quá gần nhau (Snapping)
    let clusters = []; // mảng các cụm, mỗi cụm là 1 điểm [lon, lat] đại diện
    let pointToCluster = new Map(); // key = "lon,lat" string, value = cluster index
    
    allPoints.forEach(pt => {
        const ptStr = `${pt[0]},${pt[1]}`;
        if (pointToCluster.has(ptStr)) return;
        
        let foundClusterIdx = -1;
        for (let i = 0; i < clusters.length; i++) {
            let c = clusters[i];
            let dist = haversineDistance(pt[0], pt[1], c[0], c[1]);
            if (dist <= toleranceMeters) {
                foundClusterIdx = i;
                break;
            }
        }
        
        if (foundClusterIdx !== -1) {
            pointToCluster.set(ptStr, foundClusterIdx);
        } else {
            clusters.push([pt[0], pt[1]]);
            pointToCluster.set(ptStr, clusters.length - 1);
        }
    });
    
    // Đếm bậc (degree) của các cluster để tìm Nút giao
    // Một điểm là TOPO_NODE nếu degree >= 3 hoặc == 1 (đầu mút)
    let degreeCount = new Array(clusters.length).fill(0);
    
    // Cấu trúc lại mảng path bằng cluster index
    let clusterPaths = [];
    paths.forEach(path => {
        let cPath = [];
        path.forEach(pt => {
            const ptStr = `${pt[0]},${pt[1]}`;
            const cIdx = pointToCluster.get(ptStr);
            // Bỏ các điểm trùng liền kề trong cùng 1 cụm
            if (cPath.length === 0 || cPath[cPath.length - 1] !== cIdx) {
                cPath.push(cIdx);
            }
        });
        if (cPath.length > 1) {
            clusterPaths.push(cPath);
        }
    });
    
    clusterPaths.forEach(cPath => {
        // Cộng degree cho 2 đầu mút (degree = 1)
        degreeCount[cPath[0]]++;
        degreeCount[cPath[cPath.length - 1]]++;
        
        // Cộng degree cho các điểm ở giữa (degree = 2)
        for (let i = 1; i < cPath.length - 1; i++) {
            degreeCount[cPath[i]] += 2;
        }
    });
    
    // Xác định Node
    let isTopoNode = new Array(clusters.length).fill(false);
    let topoNodes = [];
    
    for (let i = 0; i < clusters.length; i++) {
        // Đầu mút (1), hoặc giao điểm thực sự (>= 3)
        // Những điểm degree = 2 chỉ là điểm uốn trung gian
        if (degreeCount[i] === 1 || degreeCount[i] >= 3) {
            isTopoNode[i] = true;
            topoNodes.push({
                id: i,
                geo: clusters[i]
            });
        }
    }
    
    // Nếu một mạch kín không có node nào (như vòng xoay độc lập), ép chọn 1 điểm làm node
    if (topoNodes.length === 0 && clusterPaths.length > 0) {
        let firstNode = clusterPaths[0][0];
        isTopoNode[firstNode] = true;
        topoNodes.push({ id: firstNode, geo: clusters[firstNode] });
    }
    
    // Bẻ các đoạn cong (path) dài thành các Cung nguyên tử
    let topoArcs = [];
    clusterPaths.forEach(cPath => {
        let currentArcPoints = [clusters[cPath[0]]];
        let startNodeIdx = cPath[0];
        
        for (let i = 1; i < cPath.length; i++) {
            let cIdx = cPath[i];
            currentArcPoints.push(clusters[cIdx]);
            
            if (isTopoNode[cIdx]) {
                // Đã tới điểm chặn (Node) => Chốt Arc này
                let endNodeIdx = cIdx;
                
                // Ramer-Douglas-Peucker đơn giản hóa các điểm giữa
                let simplifiedArc = ramerDouglasPeuckerGeo(currentArcPoints, 1.0); // 1 meter epsilon
                
                topoArcs.push(simplifiedArc);
                
                // Bắt đầu Cung tiếp theo
                currentArcPoints = [clusters[cIdx]];
                startNodeIdx = cIdx;
            }
        }
    });
    
    return { nodes: topoNodes, arcs: topoArcs };
}

// Ramer-Douglas-Peucker on geographic coordinates (in meters)
function ramerDouglasPeuckerGeo(points, epsilonMeters) {
    if (points.length <= 2) return points;
    
    let dmax = 0;
    let index = 0;
    const end = points.length - 1;
    
    for (let i = 1; i < end; i++) {
        let d = perpendicularDistanceGeo(points[i], points[0], points[end]);
        if (d > dmax) {
            index = i;
            dmax = d;
        }
    }
    
    if (dmax > epsilonMeters) {
        let left = ramerDouglasPeuckerGeo(points.slice(0, index + 1), epsilonMeters);
        let right = ramerDouglasPeuckerGeo(points.slice(index), epsilonMeters);
        return left.slice(0, left.length - 1).concat(right);
    } else {
        return [points[0], points[end]];
    }
}

function perpendicularDistanceGeo(pt, lineStart, lineEnd) {
    // Đơn giản hóa khoảng cách bằng cách chiếu nhanh (xấp xỉ phẳng)
    // 1 độ ~ 111320 mét
    const rad = Math.PI / 180;
    const cosLat = Math.cos(lineStart[1] * rad);
    
    let x0 = pt[0] * 111320 * cosLat, y0 = pt[1] * 111320;
    let x1 = lineStart[0] * 111320 * cosLat, y1 = lineStart[1] * 111320;
    let x2 = lineEnd[0] * 111320 * cosLat, y2 = lineEnd[1] * 111320;
    
    let area = Math.abs(0.5 * (x1 * (y2 - y0) + x2 * (y0 - y1) + x0 * (y1 - y2)));
    let bottom = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
    if (bottom === 0) return Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
    
    return area / bottom * 2;
}

function renderPreview(nodes, arcs, graphicsLayer, Graphic) {
    const nodeSymbol = {
        type: "simple-marker",
        color: [255, 0, 0, 0.9],
        size: 9,
        outline: { color: [255, 255, 255], width: 1.5 }
    };
    
    const arcSymbol = {
        type: "simple-line",
        color: [0, 200, 255, 0.9],
        width: 3
    };

    arcs.forEach(arcPath => {
        let g = new Graphic({
            geometry: { type: "polyline", paths: [arcPath] },
            symbol: arcSymbol,
            attributes: { isPreview: true }
        });
        previewGraphics.push(g);
        graphicsLayer.add(g);
    });

    nodes.forEach(node => {
        let g = new Graphic({
            geometry: { type: "point", longitude: node.geo[0], latitude: node.geo[1] },
            symbol: nodeSymbol,
            attributes: { isPreview: true }
        });
        previewGraphics.push(g);
        graphicsLayer.add(g);
    });
}

function generateSQLFromVector(nodes, arcs, AppState) {
    let sqlLines = [];
    sqlLines.push("BEGIN TRANSACTION;");
    sqlLines.push("-- [LASSO VECTORIZER] Tự động số hóa Vector OSM");
    
    let nodeMap = new Map(); // "lon,lat" -> var name
    
    nodes.forEach((node, idx) => {
        const lon = node.geo[0].toFixed(6);
        const lat = node.geo[1].toFixed(6);
        const ptKey = `${lon},${lat}`;
        const tempId = Date.now().toString().slice(-4) + idx;
        const varP = `IDP_Vec_${tempId}`;
        
        sqlLines.push(getPtSql(node.geo, `OsmNode_${tempId}`, varP));
        
        const varN = `IDN_Vec_${tempId}`;
        sqlLines.push(`DECLARE @${varN} INT;`);
        sqlLines.push(`IF NOT EXISTS (SELECT 1 FROM TOPO_NODE WHERE IDP = @${varP}) BEGIN`);
        sqlLines.push(`  INSERT INTO TOPO_NODE (IDP) VALUES (@${varP});`);
        sqlLines.push(`END;`);
        sqlLines.push(`SELECT @${varN} = IDN FROM TOPO_NODE WHERE IDP = @${varP};`);
        
        nodeMap.set(ptKey, { varP, varN });
    });
    
    arcs.forEach((arcPath, idx) => {
        const start = arcPath[0];
        const end = arcPath[arcPath.length - 1];
        const startKey = `${start[0].toFixed(6)},${start[1].toFixed(6)}`;
        const endKey = `${end[0].toFixed(6)},${end[1].toFixed(6)}`;
        
        const n1 = nodeMap.get(startKey);
        const n2 = nodeMap.get(endKey);
        
        if (!n1 || !n2) return;
        
        const arcName = `OsmArc_${Date.now().toString().slice(-4)}_${idx}`;
        const varA = `IDA_Vec_${idx}`;
        sqlLines.push(`DECLARE @${varA} INT;`);
        sqlLines.push(`INSERT INTO TOPO_ARC (IDNB, IDNE, NAME, TYPE) VALUES (@${n1.varN}, @${n2.varN}, N'${arcName}', N'Vectorized OSM');`);
        sqlLines.push(`SET @${varA} = SCOPE_IDENTITY();`);
        
        // Arc points (mid points)
        if (arcPath.length > 2) {
            arcPath.slice(1, -1).forEach((pt, stt) => {
                const varM = `IDP_M_${idx}_${stt}`;
                sqlLines.push(getPtSql(pt, `OsmMid_${idx}_${stt}`, varM));
                sqlLines.push(`INSERT INTO TOPO_ARC_POINT (IDA, IDP, STT) VALUES (@${varA}, @${varM}, ${stt + 1});`);
            });
        }
    });
    
    sqlLines.push("COMMIT;");
    return sqlLines;
}
